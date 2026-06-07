from dataclasses import dataclass
import concurrent.futures
import threading
from urllib.error import HTTPError

import pytest

from anacronia.collection_runs import (
    discover_met_candidates,
    discover_provider_candidates,
    get_candidate_run,
)
from anacronia.met_ingest import get_met_image_assets, get_met_skipped_candidates
from anacronia.provider_adapters import ProviderIngestRequest
from anacronia.storage import initialize_storage
from anacronia.worker import (
    CollectLockError,
    DiskSpaceError,
    cancel_collect_job,
    check_collect_job_disk_availability,
    complete_collect_job,
    get_collect_job,
    create_idle_worker_status,
    get_worker_status,
    mark_collect_candidate_processed,
    pause_collect_job,
    process_running_collect_job,
    propose_continue_after_cancel,
    record_collect_provider_failure,
    request_stop_collect_job,
    resume_collect_job,
    start_collect_job,
)


class FakeMetCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        return {"snake": [10]}[term]


class FakeMetRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        return {
            "objectID": object_id,
            "isPublicDomain": True,
            "title": "Snake Bowl",
            "objectName": "Bowl",
            "tags": [{"term": "Snake"}],
            "primaryImage": "https://images.metmuseum.org/10.jpg",
            "objectURL": "https://www.metmuseum.org/art/collection/search/10",
        }


class FakeVamCandidateClient:
    def search_object_ids(self, term: str) -> list[str]:
        return {"snake": ["O:10"]}[term]


@dataclass(frozen=True)
class FakeSkippedCandidate:
    object_id: str
    reason: str


@dataclass(frozen=True)
class FakeProviderIngestSummary:
    run_id: int
    fetched_object_ids: list[str]
    imported_object_ids: list[str]
    imported_image_count: int
    skipped_candidates: list[FakeSkippedCandidate]


class FakeVamProviderIngester:
    provider = "vam"
    display_name = "V&A"

    def __init__(self) -> None:
        self.requests: list[ProviderIngestRequest] = []

    def discover_candidate_run(self, **_kwargs):
        raise AssertionError("Worker should not discover candidates.")

    def ingest_run(self, request: ProviderIngestRequest) -> FakeProviderIngestSummary:
        self.requests.append(request)
        if request.on_candidate_processed is not None:
            request.on_candidate_processed(0)
        return FakeProviderIngestSummary(
            run_id=request.run_id,
            fetched_object_ids=["O:10"],
            imported_object_ids=["O:10"],
            imported_image_count=1,
            skipped_candidates=[],
        )


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([180, 40, 120]) * width
    return header + row * height


def test_worker_starts_idle():
    assert create_idle_worker_status() == {"service": "worker", "status": "idle"}


