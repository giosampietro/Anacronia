from fastapi.testclient import TestClient

from anacronia.api import DEFAULT_CANDIDATE_LIMIT, DEFAULT_MAX_IMAGES_PER_OBJECT, create_app
from anacronia.worker import get_collect_job, start_collect_job
from anacronia.met_ingest import get_met_matches, get_met_museum_objects
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


class FakeMetRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        return {
            20: {
                "objectID": 20,
                "isPublicDomain": True,
                "title": "Coiled Snake Vessel",
                "objectName": "Vessel",
                "tags": [{"term": "Snakes"}],
                "primaryImage": "https://images.metmuseum.org/20.jpg",
                "objectURL": "https://www.metmuseum.org/art/collection/search/20",
            },
            30: {
                "objectID": 30,
                "isPublicDomain": False,
                "title": "Restricted Anaconda Study",
            },
        }[object_id]


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([180, 40, 120]) * width
    return header + row * height


def test_health_reports_api_and_idle_worker(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "api",
        "status": "ok",
        "worker": {
            "service": "worker",
            "status": "idle",
            "active_collect_job_id": None,
        },
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


def test_api_starts_met_collect_job_from_search_set(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    met_client = FakeMetCandidateClient()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=met_client,
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )

    response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={
            "candidate_offset": 0,
            "candidate_limit": DEFAULT_CANDIDATE_LIMIT,
            "max_images_per_object": DEFAULT_MAX_IMAGES_PER_OBJECT,
        },
    )

    assert response.status_code == 200
    assert met_client.queries == ["snake", "anaconda"]
    assert response.json() == {
        "run_id": 1,
        "collect_job_id": 1,
        "status": "running",
    }
    dashboard = client.get("/dashboard").json()
    assert dashboard["worker_status"] == {
        "service": "worker",
        "status": "running",
        "active_collect_job_id": 1,
    }
    assert dashboard["search_sets"][0]["provider_collections"][0]["candidate_limit"] == 1000
    assert get_collect_job(database_path=storage.database_path, job_id=1).max_images_per_object == DEFAULT_MAX_IMAGES_PER_OBJECT


def test_api_caps_met_collect_to_three_images_per_object(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetCandidateClient(),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake"},
    )

    response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={
            "candidate_offset": 0,
            "candidate_limit": 1,
            "max_images_per_object": 12,
        },
    )

    assert response.status_code == 200
    assert get_collect_job(database_path=storage.database_path, job_id=1).max_images_per_object == 3


def test_health_reports_running_worker_when_collect_job_is_active(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetCandidateClient(),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )
    client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={
            "candidate_offset": 0,
            "candidate_limit": DEFAULT_CANDIDATE_LIMIT,
            "max_images_per_object": DEFAULT_MAX_IMAGES_PER_OBJECT,
        },
    )

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "api",
        "status": "ok",
        "worker": {
            "service": "worker",
            "status": "running",
            "active_collect_job_id": 1,
        },
    }


def test_api_rejects_met_collect_before_discovery_when_collect_job_is_active(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    met_client = FakeMetCandidateClient()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=met_client,
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )
    client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={
            "candidate_offset": 0,
            "candidate_limit": DEFAULT_CANDIDATE_LIMIT,
            "max_images_per_object": DEFAULT_MAX_IMAGES_PER_OBJECT,
        },
    )

    response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={
            "candidate_offset": DEFAULT_CANDIDATE_LIMIT,
            "candidate_limit": DEFAULT_CANDIDATE_LIMIT,
            "max_images_per_object": DEFAULT_MAX_IMAGES_PER_OBJECT,
        },
    )

    assert response.status_code == 409
    assert met_client.queries == ["snake", "anaconda"]
    dashboard = client.get("/dashboard").json()
    assert dashboard["search_sets"][0]["provider_collections"][0]["latest_run_id"] == 1


def test_api_ingests_met_records_for_a_candidate_run(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetCandidateClient(),
            met_record_client=FakeMetRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )
    run_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/runs",
        json={"candidate_offset": 1, "candidate_limit": 2},
    )

    response = client.post(
        f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest"
    )

    assert response.status_code == 200
    assert response.json() == {
        "run_id": 1,
        "fetched_object_ids": [20, 30],
        "imported_object_ids": [20],
        "skipped_candidates": [
            {"object_id": 30, "reason": "not_public_domain"},
        ],
    }
    assert [(museum_object.object_id, museum_object.title) for museum_object in get_met_museum_objects(database_path=storage.database_path)] == [
        (20, "Coiled Snake Vessel")
    ]
    assert [(match.object_id, match.search_term, match.verified) for match in get_met_matches(database_path=storage.database_path, run_id=1)] == [
        (20, "snake", True)
    ]


def test_api_returns_operational_dashboard(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetCandidateClient(),
            met_record_client=FakeMetRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )
    run_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/runs",
        json={"candidate_offset": 1, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    start_collect_job(
        database_path=storage.database_path,
        run_id=run_response.json()["run_id"],
        candidate_offset=1,
        candidate_limit=2,
        candidate_progress_total=2,
        available_disk_bytes=10_000_000,
    )

    response = client.get("/dashboard")

    assert response.status_code == 200
    assert response.json()["worker_status"] == {
        "service": "worker",
        "status": "running",
        "active_collect_job_id": 1,
    }
    assert response.json()["search_sets"][0]["provider_collections"][0] == {
        "provider": "met",
        "latest_run_id": 1,
        "collect_status": "running",
        "candidate_offset": 1,
        "candidate_limit": 2,
        "candidate_progress_processed": 0,
        "candidate_progress_total": 2,
        "imported_image_count": 1,
        "continue_candidate_offset": None,
    }
    assert response.json()["provider_focus"] == [
        {"provider": "met", "search_set_count": 1, "imported_image_count": 1}
    ]
