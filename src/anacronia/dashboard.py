from dataclasses import dataclass
from pathlib import Path
import sqlite3

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.met_ingest import ensure_met_ingest_schema
from anacronia.search_sets import SearchSetTerm
from anacronia.worker import (
    WorkerStatus,
    collect_job_from_row,
    ensure_worker_schema,
    get_worker_status,
)


@dataclass(frozen=True)
class DashboardProviderCollection:
    provider: str
    latest_run_id: int | None
    collect_status: str
    candidate_offset: int
    candidate_limit: int
    candidate_progress_processed: int
    candidate_progress_total: int
    imported_image_count: int
    continue_candidate_offset: int | None


@dataclass(frozen=True)
class DashboardSearchSet:
    display_name: str
    slug: str
    terms: list[SearchSetTerm]
    provider_collections: list[DashboardProviderCollection]


@dataclass(frozen=True)
class DashboardProviderFocus:
    provider: str
    search_set_count: int
    imported_image_count: int


@dataclass(frozen=True)
class OperationalDashboard:
    worker_status: WorkerStatus
    search_sets: list[DashboardSearchSet]
    provider_focus: list[DashboardProviderFocus]


def get_operational_dashboard(*, database_path: Path) -> OperationalDashboard:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        ensure_worker_schema(connection)
        search_sets = get_dashboard_search_sets(connection=connection)
        provider_focus = get_dashboard_provider_focus(connection=connection)

    return OperationalDashboard(
        worker_status=get_worker_status(database_path=database_path),
        search_sets=search_sets,
        provider_focus=provider_focus,
    )


def get_dashboard_search_sets(
    *,
    connection: sqlite3.Connection,
) -> list[DashboardSearchSet]:
    ensure_collection_run_schema(connection)
    search_set_rows = connection.execute(
        """
        SELECT id, display_name, slug
        FROM search_sets
        ORDER BY id
        """
    ).fetchall()

    return [
        DashboardSearchSet(
            display_name=row[1],
            slug=row[2],
            terms=get_search_set_terms(connection=connection, search_set_id=row[0]),
            provider_collections=get_provider_collections_for_search_set(
                connection=connection,
                search_set_id=row[0],
            ),
        )
        for row in search_set_rows
    ]


def get_search_set_terms(
    *,
    connection: sqlite3.Connection,
    search_set_id: int,
) -> list[SearchSetTerm]:
    rows = connection.execute(
        """
        SELECT term, active
        FROM search_set_terms
        WHERE search_set_id = ?
        ORDER BY id
        """,
        (search_set_id,),
    ).fetchall()

    return [SearchSetTerm(term=row[0], active=bool(row[1])) for row in rows]


def get_provider_collections_for_search_set(
    *,
    connection: sqlite3.Connection,
    search_set_id: int,
) -> list[DashboardProviderCollection]:
    rows = connection.execute(
        """
        SELECT id, provider
        FROM provider_collections
        WHERE search_set_id = ?
        ORDER BY provider
        """,
        (search_set_id,),
    ).fetchall()

    return [
        get_dashboard_provider_collection(
            connection=connection,
            provider_collection_id=row[0],
            provider=row[1],
        )
        for row in rows
    ]


def get_dashboard_provider_collection(
    *,
    connection: sqlite3.Connection,
    provider_collection_id: int,
    provider: str,
) -> DashboardProviderCollection:
    latest_run = connection.execute(
        """
        SELECT
          id,
          candidate_offset,
          candidate_limit,
          candidate_progress_total,
          processed_candidates,
          status
        FROM collection_runs
        WHERE provider_collection_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (provider_collection_id,),
    ).fetchone()
    imported_image_count = count_imported_images_for_provider_collection(
        connection=connection,
        provider_collection_id=provider_collection_id,
        provider=provider,
    )

    if latest_run is None:
        return DashboardProviderCollection(
            provider=provider,
            latest_run_id=None,
            collect_status="idle",
            candidate_offset=0,
            candidate_limit=0,
            candidate_progress_processed=0,
            candidate_progress_total=0,
            imported_image_count=imported_image_count,
            continue_candidate_offset=None,
        )

    collect_job = get_latest_collect_job_for_run(connection=connection, run_id=latest_run[0])
    if collect_job is None:
        collect_status = latest_run[5]
        progress_processed = latest_run[4]
        continue_candidate_offset = None
    else:
        collect_status = collect_job.status
        progress_processed = (
            0
            if collect_job.last_processed_run_position is None
            else collect_job.last_processed_run_position + 1
        )
        continue_candidate_offset = (
            collect_job.candidate_offset + progress_processed
            if collect_job.status == "canceled"
            else None
        )

    return DashboardProviderCollection(
        provider=provider,
        latest_run_id=latest_run[0],
        collect_status=collect_status,
        candidate_offset=latest_run[1],
        candidate_limit=latest_run[2],
        candidate_progress_processed=progress_processed,
        candidate_progress_total=latest_run[3],
        imported_image_count=imported_image_count,
        continue_candidate_offset=continue_candidate_offset,
    )


def get_latest_collect_job_for_run(
    *,
    connection: sqlite3.Connection,
    run_id: int,
):
    row = connection.execute(
        """
        SELECT
          id,
          run_id,
          status,
          candidate_offset,
          candidate_limit,
          candidate_progress_total,
          last_processed_run_position,
          provider_failure_count,
          backoff_seconds,
          pause_reason,
          required_disk_bytes,
          last_disk_available_bytes,
          max_images_per_object
        FROM collect_jobs
        WHERE run_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (run_id,),
    ).fetchone()

    if row is None:
        return None

    return collect_job_from_row(row)


def count_imported_images_for_provider_collection(
    *,
    connection: sqlite3.Connection,
    provider_collection_id: int,
    provider: str,
) -> int:
    row = connection.execute(
        """
        SELECT COUNT(*)
        FROM (
          SELECT DISTINCT image_assets.object_id, image_assets.source_image_url
          FROM image_assets
          JOIN run_candidates
            ON run_candidates.object_id = image_assets.object_id
          JOIN collection_runs
            ON collection_runs.id = run_candidates.run_id
          WHERE
            collection_runs.provider_collection_id = ?
            AND image_assets.provider = ?
            AND image_assets.imported = 1
        )
        """,
        (provider_collection_id, provider),
    ).fetchone()

    return int(row[0])


def get_dashboard_provider_focus(
    *,
    connection: sqlite3.Connection,
) -> list[DashboardProviderFocus]:
    rows = connection.execute(
        """
        SELECT provider, COUNT(*) AS search_set_count
        FROM provider_collections
        GROUP BY provider
        ORDER BY provider
        """
    ).fetchall()

    return [
        DashboardProviderFocus(
            provider=row[0],
            search_set_count=row[1],
            imported_image_count=count_imported_images_for_provider(
                connection=connection,
                provider=row[0],
            ),
        )
        for row in rows
    ]


def count_imported_images_for_provider(
    *,
    connection: sqlite3.Connection,
    provider: str,
) -> int:
    row = connection.execute(
        """
        SELECT COUNT(*)
        FROM image_assets
        WHERE provider = ? AND imported = 1
        """,
        (provider,),
    ).fetchone()

    return int(row[0])
