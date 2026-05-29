from pathlib import Path
import shutil
from typing import Callable

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from anacronia.collection_runs import (
    CandidateRun,
    MetCandidateClient,
    discover_met_candidates,
)
from anacronia.dashboard import OperationalDashboard, get_operational_dashboard
from anacronia.met_ingest import (
    DEFAULT_MAX_IMAGES_PER_OBJECT,
    MetIngestSummary,
    MetRecordClient,
    ingest_met_run,
)
from anacronia.met_provider import HttpMetCandidateClient, fetch_bytes_url
from anacronia.search_sets import (
    SearchSet,
    create_or_continue_search_set,
    list_search_sets,
)
from anacronia.storage import initialize_storage
from anacronia.worker import (
    CollectLockError,
    get_worker_status,
    start_collect_job,
)


DEFAULT_CANDIDATE_LIMIT = 1000


class SearchSetRequest(BaseModel):
    display_name: str
    terms_text: str


class DiscoverMetCandidatesRequest(BaseModel):
    candidate_offset: int = Field(default=0, ge=0)
    candidate_limit: int = Field(default=DEFAULT_CANDIDATE_LIMIT, ge=1)


class StartMetCollectRequest(BaseModel):
    candidate_offset: int = Field(default=0, ge=0)
    candidate_limit: int = Field(default=DEFAULT_CANDIDATE_LIMIT, ge=1)
    max_images_per_object: int = Field(default=DEFAULT_MAX_IMAGES_PER_OBJECT, ge=1)


def serialize_search_set(search_set: SearchSet) -> dict[str, object]:
    return {
        "display_name": search_set.display_name,
        "slug": search_set.slug,
        "terms": [
            {
                "term": term.term,
                "active": term.active,
            }
            for term in search_set.terms
        ],
    }


def serialize_candidate_run(run: CandidateRun) -> dict[str, object]:
    return {
        "run_id": run.run_id,
        "search_set_slug": run.search_set_slug,
        "provider": run.provider,
        "term_snapshot": run.term_snapshot,
        "candidate_offset": run.candidate_offset,
        "candidate_limit": run.candidate_limit,
        "candidate_progress_total": run.candidate_progress_total,
        "candidates": [
            {
                "object_id": candidate.object_id,
                "source_term": candidate.source_term,
                "source_term_index": candidate.source_term_index,
                "provider_position": candidate.provider_position,
                "run_position": candidate.run_position,
            }
            for candidate in run.candidates
        ],
    }


def serialize_met_ingest_summary(summary: MetIngestSummary) -> dict[str, object]:
    return {
        "run_id": summary.run_id,
        "fetched_object_ids": summary.fetched_object_ids,
        "imported_object_ids": summary.imported_object_ids,
        "skipped_candidates": [
            {
                "object_id": skipped.object_id,
                "reason": skipped.reason,
            }
            for skipped in summary.skipped_candidates
        ],
    }


def serialize_operational_dashboard(dashboard: OperationalDashboard) -> dict[str, object]:
    return {
        "worker_status": {
            "service": dashboard.worker_status.service,
            "status": dashboard.worker_status.status,
            "active_collect_job_id": dashboard.worker_status.active_collect_job_id,
        },
        "search_sets": [
            {
                "display_name": search_set.display_name,
                "slug": search_set.slug,
                "terms": [
                    {
                        "term": term.term,
                        "active": term.active,
                    }
                    for term in search_set.terms
                ],
                "provider_collections": [
                    {
                        "provider": provider_collection.provider,
                        "latest_run_id": provider_collection.latest_run_id,
                        "collect_status": provider_collection.collect_status,
                        "candidate_offset": provider_collection.candidate_offset,
                        "candidate_limit": provider_collection.candidate_limit,
                        "candidate_progress_processed": provider_collection.candidate_progress_processed,
                        "candidate_progress_total": provider_collection.candidate_progress_total,
                        "imported_image_count": provider_collection.imported_image_count,
                        "continue_candidate_offset": provider_collection.continue_candidate_offset,
                    }
                    for provider_collection in search_set.provider_collections
                ],
            }
            for search_set in dashboard.search_sets
        ],
        "provider_focus": [
            {
                "provider": provider.provider,
                "search_set_count": provider.search_set_count,
                "imported_image_count": provider.imported_image_count,
            }
            for provider in dashboard.provider_focus
        ],
    }


