from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

from anacronia.collection_runs import (
    CandidateRun,
    MetCandidateClient,
    discover_met_candidates,
)
from anacronia.met_ingest import (
    MetIngestSummary,
    MetRecordClient,
    ingest_met_run,
)
from anacronia.met_provider import HttpMetCandidateClient
from anacronia.search_sets import (
    SearchSet,
    create_or_continue_search_set,
    deactivate_search_set_term,
    list_search_sets,
)
from anacronia.storage import initialize_storage
from anacronia.worker import create_idle_worker_status


class SearchSetRequest(BaseModel):
    display_name: str
    terms_text: str


class DeactivateTermRequest(BaseModel):
    term: str


class DiscoverMetCandidatesRequest(BaseModel):
    candidate_offset: int = 0
    candidate_limit: int = 100


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


def create_app(
    *,
    database_path: Path | None = None,
    data_root: Path | None = None,
    met_candidate_client: MetCandidateClient | None = None,
    met_record_client: MetRecordClient | None = None,
) -> FastAPI:
    app = FastAPI(title="Anacronia")
    project_root = Path(__file__).resolve().parents[2]
    storage = initialize_storage(project_root=project_root)
    resolved_database_path = database_path if database_path is not None else storage.database_path
    resolved_data_root = data_root if data_root is not None else storage.data_root
    resolved_met_candidate_client = met_candidate_client or HttpMetCandidateClient()
    resolved_met_record_client = met_record_client or HttpMetCandidateClient()

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "service": "api",
            "status": "ok",
            "worker": create_idle_worker_status(),
        }

    @app.post("/search-sets")
    def create_search_set(request: SearchSetRequest) -> dict[str, object]:
        search_set = create_or_continue_search_set(
            database_path=resolved_database_path,
            display_name=request.display_name,
            terms_text=request.terms_text,
        )
        return serialize_search_set(search_set)

    @app.get("/search-sets")
    def get_search_sets() -> list[dict[str, object]]:
        return [serialize_search_set(search_set) for search_set in list_search_sets(database_path=resolved_database_path)]

    @app.post("/search-sets/{slug}/terms/deactivate")
    def deactivate_term(slug: str, request: DeactivateTermRequest) -> dict[str, object]:
        search_set = deactivate_search_set_term(
            database_path=resolved_database_path,
            slug=slug,
            term=request.term,
        )
        return serialize_search_set(search_set)

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

    @app.post("/provider-collections/met/runs/{run_id}/ingest")
    def ingest_met_candidate_run(run_id: int) -> dict[str, object]:
        summary = ingest_met_run(
            database_path=resolved_database_path,
            data_root=resolved_data_root,
            run_id=run_id,
            met_client=resolved_met_record_client,
        )
        return serialize_met_ingest_summary(summary)

    return app


app = create_app()
