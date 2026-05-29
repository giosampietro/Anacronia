from fastapi.testclient import TestClient

from anacronia.api import create_app
from anacronia.storage import initialize_storage


class FakeMetCandidateClient:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def search_object_ids(self, term: str) -> list[int]:
        self.queries.append(term)
        return {
            "snake": [10, 20],
            "anaconda": [20, 30],
        }[term]


def test_health_reports_api_and_idle_worker():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "api",
        "status": "ok",
        "worker": {"service": "worker", "status": "idle"},
    }


def test_api_creates_and_continues_search_set(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))

    response = client.post(
        "/search-sets",
        json={
            "display_name": "Snake Studies",
            "terms_text": "snake, anaconda",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "display_name": "Snake Studies",
        "slug": "snake-studies",
        "terms": [
            {"term": "snake", "active": True},
            {"term": "anaconda", "active": True},
        ],
    }

    response = client.post(
        "/search-sets",
        json={
            "display_name": "snake studies",
            "terms_text": "Snake, cobra",
        },
    )

    assert response.status_code == 200
    assert response.json()["terms"] == [
        {"term": "snake", "active": True},
        {"term": "anaconda", "active": True},
        {"term": "cobra", "active": True},
    ]


def test_api_lists_search_sets(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )

    response = client.get("/search-sets")

    assert response.status_code == 200
    assert response.json() == [
        {
            "display_name": "Snake Studies",
            "slug": "snake-studies",
            "terms": [
                {"term": "snake", "active": True},
                {"term": "anaconda", "active": True},
            ],
        }
    ]


def test_api_deactivates_search_set_term(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )

    response = client.post(
        "/search-sets/snake-studies/terms/deactivate",
        json={"term": "SNAKE"},
    )

    assert response.status_code == 200
    assert response.json()["terms"] == [
        {"term": "snake", "active": False},
        {"term": "anaconda", "active": True},
    ]


def test_api_discovers_met_candidates_without_listing_runs_as_search_sets(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    met_client = FakeMetCandidateClient()
    client = TestClient(
        create_app(database_path=storage.database_path, met_candidate_client=met_client)
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )

    response = client.post(
        "/search-sets/snake-studies/provider-collections/met/runs",
        json={"candidate_offset": 1, "candidate_limit": 2},
    )

    assert response.status_code == 200
    assert met_client.queries == ["snake", "anaconda"]
    assert response.json() == {
        "run_id": 1,
        "search_set_slug": "snake-studies",
        "provider": "met",
        "term_snapshot": ["snake", "anaconda"],
        "candidate_offset": 1,
        "candidate_limit": 2,
        "candidate_progress_total": 2,
        "candidates": [
            {
                "object_id": 20,
                "source_term": "snake",
                "source_term_index": 0,
                "provider_position": 1,
                "run_position": 0,
            },
            {
                "object_id": 30,
                "source_term": "anaconda",
                "source_term_index": 1,
                "provider_position": 1,
                "run_position": 1,
            },
        ],
    }

    assert client.get("/search-sets").json() == [
        {
            "display_name": "Snake Studies",
            "slug": "snake-studies",
            "terms": [
                {"term": "snake", "active": True},
                {"term": "anaconda", "active": True},
            ],
        }
    ]