def create_app(
    *,
    database_path: Path | None = None,
    data_root: Path | None = None,
    met_candidate_client: MetCandidateClient | None = None,
    met_record_client: MetRecordClient | None = None,
    download_image_bytes: Callable[[str], bytes] | None = None,
) -> FastAPI:
    app = FastAPI(title="Anacronia")
    project_root = Path(__file__).resolve().parents[2]
    if database_path is None:
        storage = initialize_storage(project_root=project_root, data_root=data_root)
        resolved_database_path = storage.database_path
        resolved_data_root = storage.data_root
    else:
        resolved_database_path = database_path
        resolved_data_root = data_root if data_root is not None else database_path.parent
        resolved_data_root.mkdir(parents=True, exist_ok=True)
    resolved_met_candidate_client = met_candidate_client or HttpMetCandidateClient()
    resolved_met_record_client = met_record_client or HttpMetCandidateClient()
    resolved_download_image_bytes = download_image_bytes or fetch_bytes_url

    @app.get("/health")
    def health() -> dict[str, object]:
        worker_status = get_worker_status(database_path=resolved_database_path)
        return {
            "service": "api",
            "status": "ok",
            "worker": {
                "service": worker_status.service,
                "status": worker_status.status,
                "active_collect_job_id": worker_status.active_collect_job_id,
            },
        }

    @app.post("/search-sets")
    def create_search_set(request: SearchSetRequest) -> dict[str, object]:
        try:
            search_set = create_or_continue_search_set(
                database_path=resolved_database_path,
                display_name=request.display_name,
                terms_text=request.terms_text,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return serialize_search_set(search_set)

    @app.get("/search-sets")
    def get_search_sets() -> list[dict[str, object]]:
        return [serialize_search_set(search_set) for search_set in list_search_sets(database_path=resolved_database_path)]

    @app.get("/dashboard")
    def get_dashboard() -> dict[str, object]:
        dashboard = get_operational_dashboard(database_path=resolved_database_path)
        return serialize_operational_dashboard(dashboard)

    @app.post("/search-sets/{slug}/provider-collections/met/runs")
    def discover_met_candidate_run(
        slug: str,
        request: DiscoverMetCandidatesRequest,
    ) -> dict[str, object]:
        run = discover_met_candidates(
            database_path=resolved_database_path,
            search_set_slug=slug,
            candidate_offset=request.candidate_offset,
            candidate_limit=request.candidate_limit,
            met_client=resolved_met_candidate_client,
        )
        return serialize_candidate_run(run)

    @app.post("/search-sets/{slug}/provider-collections/met/collects")
    def start_met_collect(
        slug: str,
        request: StartMetCollectRequest,
    ) -> dict[str, object]:
        if get_worker_status(database_path=resolved_database_path).active_collect_job_id is not None:
            raise HTTPException(status_code=409, detail="Another search is already active.")

        run = discover_met_candidates(
            database_path=resolved_database_path,
            search_set_slug=slug,
            candidate_offset=request.candidate_offset,
            candidate_limit=request.candidate_limit,
            met_client=resolved_met_candidate_client,
        )
        try:
            collect_job = start_collect_job(
                database_path=resolved_database_path,
                run_id=run.run_id,
                candidate_offset=request.candidate_offset,
                candidate_limit=request.candidate_limit,
                candidate_progress_total=run.candidate_progress_total,
                max_images_per_object=request.max_images_per_object,
                available_disk_bytes=shutil.disk_usage(resolved_data_root).free,
            )
        except CollectLockError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

        return {
            "run_id": run.run_id,
            "collect_job_id": collect_job.job_id,
            "status": collect_job.status,
        }

    @app.post("/provider-collections/met/runs/{run_id}/ingest")
    def ingest_met_candidate_run(run_id: int) -> dict[str, object]:
        summary = ingest_met_run(
            database_path=resolved_database_path,
            data_root=resolved_data_root,
            run_id=run_id,
            met_client=resolved_met_record_client,
            download_image_bytes=resolved_download_image_bytes,
        )
        return serialize_met_ingest_summary(summary)

    return app
