import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from anacronia.api import DEFAULT_CANDIDATE_LIMIT, DEFAULT_MAX_IMAGES_PER_OBJECT, create_app
from anacronia.collection_runs import get_candidate_run
from anacronia.worker import (
    cancel_collect_job,
    complete_collect_job,
    get_collect_job,
    mark_collect_candidate_processed,
    pause_collect_job,
    start_collect_job,
)
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


class FakeMetGridCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        assert term == "snake"
        return [20, 40]


class FakeMetGridRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        return {
            20: {
                "objectID": 20,
                "isPublicDomain": True,
                "title": "Snake Vessel",
                "objectName": "Vessel",
                "artistDisplayName": "Met Workshop",
                "tags": [{"term": "Snakes"}],
                "primaryImage": "https://images.metmuseum.org/20-primary.jpg",
                "objectURL": "https://www.metmuseum.org/art/collection/search/20",
                "rightsAndReproduction": "Public domain",
                "metadataDate": "2026-01-01",
            },
            40: {
                "objectID": 40,
                "isPublicDomain": True,
                "title": "Coiled Snake Bowl",
                "objectName": "Bowl",
                "artistDisplayName": "Unknown maker",
                "artistDisplayBio": "American, 1900-1970",
                "artistNationality": "American",
                "department": "Greek and Roman Art",
                "objectDate": "ca. 1890",
                "medium": "Terracotta",
                "dimensions": "H. 4 in. (10.2 cm)",
                "classification": "Ceramics",
                "creditLine": "Gift of Anacronia",
                "accessionNumber": "40.1",
                "repository": "Metropolitan Museum of Art, New York, NY",
                "tags": [{"term": "Snake"}],
                "primaryImage": "https://images.metmuseum.org/40-primary.jpg",
                "additionalImages": [
                    "https://images.metmuseum.org/40-detail-a.jpg",
                    "https://images.metmuseum.org/40-detail-b.jpg",
                    "https://images.metmuseum.org/40-skipped.jpg",
                ],
                "objectURL": "https://www.metmuseum.org/art/collection/search/40",
                "rightsAndReproduction": "Public domain",
                "metadataDate": "2026-01-02",
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


def test_api_starts_locked_collection_with_initial_met_provider_source(tmp_path):
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

    dashboard = client.get("/dashboard").json()
    assert dashboard["search_sets"][0]["provider_collections"] == [
        {
            "provider": "met",
            "latest_run_id": None,
            "collect_status": "idle",
            "pause_reason": "",
            "candidate_offset": 0,
            "candidate_limit": 0,
            "batch_target": 10,
            "candidate_progress_processed": 0,
            "candidate_progress_total": 0,
            "imported_object_count": 0,
            "imported_image_count": 0,
            "continue_candidate_offset": None,
        }
    ]

    response = client.post(
        "/search-sets",
        json={
            "display_name": "snake studies",
            "terms_text": "Snake, cobra",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "A Collection with this name already exists."
    assert client.get("/search-sets").json()[0]["terms"] == [
        {"term": "snake", "active": True},
        {"term": "anaconda", "active": True},
    ]


def test_api_rejects_collection_without_title_or_terms(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))

    missing_title = client.post(
        "/search-sets",
        json={"display_name": "  ", "terms_text": "snake"},
    )
    missing_terms = client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": " , \n "},
    )

    assert missing_title.status_code == 422
    assert missing_title.json()["detail"] == "Collection title is required."
    assert missing_terms.status_code == 422
    assert missing_terms.json()["detail"] == "At least one Collection term is required."
    assert client.get("/search-sets").json() == []


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


def test_api_renames_collection_display_name_without_changing_slug_or_terms(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake, anaconda"},
    )

    response = client.patch(
        "/search-sets/snake-studies",
        json={"display_name": "Intaglio Rings"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "display_name": "Intaglio Rings",
        "slug": "snake-studies",
        "terms": [
            {"term": "snake", "active": True},
            {"term": "anaconda", "active": True},
        ],
    }
    assert client.get("/search-sets").json() == [
        {
            "display_name": "Intaglio Rings",
            "slug": "snake-studies",
            "terms": [
                {"term": "snake", "active": True},
                {"term": "anaconda", "active": True},
            ],
        }
    ]


def test_api_deletes_empty_collection_and_removes_it_from_dashboard(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake"},
    )
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )

    response = client.delete("/search-sets/snake-studies")

    assert response.status_code == 200
    assert response.json() == {
        "collection_slug": "snake-studies",
        "deleted": True,
        "deleted_objects": 0,
        "deleted_image_assets": 0,
        "preserved_shared_objects": 0,
        "preserved_shared_image_assets": 0,
        "preserved_favorite_objects": 0,
        "preserved_favorite_image_assets": 0,
    }
    assert [
        search_set["slug"]
        for search_set in client.get("/dashboard").json()["search_sets"]
    ] == ["bowl-study"]


def test_api_deletes_collection_with_exclusive_material_and_removes_local_files(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    selected_image_asset = client.get(
        "/search-sets/snake-study/local-result-set?view=images"
    ).json()["image_assets"][0]
    assert client.get(selected_image_asset["standard_url"]).status_code == 200

    response = client.delete("/search-sets/snake-study")

    assert response.status_code == 200
    assert response.json()["deleted"] is True
    assert response.json()["deleted_objects"] == 2
    assert response.json()["deleted_image_assets"] == 4
    assert client.get(selected_image_asset["standard_url"]).status_code == 404
    assert client.get("/dashboard").json()["search_sets"] == []
    assert client.get("/library/local-result-set?view=images").json()["image_assets"] == []


def test_api_rejects_delete_collection_while_provider_search_is_running(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(
        "/search-sets/snake-study/provider-collections/met/collects",
        json={"batch_target": 10},
    )

    response = client.delete("/search-sets/snake-study")

    assert response.status_code == 409
    assert response.json()["detail"] == "Provider Search is running for this Collection."
    assert [
        search_set["slug"]
        for search_set in client.get("/dashboard").json()["search_sets"]
    ] == ["snake-study"]


def test_api_rejects_collection_rename_that_would_match_existing_slug(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake"},
    )
    client.post(
        "/search-sets",
        json={"display_name": "Masks", "terms_text": "mask"},
    )

    response = client.patch(
        "/search-sets/snake-studies",
        json={"display_name": "Masks"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "A Collection with this name already exists."
    assert client.get("/search-sets").json()[0]["display_name"] == "Snake Studies"


def test_api_rejects_collection_rename_that_would_match_existing_display_name(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path))
    client.post(
        "/search-sets",
        json={"display_name": "Masks", "terms_text": "mask"},
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Studies", "terms_text": "snake"},
    )
    client.patch(
        "/search-sets/masks",
        json={"display_name": "Display Only"},
    )

    response = client.patch(
        "/search-sets/snake-studies",
        json={"display_name": " display   only "},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "A Collection with this name already exists."
    assert client.get("/search-sets").json() == [
        {
            "display_name": "Display Only",
            "slug": "masks",
            "terms": [{"term": "mask", "active": True}],
        },
        {
            "display_name": "Snake Studies",
            "slug": "snake-studies",
            "terms": [{"term": "snake", "active": True}],
        },
    ]


def test_api_does_not_expose_term_deactivation(tmp_path):
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

    assert response.status_code == 404


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
        "batch_target": 10,
        "candidate_progress_total": 2,
        "status": "discovered",
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
        "batch_target": 10,
    }
    dashboard = client.get("/dashboard").json()
    assert dashboard["worker_status"] == {
        "service": "worker",
        "status": "running",
        "active_collect_job_id": 1,
    }
    assert dashboard["search_sets"][0]["provider_collections"][0]["candidate_limit"] == 3
    assert get_collect_job(database_path=storage.database_path, job_id=1).max_images_per_object == DEFAULT_MAX_IMAGES_PER_OBJECT


@pytest.mark.parametrize("batch_target", [5, 10, 20, 30, 100, 500, 1000])
def test_api_starts_met_search_from_batch_target(tmp_path, batch_target):
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
        json={"batch_target": batch_target},
    )

    assert response.status_code == 200
    assert response.json() == {
        "run_id": 1,
        "collect_job_id": 1,
        "status": "running",
        "batch_target": batch_target,
    }
    run = get_candidate_run(database_path=storage.database_path, run_id=1)
    assert run.batch_target == batch_target
    assert run.candidate_offset == 0
    assert run.candidate_limit == 3
    assert (
        get_collect_job(database_path=storage.database_path, job_id=1).batch_target
        == batch_target
    )
    dashboard = client.get("/dashboard").json()
    assert (
        dashboard["search_sets"][0]["provider_collections"][0]["batch_target"]
        == batch_target
    )


def test_api_rejects_unsupported_met_batch_targets(tmp_path):
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
        json={"batch_target": 250},
    )

    assert response.status_code == 422


def test_api_requests_running_met_search_to_stop(tmp_path):
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
        json={"batch_target": 100},
    )

    response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects/stop",
    )