def test_collect_job_lock_blocks_second_job_until_paused(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"

    assert get_worker_status(database_path=database_path).status == "idle"

    first_job = start_collect_job(
        database_path=database_path,
        run_id=1,
        candidate_offset=10,
        candidate_limit=20,
        candidate_progress_total=20,
        available_disk_bytes=10_000_000,
    )

    assert get_worker_status(database_path=database_path).status == "running"

    with pytest.raises(CollectLockError):
        start_collect_job(
            database_path=database_path,
            run_id=2,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        )

    paused_job = pause_collect_job(database_path=database_path, job_id=first_job.job_id)

    assert paused_job.status == "paused"
    assert get_worker_status(database_path=database_path).status == "idle"
    second_job = start_collect_job(
        database_path=database_path,
        run_id=2,
        candidate_offset=0,
        candidate_limit=5,
        candidate_progress_total=5,
        available_disk_bytes=10_000_000,
    )
    assert second_job.run_id == 2

    with pytest.raises(CollectLockError):
        resume_collect_job(database_path=database_path, job_id=first_job.job_id)

    canceled_job = cancel_collect_job(database_path=database_path, job_id=second_job.job_id)

    assert canceled_job.status == "canceled"
    resumed_job = resume_collect_job(database_path=database_path, job_id=first_job.job_id)
    assert resumed_job.status == "running"


def test_collect_job_lock_allows_only_one_concurrent_start(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    worker_count = 8
    start_line = threading.Barrier(worker_count)

    assert get_worker_status(database_path=database_path).status == "idle"

    def start_job(run_id: int) -> str:
        start_line.wait()
        try:
            start_collect_job(
                database_path=database_path,
                run_id=run_id,
                candidate_offset=0,
                candidate_limit=5,
                candidate_progress_total=5,
                available_disk_bytes=10_000_000,
            )
        except CollectLockError:
            return "locked"
        return "running"

    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(start_job, range(1, worker_count + 1)))

    assert results.count("running") == 1
    assert results.count("locked") == worker_count - 1


def test_collect_job_lock_allows_only_one_concurrent_resume(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    worker_count = 2
    start_line = threading.Barrier(worker_count)
    first_job = pause_collect_job(
        database_path=database_path,
        job_id=start_collect_job(
            database_path=database_path,
            run_id=1,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        ).job_id,
    )
    second_job = pause_collect_job(
        database_path=database_path,
        job_id=start_collect_job(
            database_path=database_path,
            run_id=2,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        ).job_id,
    )

    def resume_job(job_id: int) -> str:
        start_line.wait()
        try:
            resume_collect_job(database_path=database_path, job_id=job_id)
        except CollectLockError:
            return "locked"
        return "running"

    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(resume_job, [first_job.job_id, second_job.job_id]))

    assert results.count("running") == 1
    assert results.count("locked") == 1


def test_collect_job_lock_allows_only_one_concurrent_start_or_resume(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    worker_count = 2
    start_line = threading.Barrier(worker_count)
    paused_job = pause_collect_job(
        database_path=database_path,
        job_id=start_collect_job(
            database_path=database_path,
            run_id=1,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        ).job_id,
    )

    def start_or_resume(action: str) -> str:
        start_line.wait()
        try:
            if action == "start":
                start_collect_job(
                    database_path=database_path,
                    run_id=2,
                    candidate_offset=0,
                    candidate_limit=5,
                    candidate_progress_total=5,
                    available_disk_bytes=10_000_000,
                )
            else:
                resume_collect_job(database_path=database_path, job_id=paused_job.job_id)
        except CollectLockError:
            return "locked"
        return "running"

    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(start_or_resume, ["start", "resume"]))

    assert results.count("running") == 1
    assert results.count("locked") == 1


def test_completed_collect_job_releases_lock_and_worker_returns_idle(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    job = start_collect_job(
        database_path=database_path,
        run_id=1,
        candidate_offset=0,
        candidate_limit=10,
        candidate_progress_total=10,
        available_disk_bytes=10_000_000,
    )

    completed_job = complete_collect_job(database_path=database_path, job_id=job.job_id)

    assert completed_job.status == "completed"
    assert get_worker_status(database_path=database_path).status == "idle"
    next_job = start_collect_job(
        database_path=database_path,
        run_id=2,
        candidate_offset=0,
        candidate_limit=5,
        candidate_progress_total=5,
        available_disk_bytes=10_000_000,
    )
    assert next_job.run_id == 2


def test_paused_collect_job_can_resume_to_running(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    job = start_collect_job(
        database_path=database_path,
        run_id=1,
        candidate_offset=0,
        candidate_limit=10,
        candidate_progress_total=10,
        available_disk_bytes=10_000_000,
    )
    pause_collect_job(database_path=database_path, job_id=job.job_id)

    resumed_job = resume_collect_job(database_path=database_path, job_id=job.job_id)

    assert resumed_job.status == "running"
    assert resumed_job.pause_reason == ""
    assert get_worker_status(database_path=database_path).status == "running"


def test_continue_after_cancel_proposes_next_offset_after_last_processed_candidate(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    job = start_collect_job(
        database_path=database_path,
        run_id=1,
        candidate_offset=25,
        candidate_limit=10,
        candidate_progress_total=10,
        available_disk_bytes=10_000_000,
    )

    mark_collect_candidate_processed(
        database_path=database_path,
        job_id=job.job_id,
        run_position=0,
    )
    mark_collect_candidate_processed(
        database_path=database_path,
        job_id=job.job_id,
        run_position=3,
    )
    cancel_collect_job(database_path=database_path, job_id=job.job_id)

    assert propose_continue_after_cancel(database_path=database_path, job_id=job.job_id) == 29


def test_disk_availability_is_checked_before_and_during_collect_jobs(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"

    with pytest.raises(DiskSpaceError):
        start_collect_job(
            database_path=database_path,
            run_id=1,
            candidate_offset=0,
            candidate_limit=10,
            candidate_progress_total=10,
            available_disk_bytes=999,
            required_disk_bytes=1_000,
        )

    job = start_collect_job(
        database_path=database_path,
        run_id=1,
        candidate_offset=0,
        candidate_limit=10,
        candidate_progress_total=10,
        available_disk_bytes=2_000,
        required_disk_bytes=1_000,
    )

    paused_job = check_collect_job_disk_availability(
        database_path=database_path,
        job_id=job.job_id,
        available_disk_bytes=500,
    )

    assert paused_job.status == "paused"
    assert paused_job.pause_reason == "insufficient_disk"
    assert paused_job.last_disk_available_bytes == 500
    next_job = start_collect_job(
        database_path=database_path,
        run_id=2,
        candidate_offset=0,
        candidate_limit=5,
        candidate_progress_total=5,
        available_disk_bytes=10_000_000,
    )
    assert next_job.run_id == 2


def test_worker_pauses_after_current_museum_object_when_disk_space_drops(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class TwoCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10, 20]

    class TrackingRecordClient(FakeMetRecordClient):
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            record = super().fetch_object_record(object_id)
            return {
                **record,
                "objectID": object_id,
                "primaryImage": f"https://images.metmuseum.org/{object_id}.jpg",
            }

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=2,
        batch_target=2,
        met_client=TwoCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        batch_target=run.batch_target,
        max_images_per_object=1,
        available_disk_bytes=2_000,
        required_disk_bytes=1_000,
    )
    available_disk_readings = iter([2_000, 500])

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=TrackingRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        available_disk_bytes=lambda: next(available_disk_readings),
    )

    assert summary is not None
    assert summary.imported_object_ids == [10]
    assert [asset.object_id for asset in get_met_image_assets(database_path=storage.database_path)] == [10]
    paused_job = get_collect_job(database_path=storage.database_path, job_id=job.job_id)
    assert paused_job.status == "paused"
    assert paused_job.pause_reason == "insufficient_disk"
    assert paused_job.last_disk_available_bytes == 500
    assert paused_job.last_processed_run_position == 0


def test_repeated_provider_failures_trigger_backoff_then_automatic_pause(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    job = start_collect_job(
        database_path=database_path,
        run_id=1,
        candidate_offset=0,
        candidate_limit=10,
        candidate_progress_total=10,
        available_disk_bytes=10_000_000,
    )

    first_failure = record_collect_provider_failure(
        database_path=database_path,
        job_id=job.job_id,
    )
    second_failure = record_collect_provider_failure(
        database_path=database_path,
        job_id=job.job_id,
    )
    third_failure = record_collect_provider_failure(
        database_path=database_path,
        job_id=job.job_id,
    )

    assert first_failure.status == "running"
    assert first_failure.provider_failure_count == 1
    assert first_failure.backoff_seconds > 0
    assert second_failure.status == "running"
    assert second_failure.provider_failure_count == 2
    assert second_failure.backoff_seconds > first_failure.backoff_seconds
    assert third_failure.status == "paused"
    assert third_failure.provider_failure_count == 3
    assert third_failure.backoff_seconds > second_failure.backoff_seconds
    assert third_failure.pause_reason == "repeated_provider_failures"
    next_job = start_collect_job(
        database_path=database_path,
        run_id=2,
        candidate_offset=0,
        candidate_limit=5,
        candidate_progress_total=5,
        available_disk_bytes=10_000_000,
    )
    assert next_job.run_id == 2


def test_worker_processes_running_collect_job_through_met_ingest(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=1,
        met_client=FakeMetCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=0,
        candidate_limit=1,
        candidate_progress_total=1,
        max_images_per_object=1,
        available_disk_bytes=10_000_000,
    )

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=FakeMetRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert summary is not None
    assert summary.imported_object_ids == [10]
    assert get_worker_status(database_path=storage.database_path).status == "idle"
    assert get_met_image_assets(database_path=storage.database_path)[0].object_id == 10
    assert process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=FakeMetRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    ) is None
    assert get_worker_status(database_path=storage.database_path).active_collect_job_id is None


def test_worker_dispatches_collect_job_to_registered_provider_ingester(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        provider="vam",
        candidate_offset=0,
        candidate_limit=1,
        candidate_client=FakeVamCandidateClient(),
        batch_target=1,
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=0,
        candidate_limit=1,
        candidate_progress_total=1,
        batch_target=1,
        max_images_per_object=2,
        available_disk_bytes=10_000_000,
    )
    vam_ingester = FakeVamProviderIngester()

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=FakeMetRecordClient(),
        provider_ingesters={"vam": vam_ingester},
    )

    assert summary is not None
    assert summary.imported_object_ids == ["O:10"]
    assert len(vam_ingester.requests) == 1
    assert vam_ingester.requests[0].run_id == run.run_id
    assert vam_ingester.requests[0].max_images_per_object == 2
    assert get_worker_status(database_path=storage.database_path).status == "idle"
    assert get_collect_job(database_path=storage.database_path, job_id=job.job_id).status == "completed"


def test_worker_skips_missing_met_object_records_without_pausing_search(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class TwoCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "car"
            return [10, 20]

    class MissingThenPublicRecordClient(FakeMetRecordClient):
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            if object_id == 10:
                raise HTTPError(
                    url="https://collectionapi.metmuseum.org/public/collection/v1/objects/10",
                    code=404,
                    msg="Not Found",
                    hdrs=None,
                    fp=None,
                )

            record = super().fetch_object_record(object_id)
            return {
                **record,
                "objectID": object_id,
                "primaryImage": f"https://images.metmuseum.org/{object_id}.jpg",
            }

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Cars",
        terms_text="car",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="cars",
        candidate_offset=0,
        candidate_limit=2,
        batch_target=1,
        met_client=TwoCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        batch_target=run.batch_target,
        max_images_per_object=1,
        available_disk_bytes=10_000_000,
    )

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=MissingThenPublicRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert summary is not None
    assert [(skipped.object_id, skipped.reason) for skipped in summary.skipped_candidates] == [
        (10, "provider_record_not_found"),
    ]
    assert summary.imported_object_ids == [20]
    assert [asset.object_id for asset in get_met_image_assets(database_path=storage.database_path)] == [20]
    assert [
        (skipped.object_id, skipped.reason)
        for skipped in get_met_skipped_candidates(
            database_path=storage.database_path,
            run_id=run.run_id,
        )
    ] == [(10, "provider_record_not_found")]
    completed_job = get_collect_job(database_path=storage.database_path, job_id=job.job_id)
    assert completed_job.status == "completed"
    assert completed_job.provider_failure_count == 0
    assert completed_job.last_processed_run_position == 1


def test_worker_retries_provider_search_after_last_processed_candidate(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class ThreeCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10, 20, 30]

    class OneFailureRecordClient(FakeMetRecordClient):
        def __init__(self) -> None:
            self.fetched_object_ids: list[int] = []
            self.failed_once = False

        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            self.fetched_object_ids.append(object_id)
            if object_id == 20 and not self.failed_once:
                self.failed_once = True
                raise RuntimeError("temporary provider failure")

            record = super().fetch_object_record(object_id)
            return {
                **record,
                "objectID": object_id,
                "primaryImage": f"https://images.metmuseum.org/{object_id}.jpg",
            }

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=3,
        batch_target=2,
        met_client=ThreeCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        batch_target=run.batch_target,
        max_images_per_object=1,
        available_disk_bytes=10_000_000,
    )
    record_client = OneFailureRecordClient()

    assert process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=record_client,
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    ) is None
    failed_job = get_collect_job(database_path=storage.database_path, job_id=job.job_id)
    assert failed_job.status == "running"
    assert failed_job.provider_failure_count == 1
    assert failed_job.last_processed_run_position == 0

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=record_client,
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert summary is not None
    assert record_client.fetched_object_ids == [10, 20, 20, 30]
    assert summary.imported_object_ids == [20, 30]
    assert [asset.object_id for asset in get_met_image_assets(database_path=storage.database_path)] == [
        10,
        20,
        30,
    ]
    completed_job = get_collect_job(database_path=storage.database_path, job_id=job.job_id)
    assert completed_job.status == "completed"
    assert completed_job.last_processed_run_position == 2


