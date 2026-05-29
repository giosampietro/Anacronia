import pytest

from anacronia.worker import (
    CollectLockError,
    DiskSpaceError,
    cancel_collect_job,
    check_collect_job_disk_availability,
    complete_collect_job,
    create_idle_worker_status,
    get_worker_status,
    mark_collect_candidate_processed,
    pause_collect_job,
    propose_continue_after_cancel,
    record_collect_provider_failure,
    resume_collect_job,
    start_collect_job,
)


def test_worker_starts_idle():
    assert create_idle_worker_status() == {"service": "worker", "status": "idle"}


def test_collect_job_lock_blocks_second_job_until_canceled(tmp_path):
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
    with pytest.raises(CollectLockError):
        start_collect_job(
            database_path=database_path,
            run_id=2,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        )

    canceled_job = cancel_collect_job(database_path=database_path, job_id=first_job.job_id)

    assert canceled_job.status == "canceled"
    second_job = start_collect_job(
        database_path=database_path,
        run_id=2,
        candidate_offset=0,
        candidate_limit=5,
        candidate_progress_total=5,
        available_disk_bytes=10_000_000,
    )
    assert second_job.run_id == 2


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
    with pytest.raises(CollectLockError):
        start_collect_job(
            database_path=database_path,
            run_id=2,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        )


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
    with pytest.raises(CollectLockError):
        start_collect_job(
            database_path=database_path,
            run_id=2,
            candidate_offset=0,
            candidate_limit=5,
            candidate_progress_total=5,
            available_disk_bytes=10_000_000,
        )