    assert response.status_code == 200
    assert response.json() == {
        "collect_job_id": 1,
        "status": "stopping",
    }
    assert get_collect_job(database_path=storage.database_path, job_id=1).status == "stopping"
    dashboard = client.get("/dashboard").json()
    assert dashboard["worker_status"] == {
        "service": "worker",
        "status": "stopping",
        "active_collect_job_id": 1,
    }
    assert dashboard["search_sets"][0]["provider_collections"][0]["collect_status"] == "stopping"


def test_api_keeps_met_searching_from_next_safe_candidate_after_completed_batch(tmp_path):
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
    first_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={"batch_target": 100},
    )
    mark_collect_candidate_processed(
        database_path=storage.database_path,
        job_id=first_response.json()["collect_job_id"],
        run_position=0,
    )
    complete_collect_job(
        database_path=storage.database_path,
        job_id=first_response.json()["collect_job_id"],
    )

    second_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={"batch_target": 100},
    )

    assert second_response.status_code == 200
    second_run = get_candidate_run(
        database_path=storage.database_path,
        run_id=second_response.json()["run_id"],
    )
    assert second_run.candidate_offset == 1
    assert [candidate.object_id for candidate in second_run.candidates] == [20, 30]
    assert second_response.json()["status"] == "running"


def test_api_resumes_paused_met_search_and_exposes_pause_reason(tmp_path):
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
    start_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={"batch_target": 100},
    )
    pause_collect_job(
        database_path=storage.database_path,
        job_id=start_response.json()["collect_job_id"],
        reason="insufficient_disk",
    )

    dashboard = client.get("/dashboard").json()
    assert dashboard["worker_status"] == {
        "service": "worker",
        "status": "idle",
        "active_collect_job_id": None,
    }
    assert dashboard["search_sets"][0]["provider_collections"][0]["pause_reason"] == "insufficient_disk"
    blocked_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects",
        json={"batch_target": 100},
    )
    assert blocked_response.status_code == 409

    client.post(
        "/search-sets",
        json={"display_name": "Other Study", "terms_text": "snake"},
    )
    other_response = client.post(
        "/search-sets/other-study/provider-collections/met/collects",
        json={"batch_target": 100},
    )
    assert other_response.status_code == 200
    blocked_resume_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects/resume",
        json={"batch_target": 500},
    )
    assert blocked_resume_response.status_code == 409
    cancel_collect_job(
        database_path=storage.database_path,
        job_id=other_response.json()["collect_job_id"],
    )

    resume_response = client.post(
        "/search-sets/snake-studies/provider-collections/met/collects/resume",
        json={"batch_target": 500},
    )

    assert resume_response.status_code == 200
    assert resume_response.json() == {
        "collect_job_id": start_response.json()["collect_job_id"],
        "status": "running",
        "batch_target": 500,
    }
    assert get_collect_job(
        database_path=storage.database_path,
        job_id=start_response.json()["collect_job_id"],
    ).status == "running"
    assert get_collect_job(
        database_path=storage.database_path,
        job_id=start_response.json()["collect_job_id"],
    ).batch_target == 500


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
        "pause_reason": "",
        "candidate_offset": 1,
        "candidate_limit": 2,
        "batch_target": 10,
        "candidate_progress_processed": 0,
        "candidate_progress_total": 2,
        "imported_object_count": 1,
        "imported_image_count": 1,
        "continue_candidate_offset": None,
    }
    assert response.json()["provider_focus"] == [
        {"provider": "met", "search_set_count": 1, "imported_image_count": 1}
    ]


