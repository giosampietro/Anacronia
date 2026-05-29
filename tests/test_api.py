from fastapi.testclient import TestClient

from anacronia.api import create_app


def test_health_reports_api_and_idle_worker():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "api",
        "status": "ok",
        "worker": {"service": "worker", "status": "idle"},
    }
