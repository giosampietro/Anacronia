from anacronia.collection_runs import discover_met_candidates
from anacronia.dashboard import get_operational_dashboard
from anacronia.met_ingest import ingest_met_run
from anacronia.search_sets import create_or_continue_search_set
from anacronia.worker import (
    cancel_collect_job,
    complete_collect_job,
    mark_collect_candidate_processed,
    start_collect_job,
)


class FakeMetCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        assert term == "snake"
        return [100, 101, 102]


class FakeMetRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        return {
            100: {
                "objectID": 100,
                "isPublicDomain": True,
                "title": "Snake Vessel",
                "objectName": "Vessel",
                "primaryImage": "https://images.metmuseum.org/100.jpg",
                "objectURL": "https://www.metmuseum.org/art/collection/search/100",
            },
            101: {
                "objectID": 101,
                "isPublicDomain": True,
                "title": "Coiled Serpent",
                "objectName": "Drawing",
                "primaryImage": "https://images.metmuseum.org/101.jpg",
                "objectURL": "https://www.metmuseum.org/art/collection/search/101",
            },
            102: {
                "objectID": 102,
                "isPublicDomain": False,
                "title": "Restricted Snake Object",
            },
        }[object_id]


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([180, 40, 120]) * width
    return header + row * height


def test_operational_dashboard_groups_provider_collections_under_search_sets(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    data_root = tmp_path / "data"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=3,
        met_client=FakeMetCandidateClient(),
    )
    ingest_met_run(
        database_path=database_path,
        data_root=data_root,
        run_id=run.run_id,
        met_client=FakeMetRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )
    job = start_collect_job(
        database_path=database_path,
        run_id=run.run_id,
        candidate_offset=0,
        candidate_limit=3,
        candidate_progress_total=3,
        available_disk_bytes=10_000_000,
    )
    mark_collect_candidate_processed(
        database_path=database_path,
        job_id=job.job_id,
        run_position=1,
    )
    cancel_collect_job(database_path=database_path, job_id=job.job_id)

    dashboard = get_operational_dashboard(database_path=database_path)

    assert dashboard.worker_status.status == "idle"
    assert [
        (
            search_set.display_name,
            search_set.slug,
            search_set.provider_collections[0].provider,
            search_set.provider_collections[0].latest_run_id,
            search_set.provider_collections[0].collect_status,
            search_set.provider_collections[0].candidate_progress_processed,
            search_set.provider_collections[0].candidate_progress_total,
            search_set.provider_collections[0].imported_object_count,
            search_set.provider_collections[0].imported_image_count,
            search_set.provider_collections[0].continue_candidate_offset,
        )
        for search_set in dashboard.search_sets
    ] == [
        (
            "Snake Studies",
            "snake-studies",
            "met",
            run.run_id,
            "canceled",
            2,
            3,
            2,
            2,
            2,
        )
    ]
    assert [
        (provider.provider, provider.search_set_count, provider.imported_image_count)
        for provider in dashboard.provider_focus
    ] == [("met", 1, 2)]


def test_operational_dashboard_reports_next_offset_after_completed_search(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=3,
        met_client=FakeMetCandidateClient(),
    )
    job = start_collect_job(
        database_path=database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        available_disk_bytes=10_000_000,
    )
    mark_collect_candidate_processed(
        database_path=database_path,
        job_id=job.job_id,
        run_position=0,
    )
    complete_collect_job(database_path=database_path, job_id=job.job_id)

    dashboard = get_operational_dashboard(database_path=database_path)

    provider_collection = dashboard.search_sets[0].provider_collections[0]
    assert provider_collection.collect_status == "completed"
    assert provider_collection.continue_candidate_offset == 1