def test_worker_stops_met_ingest_after_batch_target_reaches_usable_images(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class ThreeCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10, 20, 30]

    class TrackingRecordClient(FakeMetRecordClient):
        def __init__(self) -> None:
            self.fetched_object_ids: list[int] = []

        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            self.fetched_object_ids.append(object_id)
            record = super().fetch_object_record(object_id)
            return {
                **record,
                "primaryImage": f"https://images.metmuseum.org/{object_id}.jpg",
            }

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=3,
        batch_target=2,
        met_client=ThreeCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        batch_target=run.batch_target,
        max_images_per_object=1,
        available_disk_bytes=10_000_000,
    )
    record_client = TrackingRecordClient()

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=record_client,
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert summary is not None
    assert record_client.fetched_object_ids == [10, 20]
    assert [asset.object_id for asset in get_met_image_assets(database_path=storage.database_path)] == [
        10,
        20,
    ]
    assert get_collect_job(database_path=storage.database_path, job_id=job.job_id).status == "completed"


def test_worker_stops_after_current_museum_object_when_stop_is_requested(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class ThreeCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10, 20, 30]

    class TrackingRecordClient(FakeMetRecordClient):
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            record = super().fetch_object_record(object_id)
            return {
                **record,
                "objectID": object_id,
                "primaryImage": f"https://images.metmuseum.org/{object_id}.jpg",
            }

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=3,
        batch_target=3,
        met_client=ThreeCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        batch_target=run.batch_target,
        max_images_per_object=1,
        available_disk_bytes=10_000_000,
    )

    downloaded_urls: list[str] = []

    def download_image_bytes(url: str) -> bytes:
        downloaded_urls.append(url)
        request_stop_collect_job(database_path=storage.database_path, job_id=job.job_id)
        return ppm_image_bytes(width=1600, height=800)

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=TrackingRecordClient(),
        download_image_bytes=download_image_bytes,
    )

    assert summary is not None
    assert summary.imported_object_ids == [10]
    assert downloaded_urls == ["https://images.metmuseum.org/10.jpg"]
    assert [asset.object_id for asset in get_met_image_assets(database_path=storage.database_path)] == [10]
    stopped_job = get_collect_job(database_path=storage.database_path, job_id=job.job_id)
    assert stopped_job.status == "stopped"
    assert stopped_job.last_processed_run_position == 0
    assert get_candidate_run(database_path=storage.database_path, run_id=run.run_id).status == "stopped"
    assert get_worker_status(database_path=storage.database_path).status == "idle"