def test_api_returns_collection_objects_newest_first(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.get("/search-sets/snake-study/objects")

    assert response.status_code == 200
    objects = response.json()["objects"]
    assert [museum_object["object_id"] for museum_object in objects] == [40, 20]
    assert objects[0] == {
        "provider": "met",
        "object_id": 40,
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "image_count": 3,
        "cover_image_asset_id": objects[0]["cover_image_asset_id"],
        "cover_original_width": 1600,
        "cover_original_height": 800,
        "cover_thumb_url": f"/image-assets/{objects[0]['cover_image_asset_id']}/thumb",
        "has_sibling_images": True,
        "is_favorite": False,
    }
    assert objects[1]["image_count"] == 1
    assert objects[1]["has_sibling_images"] is False


def test_api_paginates_collection_objects_with_total_count(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.get("/search-sets/snake-study/objects?limit=1&offset=1")

    assert response.status_code == 200
    payload = response.json()
    assert [museum_object["object_id"] for museum_object in payload["objects"]] == [20]
    assert payload["pagination"] == {
        "total": 2,
        "count": 1,
        "limit": 1,
        "offset": 1,
        "has_more": False,
    }


def test_api_returns_collection_image_assets_newest_first(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.get("/search-sets/snake-study/image-assets")

    assert response.status_code == 200
    image_assets = response.json()["image_assets"]
    assert [asset["object_id"] for asset in image_assets] == [40, 40, 40, 20]
    assert len({asset["image_asset_id"] for asset in image_assets}) == 4
    assert image_assets[0] == {
        "image_asset_id": image_assets[0]["image_asset_id"],
        "provider": "met",
        "object_id": 40,
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "image_role": "additional",
        "image_index": 2,
        "original_width": 1600,
        "original_height": 800,
        "image_count": 3,
        "has_sibling_images": True,
        "thumb_url": f"/image-assets/{image_assets[0]['image_asset_id']}/thumb",
        "standard_url": f"/image-assets/{image_assets[0]['image_asset_id']}/standard",
        "is_favorite": False,
        "collections": [{"slug": "snake-study", "display_name": "Snake Study"}],
    }
    assert response.json()["pagination"] == {
        "total": 4,
        "count": 4,
        "limit": None,
        "offset": 0,
        "has_more": False,
    }


def test_api_returns_read_only_collection_local_result_set_with_query_counts_and_facets(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class TrackingGridCandidateClient:
        def __init__(self) -> None:
            self.queries: list[str] = []

        def search_object_ids(self, term: str) -> list[int]:
            self.queries.append(term)
            assert term == "snake"
            return [20, 40]

    candidate_client = TrackingGridCandidateClient()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=candidate_client,
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    provider_queries = list(candidate_client.queries)

    response = client.get(
        "/search-sets/snake-study/local-result-set?view=objects&q=ceramics"
    )

    assert response.status_code == 200
    payload = response.json()
    assert candidate_client.queries == provider_queries
    assert payload["query"] == "ceramics"
    assert payload["provider"] == "all"
    assert payload["view"] == "objects"
    assert payload["counts"] == {"objects": 1, "images": 3}
    assert payload["provider_facets"] == [
        {"provider": "met", "object_count": 1, "image_count": 3}
    ]
    assert [museum_object["object_id"] for museum_object in payload["objects"]] == [40]
    assert payload["image_assets"] == []
    assert payload["pagination"] == {
        "total": 1,
        "count": 1,
        "limit": None,
        "offset": 0,
        "has_more": False,
    }

    filtered_response = client.get(
        "/search-sets/snake-study/local-result-set"
        "?view=images&q=ceramics&provider=unknown&limit=2"
    )

    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert filtered_payload["counts"] == {"objects": 1, "images": 3}
    assert filtered_payload["provider_facets"] == [
        {"provider": "met", "object_count": 1, "image_count": 3}
    ]
    assert filtered_payload["image_assets"] == []
    assert filtered_payload["pagination"] == {
        "total": 0,
        "count": 0,
        "limit": 2,
        "offset": 0,
        "has_more": False,
    }

    paged_response = client.get(
        "/search-sets/snake-study/local-result-set"
        "?view=images&q=ceramics&provider=met&limit=2&offset=1"
    )

    assert paged_response.status_code == 200
    paged_payload = paged_response.json()
    assert [asset["object_id"] for asset in paged_payload["image_assets"]] == [40, 40]
    assert paged_payload["pagination"] == {
        "total": 3,
        "count": 2,
        "limit": 2,
        "offset": 1,
        "has_more": False,
    }


def test_api_returns_user_library_image_assets_once_with_collection_membership(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")

    response = client.get("/library/image-assets")

    assert response.status_code == 200
    image_assets = response.json()["image_assets"]
    dashboard_provider = client.get("/dashboard").json()["provider_focus"][0]
    assert dashboard_provider["imported_image_count"] == 4
    assert len(image_assets) == dashboard_provider["imported_image_count"]
    assert [asset["object_id"] for asset in image_assets] == [40, 40, 40, 20]
    assert len({asset["image_asset_id"] for asset in image_assets}) == 4
    assert image_assets[0] == {
        "image_asset_id": image_assets[0]["image_asset_id"],
        "provider": "met",
        "object_id": 40,
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "image_role": "additional",
        "image_index": 2,
        "original_width": 1600,
        "original_height": 800,
        "image_count": 3,
        "has_sibling_images": True,
        "thumb_url": f"/image-assets/{image_assets[0]['image_asset_id']}/thumb",
        "standard_url": f"/image-assets/{image_assets[0]['image_asset_id']}/standard",
        "is_favorite": False,
        "collections": [
            {"slug": "snake-study", "display_name": "Snake Study"},
            {"slug": "bowl-study", "display_name": "Bowl Study"},
        ],
    }

    filtered_response = client.get("/library/image-assets?filter=Bowl%20Study")

    assert filtered_response.status_code == 200
    assert [asset["object_id"] for asset in filtered_response.json()["image_assets"]] == [
        40,
        40,
        40,
    ]


def test_api_returns_user_library_objects_once_with_collection_membership(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")

    response = client.get("/library/objects")

    assert response.status_code == 200
    objects = response.json()["objects"]
    assert [museum_object["object_id"] for museum_object in objects] == [40, 20]
    assert objects[0] == {
        "provider": "met",
        "object_id": 40,
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "image_count": 3,
        "cover_image_asset_id": objects[0]["cover_image_asset_id"],
        "cover_original_width": 1600,
        "cover_original_height": 800,
        "cover_thumb_url": f"/image-assets/{objects[0]['cover_image_asset_id']}/thumb",
        "has_sibling_images": True,
        "is_favorite": False,
        "collections": [
            {"slug": "bowl-study", "display_name": "Bowl Study"},
            {"slug": "snake-study", "display_name": "Snake Study"},
        ],
    }
    assert len({(museum_object["provider"], museum_object["object_id"]) for museum_object in objects}) == 2

    filtered_response = client.get("/library/objects?filter=Bowl%20Study")

    assert filtered_response.status_code == 200
    assert [museum_object["object_id"] for museum_object in filtered_response.json()["objects"]] == [40]


def test_api_object_favorites_are_global_and_filterable(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")

    favorite_response = client.put("/objects/met/40/favorite")

    assert favorite_response.status_code == 200
    assert favorite_response.json() == {
        "provider": "met",
        "object_id": 40,
        "is_favorite": True,
    }
    snake_objects = client.get("/search-sets/snake-study/objects").json()["objects"]
    bowl_objects = client.get("/search-sets/bowl-study/objects").json()["objects"]
    library_objects = client.get("/library/objects").json()["objects"]
    assert [
        (museum_object["object_id"], museum_object["is_favorite"])
        for museum_object in snake_objects
    ] == [(40, True), (20, False)]
    assert [
        (museum_object["object_id"], museum_object["is_favorite"])
        for museum_object in bowl_objects
    ] == [(40, True)]
    assert [
        (museum_object["object_id"], museum_object["is_favorite"])
        for museum_object in library_objects
    ] == [(40, True), (20, False)]

    favorite_only = client.get("/library/objects?favorite=true").json()["objects"]
    collection_favorite_only = client.get(
        "/search-sets/snake-study/local-result-set?view=objects&favorite=true"
    ).json()

    assert [museum_object["object_id"] for museum_object in favorite_only] == [40]
    assert [museum_object["object_id"] for museum_object in collection_favorite_only["objects"]] == [
        40
    ]
    assert collection_favorite_only["counts"] == {"objects": 1, "images": 0}

    unfavorite_response = client.delete("/objects/met/40/favorite")

    assert unfavorite_response.status_code == 200
    assert unfavorite_response.json() == {
        "provider": "met",
        "object_id": 40,
        "is_favorite": False,
    }
    assert client.get("/library/objects?favorite=true").json()["objects"] == []


def test_api_image_favorites_are_separate_filterable_and_exported(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")
    selected_image_asset = client.get(
        "/search-sets/snake-study/image-assets"
    ).json()["image_assets"][0]

    favorite_response = client.put(
        f"/image-assets/{selected_image_asset['image_asset_id']}/favorite"
    )

    assert favorite_response.status_code == 200
    assert favorite_response.json() == {
        "image_asset_id": selected_image_asset["image_asset_id"],
        "is_favorite": True,
    }
    assert client.get("/search-sets/snake-study/objects").json()["objects"][0][
        "is_favorite"
    ] is False
    snake_image_assets = client.get("/search-sets/snake-study/image-assets").json()[
        "image_assets"
    ]
    bowl_image_assets = client.get("/search-sets/bowl-study/image-assets").json()[
        "image_assets"
    ]
    library_image_assets = client.get("/library/image-assets").json()["image_assets"]
    assert [
        (image_asset["image_asset_id"], image_asset["is_favorite"])
        for image_asset in snake_image_assets
    ] == [
        (selected_image_asset["image_asset_id"], True),
        (snake_image_assets[1]["image_asset_id"], False),
        (snake_image_assets[2]["image_asset_id"], False),
        (snake_image_assets[3]["image_asset_id"], False),
    ]
    assert [
        image_asset["is_favorite"]
        for image_asset in bowl_image_assets
        if image_asset["image_asset_id"] == selected_image_asset["image_asset_id"]
    ] == [True]
    assert [
        image_asset["image_asset_id"]
        for image_asset in library_image_assets
        if image_asset["is_favorite"]
    ] == [selected_image_asset["image_asset_id"]]

    collection_favorite_only = client.get(
        "/search-sets/snake-study/local-result-set?view=images&favorite=true"
    ).json()
    library_favorite_only = client.get(
        "/library/local-result-set?view=images&favorite=true"
    ).json()

    assert [
        image_asset["image_asset_id"]
        for image_asset in collection_favorite_only["image_assets"]
    ] == [selected_image_asset["image_asset_id"]]
    assert [
        image_asset["image_asset_id"]
        for image_asset in library_favorite_only["image_assets"]
    ] == [selected_image_asset["image_asset_id"]]

    export_response = client.post(
        "/search-sets/snake-study/exports",
        json={"format": "jsonl"},
    )
    rows = [
        json.loads(line)
        for line in (Path(export_response.json()["export_path"]) / "manifest.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    selected_row = next(
        row
        for row in rows
        if row["image_asset"]["image_asset_id"] == selected_image_asset["image_asset_id"]
    )
    assert selected_row["image_asset"]["is_favorite"] is True
    assert selected_row["museum_object"]["is_favorite"] is False

    unfavorite_response = client.delete(
        f"/image-assets/{selected_image_asset['image_asset_id']}/favorite"
    )

    assert unfavorite_response.status_code == 200
    assert unfavorite_response.json() == {
        "image_asset_id": selected_image_asset["image_asset_id"],
        "is_favorite": False,
    }
    assert client.get("/library/image-assets?favorite=true").json()["image_assets"] == []


def test_api_object_detail_includes_object_and_image_favorite_state(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    selected_image_asset = client.get(
        "/search-sets/snake-study/local-result-set?view=images"
    ).json()["image_assets"][0]

    client.put("/objects/met/40/favorite")
    client.put(f"/image-assets/{selected_image_asset['image_asset_id']}/favorite")

    collection_detail = client.get("/search-sets/snake-study/objects/met/40").json()
    library_detail = client.get("/library/objects/met/40").json()

    assert collection_detail["object"]["is_favorite"] is True
    assert library_detail["object"]["is_favorite"] is True
    assert [
        image["is_favorite"]
        for image in collection_detail["images"]
        if image["image_asset_id"] == selected_image_asset["image_asset_id"]
    ] == [True]
    assert [
        image["is_favorite"]
        for image in library_detail["images"]
        if image["image_asset_id"] == selected_image_asset["image_asset_id"]
    ] == [True]


def test_api_removes_selected_object_from_collection_without_deleting_library(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.post(
        "/search-sets/snake-study/remove-from-collection",
        json={
            "selection": {
                "objects": [{"provider": "met", "object_id": 40}],
            },
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "removed_objects": 1,
        "removed_image_assets": 0,
    }
    collection_objects = client.get(
        "/search-sets/snake-study/local-result-set?view=objects"
    ).json()["objects"]
    library_objects = client.get("/library/local-result-set?view=objects").json()[
        "objects"
    ]
    assert [museum_object["object_id"] for museum_object in collection_objects] == [20]
    assert [museum_object["object_id"] for museum_object in library_objects] == [40, 20]


def test_api_filters_user_library_to_no_collection_material(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    client.put("/objects/met/40/favorite")
    client.post(
        "/search-sets/snake-study/remove-from-collection",
        json={
            "selection": {
                "objects": [{"provider": "met", "object_id": 40}],
            },
        },
    )

    orphan_objects = client.get(
        "/library/local-result-set?view=objects&collection=none"
    ).json()
    orphan_images = client.get(
        "/library/local-result-set?view=images&collection=none"
    ).json()
    favorite_orphan_objects = client.get(
        "/library/local-result-set?view=objects&collection=none&favorite=true"
    ).json()
    all_library_objects = client.get("/library/local-result-set?view=objects").json()

    assert [museum_object["object_id"] for museum_object in orphan_objects["objects"]] == [
        40
    ]
    assert orphan_objects["counts"] == {"objects": 1, "images": 3}
    assert [image_asset["object_id"] for image_asset in orphan_images["image_assets"]] == [
        40,
        40,
        40,
    ]
    assert orphan_images["counts"] == {"objects": 1, "images": 3}
    assert [
        museum_object["object_id"]
        for museum_object in favorite_orphan_objects["objects"]
    ] == [40]
    assert [museum_object["object_id"] for museum_object in all_library_objects["objects"]] == [
        40,
        20,
    ]


def test_api_exports_selected_user_library_orphan_object(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    client.put("/objects/met/40/favorite")
    selected_image_asset = client.get(
        "/search-sets/snake-study/local-result-set?view=images"
    ).json()["image_assets"][0]
    client.put(f"/image-assets/{selected_image_asset['image_asset_id']}/favorite")
    client.post(
        "/search-sets/snake-study/remove-from-collection",
        json={
            "selection": {
                "objects": [{"provider": "met", "object_id": 40}],
            },
        },
    )

    response = client.post(
        "/library/exports",
        json={
            "format": "jsonl",
            "selection": {
                "objects": [{"provider": "met", "object_id": 40}],
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["format"] == "jsonl"
    assert payload["row_count"] == 3
    rows = [
        json.loads(line)
        for line in (Path(payload["export_path"]) / "manifest.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert {row["image_asset"]["object_id"] for row in rows} == {40}
    assert {row["collection"]["scope"] for row in rows} == {"user-library"}
    assert {row["collection"]["slug"] for row in rows} == {"user-library"}
    assert {row["museum_object"]["is_favorite"] for row in rows} == {True}
    assert any(row["image_asset"]["is_favorite"] for row in rows)


def test_api_deletes_selected_image_asset_globally_and_removes_local_files(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    selected_image_asset = client.get(
        "/search-sets/snake-study/local-result-set?view=images"
    ).json()["image_assets"][0]
    assert client.get(selected_image_asset["standard_url"]).status_code == 200
    assert client.get(selected_image_asset["thumb_url"]).status_code == 200

    response = client.post(
        "/curation/delete",
        json={
            "selection": {
                "image_asset_ids": [selected_image_asset["image_asset_id"]],
            },
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "deleted_objects": 0,
        "deleted_image_assets": 1,
    }
    assert client.get(selected_image_asset["standard_url"]).status_code == 404
    assert client.get(selected_image_asset["thumb_url"]).status_code == 404
    collection_image_assets = client.get(
        "/search-sets/snake-study/local-result-set?view=images"
    ).json()["image_assets"]
    library_image_assets = client.get("/library/local-result-set?view=images").json()[
        "image_assets"
    ]
    assert selected_image_asset["image_asset_id"] not in {
        image_asset["image_asset_id"] for image_asset in collection_image_assets
    }
    assert selected_image_asset["image_asset_id"] not in {
        image_asset["image_asset_id"] for image_asset in library_image_assets
    }


def test_api_reports_retryable_delete_file_cleanup_failure(tmp_path, monkeypatch):
    from anacronia import api as api_module
    from anacronia.curation import CollectionFileCleanupError

    storage = initialize_storage(project_root=tmp_path)

    def fail_delete_image_asset(**_kwargs):
        raise CollectionFileCleanupError(
            path=Path("/tmp/anacronia-busy-image.ppm"),
            original_error=PermissionError("file busy"),
        )

    monkeypatch.setattr(
        api_module,
        "delete_image_asset_from_anacronia",
        fail_delete_image_asset,
    )
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
        )
    )

    response = client.post(
        "/curation/delete",
        json={"selection": {"image_asset_ids": [123]}},
    )

    assert response.status_code == 409
    assert response.json()["detail"].startswith("Could not delete local file")


def test_api_returns_user_library_object_detail_without_collection_slug(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")

    response = client.get("/library/objects/met/40")

    assert response.status_code == 200
    detail = response.json()
    assert detail["object"]["object_id"] == 40
    assert detail["object"]["title"] == "Coiled Snake Bowl"
    assert [image["image_role"] for image in detail["images"]] == [
        "primary",
        "additional",
        "additional",
    ]
    assert [match["search_term"] for match in detail["matches"]] == ["bowl", "snake"]
    assert detail["matches"][0]["matched_fields"] == ["objectName", "title"]
    assert detail["matches"][1]["matched_fields"] == ["tags", "title"]
    assert detail["skipped_image_references"] == [
        {
            "source_image_url": "https://images.metmuseum.org/40-skipped.jpg",
            "image_role": "additional",
            "image_index": 3,
            "reason": "beyond_max_images_per_object",
        }
    ]

    missing_response = client.get("/library/objects/met/999999")

    assert missing_response.status_code == 404


def test_api_returns_user_library_local_result_set_with_counts_and_facets(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")

    response = client.get("/library/local-result-set?view=objects&q=Bowl%20Study")

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "bowl study"
    assert payload["provider"] == "all"
    assert payload["view"] == "objects"
    assert payload["counts"] == {"objects": 1, "images": 3}
    assert payload["provider_facets"] == [
        {"provider": "met", "object_count": 1, "image_count": 3}
    ]
    assert [museum_object["object_id"] for museum_object in payload["objects"]] == [40]
    assert payload["objects"][0]["collections"] == [
        {"slug": "bowl-study", "display_name": "Bowl Study"},
        {"slug": "snake-study", "display_name": "Snake Study"},
    ]
    assert payload["image_assets"] == []
    assert payload["pagination"] == {
        "total": 1,
        "count": 1,
        "limit": None,
        "offset": 0,
        "has_more": False,
    }

    filtered_response = client.get(
        "/library/local-result-set?view=images&q=Bowl%20Study&provider=unknown&limit=2"
    )

    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert filtered_payload["counts"] == {"objects": 1, "images": 3}
    assert filtered_payload["provider_facets"] == [
        {"provider": "met", "object_count": 1, "image_count": 3}
    ]
    assert filtered_payload["image_assets"] == []
    assert filtered_payload["pagination"] == {
        "total": 0,
        "count": 0,
        "limit": 2,
        "offset": 0,
        "has_more": False,
    }

    paged_response = client.get(
        "/library/local-result-set?view=images&q=Bowl%20Study&provider=met&limit=2&offset=1"
    )

    assert paged_response.status_code == 200
    paged_payload = paged_response.json()
    assert [asset["object_id"] for asset in paged_payload["image_assets"]] == [40, 40]
    assert paged_payload["pagination"] == {
        "total": 3,
        "count": 2,
        "limit": 2,
        "offset": 1,
        "has_more": False,
    }


def test_api_paginates_filtered_user_library_after_searching_all_assets(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedLibraryCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20, 40],
                "bowl": [40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedLibraryCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    snake_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{snake_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Bowl Study", "terms_text": "bowl"},
    )
    bowl_run_response = client.post(
        "/search-sets/bowl-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{bowl_run_response.json()['run_id']}/ingest")

    response = client.get("/library/image-assets?filter=Bowl%20Study&limit=2&offset=1")

    assert response.status_code == 200
    payload = response.json()
    assert [asset["object_id"] for asset in payload["image_assets"]] == [40, 40]
    assert payload["pagination"] == {
        "total": 3,
        "count": 2,
        "limit": 2,
        "offset": 1,
        "has_more": False,
    }


def test_api_counts_only_processed_collection_matches_not_future_candidates(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    class SharedCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            return {
                "snake": [20],
                "hand": [20, 40],
            }[term]

    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=SharedCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    first_run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{first_run_response.json()['run_id']}/ingest")
    client.post(
        "/search-sets",
        json={"display_name": "Hands", "terms_text": "hand"},
    )
    client.post(
        "/search-sets/hands/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )

    dashboard = client.get("/dashboard").json()
    hands_provider = next(
        search_set["provider_collections"][0]
        for search_set in dashboard["search_sets"]
        if search_set["slug"] == "hands"
    )
    objects_response = client.get("/search-sets/hands/objects")

    assert hands_provider["imported_object_count"] == 0
    assert hands_provider["imported_image_count"] == 0
    assert objects_response.status_code == 200
    assert objects_response.json()["objects"] == []


def test_api_returns_collection_object_detail_for_overlay(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.get("/search-sets/snake-study/objects/met/40")

    assert response.status_code == 200
    detail = response.json()
    assert detail["object"] == {
        "provider": "met",
        "object_id": 40,
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "artist_display_bio": "American, 1900-1970",
        "artist_nationality": "American",
        "department": "Greek and Roman Art",
        "object_date": "ca. 1890",
        "medium": "Terracotta",
        "dimensions": "H. 4 in. (10.2 cm)",
        "classification": "Ceramics",
        "credit_line": "Gift of Anacronia",
        "accession_number": "40.1",
        "repository": "Metropolitan Museum of Art, New York, NY",
        "tags": ["Snake"],
        "object_url": "https://www.metmuseum.org/art/collection/search/40",
        "is_public_domain": True,
        "rights_and_reproduction": "Public domain",
        "metadata_date": "2026-01-02",
        "is_favorite": False,
    }
    assert [image["image_role"] for image in detail["images"]] == [
        "primary",
        "additional",
        "additional",
    ]
    assert {image["is_favorite"] for image in detail["images"]} == {False}
    assert detail["images"][0]["thumb_url"] == f"/image-assets/{detail['images'][0]['image_asset_id']}/thumb"
    assert detail["images"][0]["standard_url"] == f"/image-assets/{detail['images'][0]['image_asset_id']}/standard"
    assert detail["matches"] == [
        {
            "search_term": "snake",
            "verified": True,
            "matched_fields": ["tags", "title"],
        }
    ]
    assert detail["skipped_image_references"] == [
        {
            "source_image_url": "https://images.metmuseum.org/40-skipped.jpg",
            "image_role": "additional",
            "image_index": 3,
            "reason": "beyond_max_images_per_object",
        }
    ]


def test_api_serves_local_image_derivatives(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    image_asset_id = client.get("/search-sets/snake-study/objects").json()["objects"][0][
        "cover_image_asset_id"
    ]

    thumb_response = client.get(f"/image-assets/{image_asset_id}/thumb")
    standard_response = client.get(f"/image-assets/{image_asset_id}/standard")

    assert thumb_response.status_code == 200
    assert thumb_response.headers["content-type"] == "image/jpeg"
    assert thumb_response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert standard_response.status_code == 200
    assert standard_response.headers["content-type"] == "image/jpeg"
    assert standard_response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_api_exports_collection_jsonl_with_absolute_path(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.post("/search-sets/snake-study/exports", json={"format": "jsonl"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["format"] == "jsonl"
    assert payload["row_count"] == 1
    assert payload["skipped_image_asset_count"] == 0
    assert payload["skipped_image_assets"] == []
    assert payload["export_path"].startswith(str(storage.data_root / "exports" / "snake-study"))
    assert (storage.data_root / "exports" / "snake-study").is_dir()


def test_api_exports_selected_image_assets_only(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    image_assets = client.get(
        "/search-sets/snake-study/local-result-set?view=images"
    ).json()["image_assets"]
    selected_image_asset_id = image_assets[0]["image_asset_id"]

    response = client.post(
        "/search-sets/snake-study/exports",
        json={
            "format": "jsonl",
            "selection": {"image_asset_ids": [selected_image_asset_id]},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["row_count"] == 1
    rows = [
        json.loads(line)
        for line in (Path(payload["export_path"]) / "manifest.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert [row["image_asset"]["image_asset_id"] for row in rows] == [
        selected_image_asset_id
    ]


def test_api_exports_selected_objects_as_image_asset_rows(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 2},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")

    response = client.post(
        "/search-sets/snake-study/exports",
        json={
            "format": "jsonl",
            "selection": {
                "objects": [{"provider": "met", "object_id": 40}],
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["row_count"] == 3
    rows = [
        json.loads(line)
        for line in (Path(payload["export_path"]) / "manifest.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert {row["image_asset"]["object_id"] for row in rows} == {40}


def test_api_rejects_export_for_zero_image_collection(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(create_app(database_path=storage.database_path, data_root=storage.data_root))
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )

    response = client.post("/search-sets/snake-study/exports", json={"format": "jsonl"})

    assert response.status_code == 409
    assert response.json()["detail"] == "Collection has no Image Assets to export."


def test_api_rejects_export_while_collection_search_is_running(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            met_candidate_client=FakeMetGridCandidateClient(),
            met_record_client=FakeMetGridRecordClient(),
            download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        )
    )
    client.post(
        "/search-sets",
        json={"display_name": "Snake Study", "terms_text": "snake"},
    )
    run_response = client.post(
        "/search-sets/snake-study/provider-collections/met/runs",
        json={"candidate_offset": 0, "candidate_limit": 1},
    )
    client.post(f"/provider-collections/met/runs/{run_response.json()['run_id']}/ingest")
    start_collect_job(
        database_path=storage.database_path,
        run_id=run_response.json()["run_id"],
        candidate_offset=0,
        candidate_limit=1,
        candidate_progress_total=1,
        batch_target=100,
        max_images_per_object=DEFAULT_MAX_IMAGES_PER_OBJECT,
        available_disk_bytes=10_000_000,
    )

    response = client.post("/search-sets/snake-study/exports", json={"format": "jsonl"})

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Collection export is unavailable while a Provider Search is active."
    )
