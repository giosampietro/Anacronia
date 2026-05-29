from fastapi.testclient import TestClient

from anacronia.api import create_app
from anacronia.storage import initialize_storage


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
