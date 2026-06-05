from dataclasses import dataclass
from pathlib import Path
import shutil
import sqlite3
import time
from typing import Callable

from anacronia.collection_runs import DEFAULT_BATCH_TARGET, ensure_collection_run_schema
from anacronia.met_ingest import (
    DEFAULT_MAX_IMAGES_PER_OBJECT,
    MetIngestSummary,
    MetRecordClient,
    clamp_max_images_per_object,
    ingest_met_run,
)
from anacronia.met_provider import HttpMetCandidateClient, fetch_bytes_url
from anacronia.storage import initialize_storage


ACTIVE_COLLECT_JOB_STATUSES = ("running", "stopping")
DEFAULT_REQUIRED_DISK_BYTES = 1_000_000
DEFAULT_PROVIDER_FAILURE_PAUSE_THRESHOLD = 3
PROVIDER_FAILURE_BACKOFF_SECONDS = (5, 15, 45)


class CollectLockError(RuntimeError):
    pass


class DiskSpaceError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkerStatus:
    service: str
    status: str
    active_collect_job_id: int | None


@dataclass(frozen=True)
class CollectJob:
    job_id: int
    run_id: int
    status: str
    candidate_offset: int
    candidate_limit: int
    candidate_progress_total: int
    batch_target: int
    last_processed_run_position: int | None
    provider_failure_count: int
    backoff_seconds: int
    pause_reason: str
    required_disk_bytes: int
    last_disk_available_bytes: int | None
    max_images_per_object: int


def create_idle_worker_status() -> dict[str, str]:
    return {"service": "worker", "status": "idle"}


def get_worker_status(*, database_path: Path) -> WorkerStatus:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        active_job = get_active_collect_job(connection=connection)

    if active_job is None:
        return WorkerStatus(
            service="worker",
            status="idle",
            active_collect_job_id=None,
        )

    return WorkerStatus(
        service="worker",
        status=active_job.status,
        active_collect_job_id=active_job.job_id,
    )


