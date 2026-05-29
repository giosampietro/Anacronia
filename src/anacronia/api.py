from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

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


def create_app(*, database_path: Path | None = None) -> FastAPI:
    app = FastAPI(title="Anacronia")
    project_root = Path(__file__).resolve().parents[2]
    storage = initialize_storage(project_root=project_root)
    resolved_database_path = database_path if database_path is not None else storage.database_path

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

    return app


app = create_app()