def test_worker_marks_provider_exhausted_when_batch_target_cannot_be_met(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class OneCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10]

    class RestrictedRecordClient(FakeMetRecordClient):
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            return {
                **super().fetch_object_record(object_id),
                "isPublicDomain": False,
            }

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=1,
        batch_target=1,
        met_client=OneCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        batch_target=run.batch_target,
        available_disk_bytes=10_000_000,
    )

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=RestrictedRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert summary is not None
    assert summary.imported_image_count == 0
    assert get_collect_job(database_path=storage.database_path, job_id=job.job_id).status == "no_more_results"
    assert get_candidate_run(database_path=storage.database_path, run_id=run.run_id).status == "no_more_results"


def test_worker_marks_candidate_progress_during_met_ingest(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    from anacronia.search_sets import create_or_continue_search_set

    class TwoCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10, 40]

    class ProgressAwareRecordClient(FakeMetRecordClient):
        def __init__(self, *, job_id: int) -> None:
            self.job_id = job_id

        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            if object_id == 40:
                job = get_collect_job(database_path=storage.database_path, job_id=self.job_id)
                assert job.last_processed_run_position == 0
            record = super().fetch_object_record(10)
            return {**record, "objectID": object_id}

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=2,
        met_client=TwoCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=0,
        candidate_limit=2,
        candidate_progress_total=2,
        batch_target=2,
        max_images_per_object=1,
        available_disk_bytes=10_000_000,
    )

    summary = process_running_collect_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        met_client=ProgressAwareRecordClient(job_id=job.job_id),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert summary is not None
    completed_job = get_collect_job(database_path=storage.database_path, job_id=job.job_id)
    assert completed_job.status == "completed"
    assert completed_job.last_processed_run_position == 1