def start_collect_job(
    *,
    database_path: Path,
    run_id: int,
    candidate_offset: int,
    candidate_limit: int,
    candidate_progress_total: int,
    available_disk_bytes: int,
    batch_target: int = DEFAULT_BATCH_TARGET,
    max_images_per_object: int = DEFAULT_MAX_IMAGES_PER_OBJECT,
    required_disk_bytes: int = DEFAULT_REQUIRED_DISK_BYTES,
) -> CollectJob:
    if available_disk_bytes < required_disk_bytes:
        raise DiskSpaceError("Not enough disk space to start collect job.")
    clamped_max_images_per_object = clamp_max_images_per_object(max_images_per_object)

    with sqlite3.connect(database_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        ensure_worker_schema(connection)
        if get_active_collect_job(connection=connection) is not None:
            raise CollectLockError("Another collect job is already active.")

        cursor = connection.execute(
            """
            INSERT INTO collect_jobs (
              run_id,
              status,
              candidate_offset,
              candidate_limit,
              candidate_progress_total,
              batch_target,
              provider_failure_count,
              backoff_seconds,
              pause_reason,
              required_disk_bytes,
              last_disk_available_bytes,
              max_images_per_object
            )
            VALUES (?, 'running', ?, ?, ?, ?, 0, 0, '', ?, ?, ?)
            """,
            (
                run_id,
                candidate_offset,
                candidate_limit,
                candidate_progress_total,
                batch_target,
                required_disk_bytes,
                available_disk_bytes,
                clamped_max_images_per_object,
            ),
        )
        job_id = int(cursor.lastrowid)
        mark_collection_run_status(connection=connection, run_id=run_id, status="running")

    return get_collect_job(database_path=database_path, job_id=job_id)


def process_running_collect_job(
    *,
    database_path: Path,
    data_root: Path,
    met_client: MetRecordClient,
    download_image_bytes: Callable[[str], bytes] | None = None,
    available_disk_bytes: Callable[[], int] | None = None,
) -> MetIngestSummary | None:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        job = get_processable_collect_job(connection=connection)

    if job is None:
        return None

    if job.status == "stopping":
        stop_collect_job(database_path=database_path, job_id=job.job_id)
        return None

    read_available_disk_bytes = available_disk_bytes or (lambda: shutil.disk_usage(data_root).free)
    job = check_collect_job_disk_availability(
        database_path=database_path,
        job_id=job.job_id,
        available_disk_bytes=read_available_disk_bytes(),
    )
    if job.status == "paused":
        return None

    def mark_candidate_processed_and_check_disk(run_position: int) -> None:
        mark_collect_candidate_processed(
            database_path=database_path,
            job_id=job.job_id,
            run_position=run_position,
        )
        check_collect_job_disk_availability(
            database_path=database_path,
            job_id=job.job_id,
            available_disk_bytes=read_available_disk_bytes(),
        )

    try:
        summary = ingest_met_run(
            database_path=database_path,
            data_root=data_root,
            run_id=job.run_id,
            met_client=met_client,
            download_image_bytes=download_image_bytes,
            max_images_per_object=job.max_images_per_object,
            batch_target=job.batch_target,
            start_run_position=next_run_position(job),
            on_candidate_processed=mark_candidate_processed_and_check_disk,
            should_stop=lambda: get_collect_job(
                database_path=database_path,
                job_id=job.job_id,
            ).status
            != "running",
        )
    except Exception:
        record_collect_provider_failure(
            database_path=database_path,
            job_id=job.job_id,
        )
        return None

    current_job = get_collect_job(database_path=database_path, job_id=job.job_id)
    if current_job.status == "stopping":
        stop_collect_job(database_path=database_path, job_id=job.job_id)
        return summary
    if current_job.status == "paused":
        return summary

    processed_all_selected_candidates = (
        current_job.last_processed_run_position is not None
        and current_job.last_processed_run_position + 1 >= job.candidate_progress_total
    )
    if summary.imported_image_count < job.batch_target and processed_all_selected_candidates:
        finish_collect_job(
            database_path=database_path,
            job_id=job.job_id,
            status="no_more_results",
        )
    else:
        complete_collect_job(database_path=database_path, job_id=job.job_id)

    return summary


def next_run_position(job: CollectJob) -> int:
    if job.last_processed_run_position is None:
        return 0

    return job.last_processed_run_position + 1


def pause_collect_job(
    *,
    database_path: Path,
    job_id: int,
    reason: str = "manual_pause",
) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        connection.execute(
            """
            UPDATE collect_jobs
            SET status = 'paused', pause_reason = ?
            WHERE id = ?
            """,
            (reason, job_id),
        )

    return get_collect_job(database_path=database_path, job_id=job_id)


def request_stop_collect_job(*, database_path: Path, job_id: int) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        job = get_collect_job_for_update(connection=connection, job_id=job_id)
        if job.status == "running":
            connection.execute(
                """
                UPDATE collect_jobs
                SET status = 'stopping'
                WHERE id = ?
                """,
                (job_id,),
            )
            mark_collection_run_status(connection=connection, run_id=job.run_id, status="stopping")

    return get_collect_job(database_path=database_path, job_id=job_id)


def stop_collect_job(*, database_path: Path, job_id: int) -> CollectJob:
    return finish_collect_job(
        database_path=database_path,
        job_id=job_id,
        status="stopped",
    )


def resume_collect_job(
    *,
    database_path: Path,
    job_id: int,
    batch_target: int | None = None,
) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        ensure_worker_schema(connection)
        job = get_collect_job_for_update(connection=connection, job_id=job_id)
        active_job = get_active_collect_job(connection=connection)
        if active_job is not None and active_job.job_id != job_id:
            raise CollectLockError("Another collect job is already active.")
        if job.status != "paused":
            raise CollectLockError("Only paused collect jobs can be resumed.")
        connection.execute(
            """
            UPDATE collect_jobs
            SET status = 'running', pause_reason = '', batch_target = ?
            WHERE id = ?
            """,
            (job.batch_target if batch_target is None else batch_target, job_id),
        )

    return get_collect_job(database_path=database_path, job_id=job_id)


def cancel_collect_job(*, database_path: Path, job_id: int) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        connection.execute(
            """
            UPDATE collect_jobs
            SET status = 'canceled'
            WHERE id = ?
            """,
            (job_id,),
        )

    return get_collect_job(database_path=database_path, job_id=job_id)


def complete_collect_job(*, database_path: Path, job_id: int) -> CollectJob:
    return finish_collect_job(
        database_path=database_path,
        job_id=job_id,
        status="completed",
    )


def finish_collect_job(
    *,
    database_path: Path,
    job_id: int,
    status: str,
) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        job = get_collect_job_for_update(connection=connection, job_id=job_id)
        connection.execute(
            """
            UPDATE collect_jobs
            SET status = ?
            WHERE id = ?
            """,
            (status, job_id),
        )
        mark_collection_run_status(connection=connection, run_id=job.run_id, status=status)

    return get_collect_job(database_path=database_path, job_id=job_id)


def mark_collect_candidate_processed(
    *,
    database_path: Path,
    job_id: int,
    run_position: int,
) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        connection.execute(
            """
            UPDATE collect_jobs
            SET last_processed_run_position = CASE
              WHEN last_processed_run_position IS NULL THEN ?
              WHEN last_processed_run_position < ? THEN ?
              ELSE last_processed_run_position
            END
            WHERE id = ?
            """,
            (run_position, run_position, run_position, job_id),
        )

    return get_collect_job(database_path=database_path, job_id=job_id)


def propose_continue_after_cancel(*, database_path: Path, job_id: int) -> int:
    job = get_collect_job(database_path=database_path, job_id=job_id)
    if job.status != "canceled":
        raise ValueError("Continuation offset can only be proposed for canceled jobs.")
    if job.last_processed_run_position is None:
        return job.candidate_offset

    return job.candidate_offset + job.last_processed_run_position + 1


def check_collect_job_disk_availability(
    *,
    database_path: Path,
    job_id: int,
    available_disk_bytes: int,
) -> CollectJob:
    job = get_collect_job(database_path=database_path, job_id=job_id)
    next_status = "paused" if available_disk_bytes < job.required_disk_bytes else job.status
    pause_reason = "insufficient_disk" if next_status == "paused" else job.pause_reason

    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        connection.execute(
            """
            UPDATE collect_jobs
            SET
              status = ?,
              pause_reason = ?,
              last_disk_available_bytes = ?
            WHERE id = ?
            """,
            (next_status, pause_reason, available_disk_bytes, job_id),
        )

    return get_collect_job(database_path=database_path, job_id=job_id)


def record_collect_provider_failure(
    *,
    database_path: Path,
    job_id: int,
    pause_after_failures: int = DEFAULT_PROVIDER_FAILURE_PAUSE_THRESHOLD,
) -> CollectJob:
    job = get_collect_job(database_path=database_path, job_id=job_id)
    failure_count = job.provider_failure_count + 1
    status = "paused" if failure_count >= pause_after_failures else job.status
    pause_reason = "repeated_provider_failures" if status == "paused" else job.pause_reason
    backoff_seconds = provider_failure_backoff_seconds(failure_count)

    with sqlite3.connect(database_path) as connection:
        ensure_worker_schema(connection)
        connection.execute(
            """
            UPDATE collect_jobs
            SET
              status = ?,
              provider_failure_count = ?,
              backoff_seconds = ?,
              pause_reason = ?
            WHERE id = ?
            """,
            (status, failure_count, backoff_seconds, pause_reason, job_id),
        )

    return get_collect_job(database_path=database_path, job_id=job_id)


def provider_failure_backoff_seconds(failure_count: int) -> int:
    index = min(failure_count, len(PROVIDER_FAILURE_BACKOFF_SECONDS)) - 1
    return PROVIDER_FAILURE_BACKOFF_SECONDS[index]


def get_collect_job(*, database_path: Path, job_id: int) -> CollectJob:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_worker_schema(connection)
        row = connection.execute(
            """
            SELECT
              id,
              run_id,
              status,
              candidate_offset,
              candidate_limit,
              candidate_progress_total,
              batch_target,
              last_processed_run_position,
              provider_failure_count,
              backoff_seconds,
              pause_reason,
              required_disk_bytes,
              last_disk_available_bytes,
              max_images_per_object
            FROM collect_jobs
            WHERE id = ?
            """,
            (job_id,),
        ).fetchone()

    if row is None:
        raise LookupError(f"Collect job not found: {job_id}")

    return collect_job_from_row(row)


def get_active_collect_job_for_search_set_provider(
    *,
    database_path: Path,
    search_set_slug: str,
    provider: str,
) -> CollectJob | None:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_worker_schema(connection)
        row = connection.execute(
            """
            SELECT
              collect_jobs.id,
              collect_jobs.run_id,
              collect_jobs.status,
              collect_jobs.candidate_offset,
              collect_jobs.candidate_limit,
              collect_jobs.candidate_progress_total,
              collect_jobs.batch_target,
              collect_jobs.last_processed_run_position,
              collect_jobs.provider_failure_count,
              collect_jobs.backoff_seconds,
              collect_jobs.pause_reason,
              collect_jobs.required_disk_bytes,
              collect_jobs.last_disk_available_bytes,
              collect_jobs.max_images_per_object
            FROM collect_jobs
            JOIN collection_runs
              ON collection_runs.id = collect_jobs.run_id
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE
              search_sets.slug = ?
              AND provider_collections.provider = ?
              AND collect_jobs.status IN ('running', 'stopping', 'paused')
            ORDER BY collect_jobs.id DESC
            LIMIT 1
            """,
            (search_set_slug, provider),
        ).fetchone()

    if row is None:
        return None

    return collect_job_from_row(row)


def get_next_collect_candidate_offset_for_search_set_provider(
    *,
    database_path: Path,
    search_set_slug: str,
    provider: str,
) -> int | None:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_worker_schema(connection)
        row = connection.execute(
            """
            SELECT
              collection_runs.status,
              collection_runs.candidate_offset,
              collection_runs.candidate_limit,
              collect_jobs.status,
              collect_jobs.candidate_offset,
              collect_jobs.last_processed_run_position
            FROM collection_runs
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            LEFT JOIN collect_jobs
              ON collect_jobs.run_id = collection_runs.id
            WHERE
              search_sets.slug = ?
              AND provider_collections.provider = ?
            ORDER BY collection_runs.id DESC, collect_jobs.id DESC
            LIMIT 1
            """,
            (search_set_slug, provider),
        ).fetchone()

    if row is None:
        return 0

    run_status = str(row[0])
    if run_status == "no_more_results":
        return None

    collect_status = None if row[3] is None else str(row[3])
    if collect_status in {"completed", "stopped", "canceled"}:
        collect_candidate_offset = int(row[4])
        last_processed_run_position = row[5]
        if last_processed_run_position is None:
            return collect_candidate_offset
        return collect_candidate_offset + int(last_processed_run_position) + 1

    if collect_status is None and run_status == "completed":
        return int(row[1]) + int(row[2])

    return 0


def get_collect_job_for_update(
    *,
    connection: sqlite3.Connection,
    job_id: int,
) -> CollectJob:
    row = connection.execute(
        """
        SELECT
          id,
          run_id,
          status,
          candidate_offset,
          candidate_limit,
          candidate_progress_total,
          batch_target,
          last_processed_run_position,
          provider_failure_count,
          backoff_seconds,
          pause_reason,
          required_disk_bytes,
          last_disk_available_bytes,
          max_images_per_object
        FROM collect_jobs
        WHERE id = ?
        """,
        (job_id,),
    ).fetchone()

    if row is None:
        raise LookupError(f"Collect job not found: {job_id}")

    return collect_job_from_row(row)


def mark_collection_run_status(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    status: str,
) -> None:
    collection_runs_exists = connection.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'collection_runs'
        """
    ).fetchone()
    if collection_runs_exists is None:
        return

    connection.execute(
        """
        UPDATE collection_runs
        SET status = ?
        WHERE id = ?
        """,
        (status, run_id),
    )


def get_active_collect_job(*, connection: sqlite3.Connection) -> CollectJob | None:
    row = connection.execute(
        """
        SELECT
          id,
          run_id,
          status,
          candidate_offset,
          candidate_limit,
          candidate_progress_total,
          batch_target,
          last_processed_run_position,
          provider_failure_count,
          backoff_seconds,
          pause_reason,
          required_disk_bytes,
          last_disk_available_bytes,
          max_images_per_object
        FROM collect_jobs
        WHERE status IN ('running', 'stopping')
        ORDER BY id DESC
        LIMIT 1
        """
    ).fetchone()

    if row is None:
        return None

    return collect_job_from_row(row)


def get_processable_collect_job(*, connection: sqlite3.Connection) -> CollectJob | None:
    row = connection.execute(
        """
        SELECT
          id,
          run_id,
          status,
          candidate_offset,
          candidate_limit,
          candidate_progress_total,
          batch_target,
          last_processed_run_position,
          provider_failure_count,
          backoff_seconds,
          pause_reason,
          required_disk_bytes,
          last_disk_available_bytes,
          max_images_per_object
        FROM collect_jobs
        WHERE status IN ('running', 'stopping')
        ORDER BY id
        LIMIT 1
        """
    ).fetchone()

    if row is None:
        return None

    return collect_job_from_row(row)


def collect_job_from_row(row: sqlite3.Row | tuple[object, ...]) -> CollectJob:
    return CollectJob(
        job_id=int(row[0]),
        run_id=int(row[1]),
        status=str(row[2]),
        candidate_offset=int(row[3]),
        candidate_limit=int(row[4]),
        candidate_progress_total=int(row[5]),
        batch_target=int(row[6]),
        last_processed_run_position=row[7],
        provider_failure_count=int(row[8]),
        backoff_seconds=int(row[9]),
        pause_reason=str(row[10]),
        required_disk_bytes=int(row[11]),
        last_disk_available_bytes=row[12],
        max_images_per_object=int(row[13]),
    )


def ensure_worker_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS collect_jobs (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          candidate_offset INTEGER NOT NULL,
          candidate_limit INTEGER NOT NULL,
          candidate_progress_total INTEGER NOT NULL,
          batch_target INTEGER NOT NULL DEFAULT 10,
          last_processed_run_position INTEGER,
          provider_failure_count INTEGER NOT NULL,
          backoff_seconds INTEGER NOT NULL,
          pause_reason TEXT NOT NULL,
          required_disk_bytes INTEGER NOT NULL,
          last_disk_available_bytes INTEGER,
          max_images_per_object INTEGER NOT NULL DEFAULT 3
        )
        """
    )
    columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(collect_jobs)").fetchall()
    }
    if "max_images_per_object" not in columns:
        connection.execute(
            """
            ALTER TABLE collect_jobs
            ADD COLUMN max_images_per_object INTEGER NOT NULL DEFAULT 3
            """
        )
    if "batch_target" not in columns:
        connection.execute(
            """
            ALTER TABLE collect_jobs
            ADD COLUMN batch_target INTEGER NOT NULL DEFAULT 10
            """
        )


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    storage = initialize_storage(project_root=project_root)
    met_client = HttpMetCandidateClient()

    while True:
        try:
            process_running_collect_job(
                database_path=storage.database_path,
                data_root=storage.data_root,
                met_client=met_client,
                download_image_bytes=fetch_bytes_url,
            )
        except Exception:
            pass
        time.sleep(1)


if __name__ == "__main__":
    main()
