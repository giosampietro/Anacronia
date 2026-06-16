import json
import time
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image

from anacronia.analysis_jobs import AnalysisStageArtifact, AnalysisStageResult
from anacronia.analysis_result_registry import LocalAnalysisResultRegistry
from anacronia.api import create_app
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.storage import initialize_storage


def write_image(path, *, size=(640, 320), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def create_collection(tmp_path, *, display_name="Analysis Board"):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name=display_name,
        folder_path=folder,
    )
    return storage


def analysis_result_manifest(analysis_result_id="analysis-result-20260614T130000Z-dinov3_vits_384"):
    return {
        "analysis_kind": "latent-map",
        "analysis_job_id": "analysis-job-20260614T130000Z",
        "analysis_result_id": analysis_result_id,
        "asset_kind": "analysis-result-manifest",
        "created_at": "2026-06-14T13:00:00Z",
        "explorer_readiness": {
            "missing_optional_artifact_keys": [],
            "missing_required_artifact_keys": [],
            "ready": True,
        },
        "export_safety": {
            "contains_local_absolute_paths": False,
            "contains_secrets": False,
            "contains_temporary_paths": False,
        },
        "item_count": 2,
        "output_counts": {
            "artifacts": {"durable": 3, "render-cache": 1, "total": 4}
        },
        "recipes": [
            {
                "recipe_name": "dinov3_vits_384",
                "recipe": {"model_id": "facebook/dinov3-vits16-pretrain-lvd1689m"},
            }
        ],
        "schema_version": 1,
        "scope_snapshot": {
            "item_count": 2,
            "snapshot_id": "analysis-scope-20260614T130000Z",
            "snapshot_key": "analysis-scopes/analysis-scope-20260614T130000Z.json",
        },
        "sibling_group_id": "analysis-sibling-20260614T130000Z",
        "source": {
            "kind": "analysis-scope-snapshot",
            "source_folder_name": "Bread",
        },
        "status": "ready",
        "staleness": {
            "added_image_count": 0,
            "removed_image_count": 0,
            "state": "current",
        },
        "viewer": {
            "open_href": f"/latent-map?analysisResultId={analysis_result_id}"
        },
        "artifacts": [
            {
                "byte_size": 3,
                "content_type": "application/x-jsonlines",
                "key": "manifest.jsonl",
                "required": True,
                "retention_class": "durable",
                "role": "image-manifest",
            },
            {
                "byte_size": 2,
                "content_type": "application/json",
                "key": "layouts/dinov3_vits_384_umap.json",
                "required": True,
                "retention_class": "durable",
                "role": "layout",
            },
            {
                "byte_size": 5,
                "content_type": "application/octet-stream",
                "key": "indexes/dinov3_vits_384_flat_ip.faiss",
                "required": True,
                "retention_class": "durable",
                "role": "faiss-index",
            },
            {
                "byte_size": 2,
                "content_type": "application/json",
                "key": "viewer/atlases/32px/atlas-manifest.json",
                "required": False,
                "retention_class": "render-cache",
                "role": "thumbnail-atlas",
            },
        ],
    }


def write_manifest_artifacts(data_root, manifest):
    result_dir = data_root / "analysis-results" / manifest["analysis_result_id"]
    for artifact in manifest["artifacts"]:
        path = result_dir / artifact["key"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * artifact["byte_size"])


class FakeStageRunner:
    def __init__(self):
        self.calls = []

    def run_stage(self, request):
        self.calls.append((request.stage_name, request.recipe.recipe_id))
        artifact = {
            "embedding_computation": AnalysisStageArtifact(
                key=f"embeddings/{request.recipe.recipe_id}.npy",
                role="embedding",
                content_type="application/octet-stream",
                retention_class="durable",
            ),
            "faiss": AnalysisStageArtifact(
                key=f"indexes/{request.recipe.recipe_id}_flat_ip.faiss",
                role="faiss-index",
                content_type="application/octet-stream",
                retention_class="durable",
            ),
            "umap": AnalysisStageArtifact(
                key=f"layouts/{request.recipe.recipe_id}_umap_default.json",
                role="layout",
                content_type="application/json",
                retention_class="durable",
                metadata={"layout_id": "umap_default"},
            ),
            "hdbscan": AnalysisStageArtifact(
                key=f"clusters/{request.recipe.recipe_id}_hdbscan_default.json",
                role="cluster-result",
                content_type="application/json",
                retention_class="durable",
                metadata={"cluster_id": "hdbscan_default"},
            ),
            "atlas_generation": AnalysisStageArtifact(
                key="viewer/atlases/32px/atlas-manifest.json",
                role="thumbnail-atlas",
                content_type="application/json",
                retention_class="render-cache",
            ),
        }[request.stage_name]
        artifact_path = request.analysis_result_dir / artifact.key
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text("{}", encoding="utf-8")
        return AnalysisStageResult(artifacts=[artifact])


def wait_for_api_job_status(client, analysis_job_id, status, *, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        jobs = client.get("/analysis-jobs").json()["jobs"]
        for job in jobs:
            if job["analysis_job_id"] == analysis_job_id and job["status"] == status:
                return job
        time.sleep(0.02)
    raise AssertionError(f"Analysis Job {analysis_job_id} did not reach {status!r}.")


def test_analysis_recipe_api_returns_browser_safe_catalog(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get("/analysis-recipes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["default_recipe_id"] == "dinov3_vits_384"
    assert [recipe["recipe_id"] for recipe in payload["recipes"]] == [
        "dinov3_vits_256",
        "dinov3_vits_384",
        "dinov3_vits_512",
    ]
    assert payload["recipes"][1]["stage_plan"]["atlas_levels"] == {
        "default": [32, 64, 96],
        "optional": [128],
    }
    assert payload["recipes"][1]["stage_plan"]["clusters"] == {
        "noise_label": "Unclustered",
        "optional": ["kmeans"],
        "primary": "hdbscan",
    }
    assert str(storage.data_root) not in json.dumps(payload)


def test_analysis_api_creates_persistent_analysis_and_starts_job(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = FakeStageRunner()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=stage_runner,
        )
    )

    response = client.post(
        "/analyses",
        json={
            "title": "Bread visual study",
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    analysis = payload["analysis"]
    assert analysis["analysis_id"].startswith("analysis-")
    assert analysis["title"] == "Bread visual study"
    assert analysis["source_collections"] == [
        {"label": "Analysis Board", "slug": "analysis-board"}
    ]
    assert analysis["analysis_job_ids"] == [payload["job"]["analysis_job_id"]]
    assert analysis["variants"] == []
    assert analysis["status"] in {"ready", "running"}
    assert payload["job"]["status"] == "running"

    list_response = client.get("/analyses")

    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert str(storage.data_root) not in json.dumps(list_payload)
    assert [item["analysis_id"] for item in list_payload["analyses"]] == [
        analysis["analysis_id"]
    ]
    assert list_payload["analyses"][0]["title"] == "Bread visual study"


def test_analysis_api_requires_title_before_starting_job(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = FakeStageRunner()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=stage_runner,
        )
    )

    response = client.post(
        "/analyses",
        json={
            "title": "   ",
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Analysis title is required."
    assert stage_runner.calls == []
    assert client.get("/analyses").json()["analyses"] == []
    assert client.get("/analysis-jobs").json()["jobs"] == []


def test_analysis_api_requires_source_collection_before_starting_job(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = FakeStageRunner()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=stage_runner,
        )
    )

    response = client.post(
        "/analyses",
        json={
            "title": "No source scope",
            "collection_slugs": [],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "At least one Collection is required for an Analysis Scope."
    )
    assert stage_runner.calls == []
    assert client.get("/analyses").json()["analyses"] == []
    assert client.get("/analysis-jobs").json()["jobs"] == []


def test_analysis_api_loads_analysis_by_stable_id(tmp_path):
    storage = create_collection(tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=FakeStageRunner(),
        )
    )
    created = client.post(
        "/analyses",
        json={
            "title": "Stable selected analysis",
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    ).json()["analysis"]

    response = client.get(f"/analyses/{created['analysis_id']}")

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload["analysis"]["analysis_id"] == created["analysis_id"]
    assert payload["analysis"]["title"] == "Stable selected analysis"


def test_analysis_api_renames_only_analysis_title(tmp_path):
    storage = create_collection(tmp_path)
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=FakeStageRunner(),
        )
    )
    created = client.post(
        "/analyses",
        json={
            "title": "Original title",
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    ).json()["analysis"]

    response = client.patch(
        f"/analyses/{created['analysis_id']}",
        json={"title": "Renamed title"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    renamed = payload["analysis"]
    assert renamed["analysis_id"] == created["analysis_id"]
    assert renamed["title"] == "Renamed title"
    assert renamed["source_collections"] == created["source_collections"]
    assert renamed["analysis_job_ids"] == created["analysis_job_ids"]
    loaded = client.get(f"/analyses/{created['analysis_id']}").json()["analysis"]
    assert loaded["title"] == "Renamed title"


def test_analysis_api_lists_completed_result_as_variant(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = FakeStageRunner()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=stage_runner,
        )
    )
    created_payload = client.post(
        "/analyses",
        json={
            "title": "Variant source",
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    ).json()
    analysis_id = created_payload["analysis"]["analysis_id"]
    ready_job = wait_for_api_job_status(
        client,
        created_payload["job"]["analysis_job_id"],
        "ready",
    )
    result_id = ready_job["analysis_result_ids"][0]

    response = client.get(f"/analyses/{analysis_id}")

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload["analysis"]["status"] == "ready"
    assert payload["analysis"]["variants"] == [
        {
            "analysis_result_id": result_id,
            "explorer_href": f"/latent-map?analysisResultId={result_id}",
            "status": "ready",
        }
    ]


def test_analysis_api_keeps_failed_analysis_without_result(tmp_path, monkeypatch):
    storage = create_collection(tmp_path, display_name="Failure Board")

    class FastFailProductionRunner:
        def run_stage(self, request):
            raise RuntimeError("production runner unavailable in test")

    monkeypatch.setattr(
        "anacronia.api.LatentMapAnalysisStageRunner",
        lambda: FastFailProductionRunner(),
    )
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    created_payload = client.post(
        "/analyses",
        json={
            "title": "Failed run stays visible",
            "collection_slugs": ["failure-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    ).json()
    failed_job = wait_for_api_job_status(
        client,
        created_payload["job"]["analysis_job_id"],
        "failed",
    )

    response = client.get(
        f"/analyses/{created_payload['analysis']['analysis_id']}",
    )

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    analysis = payload["analysis"]
    assert analysis["status"] == "failed"
    assert analysis["title"] == "Failed run stays visible"
    assert analysis["source_collections"] == [
        {"label": "Failure Board", "slug": "failure-board"}
    ]
    assert analysis["analysis_job_ids"] == [failed_job["analysis_job_id"]]
    assert analysis["variants"] == []


def test_analysis_result_api_lists_registry_summaries_without_local_paths(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    manifest = analysis_result_manifest()
    write_manifest_artifacts(storage.data_root, manifest)
    LocalAnalysisResultRegistry(storage.data_root).register(manifest)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get("/analysis-results")

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload["results"] == [
        {
            "analysis_job_id": "analysis-job-20260614T130000Z",
            "analysis_result_id": manifest["analysis_result_id"],
            "artifact_health": {
                "missing_optional_artifact_keys": [],
                "missing_optional_render_cache_artifact_keys": [],
                "missing_required_artifact_keys": [],
                "ready": True,
            },
            "explorer_href": (
                "/latent-map?analysisResultId="
                "analysis-result-20260614T130000Z-dinov3_vits_384"
            ),
            "explorer_readiness": {
                "missing_optional_artifact_keys": [],
                "missing_optional_render_cache_artifact_keys": [],
                "missing_required_artifact_keys": [],
                "ready": True,
            },
            "export_readiness": {
                "export_safety": manifest["export_safety"],
                "ready": False,
                "state": "not_validated",
            },
            "item_count": 2,
            "recipe_ids": ["dinov3_vits_384"],
            "recipe_names": ["dinov3_vits_384"],
            "result_state": {"complete": True, "state": "ready"},
            "scope_label": "Bread",
            "scope_snapshot_id": "analysis-scope-20260614T130000Z",
            "sibling_group_id": "analysis-sibling-20260614T130000Z",
            "status": "ready",
            "staleness": manifest["staleness"],
            "storage_by_role": {
                "faiss-index": 5,
                "image-manifest": 3,
                "layout": 2,
                "thumbnail-atlas": 2,
            },
            "storage_totals": {
                "durable": 10,
                "render-cache": 2,
                "total": 12,
                "viewer-cache": 0,
            },
        }
    ]
    assert payload["sibling_groups"] == [
        {
            "analysis_job_id": "analysis-job-20260614T130000Z",
            "analysis_result_ids": [manifest["analysis_result_id"]],
            "recipe_ids": ["dinov3_vits_384"],
            "recipe_names": ["dinov3_vits_384"],
            "scope_snapshot_id": "analysis-scope-20260614T130000Z",
            "sibling_group_id": "analysis-sibling-20260614T130000Z",
            "status_counts": {"ready": 1},
        }
    ]


def test_analysis_result_api_lists_historical_partial_result_manifests(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    manifest = analysis_result_manifest("analysis-result-historical-dinov3_vits_384")
    for field in ("explorer_readiness", "export_safety", "output_counts", "staleness"):
        manifest.pop(field)
    write_manifest_artifacts(storage.data_root, manifest)
    result_dir = storage.data_root / "analysis-results" / manifest["analysis_result_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    (result_dir / "analysis-result.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get("/analysis-results")

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload["results"][0]["analysis_result_id"] == manifest["analysis_result_id"]
    assert payload["results"][0]["explorer_readiness"]["ready"] is True
    assert payload["results"][0]["staleness"] == {
        "added_image_count": 0,
        "removed_image_count": 0,
        "state": "current",
    }


def test_analysis_result_api_returns_registry_detail_with_browser_safe_artifacts(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    manifest = analysis_result_manifest()
    write_manifest_artifacts(storage.data_root, manifest)
    LocalAnalysisResultRegistry(storage.data_root).register(manifest)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get(f"/analysis-results/{manifest['analysis_result_id']}")

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload["result"]["analysis_result_id"] == manifest["analysis_result_id"]
    assert payload["result"]["scope_label"] == "Bread"
    assert payload["result"]["explorer_readiness"]["ready"] is True
    assert payload["result"]["recipes"] == [
        {
            "recipe_name": "dinov3_vits_384",
            "recipe": {"model_id": "facebook/dinov3-vits16-pretrain-lvd1689m"},
        }
    ]
    assert payload["result"]["artifacts"] == [
        {
            "byte_size": 3,
            "content_type": "application/x-jsonlines",
            "key": "manifest.jsonl",
            "required": True,
            "retention_class": "durable",
            "role": "image-manifest",
        },
        {
            "byte_size": 2,
            "content_type": "application/json",
            "key": "layouts/dinov3_vits_384_umap.json",
            "required": True,
            "retention_class": "durable",
            "role": "layout",
        },
        {
            "byte_size": 5,
            "content_type": "application/octet-stream",
            "key": "indexes/dinov3_vits_384_flat_ip.faiss",
            "required": True,
            "retention_class": "durable",
            "role": "faiss-index",
        },
        {
            "byte_size": 2,
            "content_type": "application/json",
            "key": "viewer/atlases/32px/atlas-manifest.json",
            "required": False,
            "retention_class": "render-cache",
            "role": "thumbnail-atlas",
        },
    ]
    assert payload["result"]["status"] == "ready"

    missing = client.get("/analysis-results/missing-result")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Analysis Result not found."


def test_analysis_result_api_status_reports_required_and_render_cache_gaps(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    manifest = analysis_result_manifest()
    manifest["artifacts"].append(
        {
            "byte_size": 7,
            "content_type": "application/json",
            "key": "viewer/map-data.json",
            "required": True,
            "retention_class": "viewer-cache",
            "role": "viewer-map-data",
        }
    )
    result_dir = storage.data_root / "analysis-results" / manifest["analysis_result_id"]
    for artifact_key in [
        "manifest.jsonl",
        "indexes/dinov3_vits_384_flat_ip.faiss",
    ]:
        artifact = next(
            artifact
            for artifact in manifest["artifacts"]
            if artifact["key"] == artifact_key
        )
        path = result_dir / artifact_key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * artifact["byte_size"])
    LocalAnalysisResultRegistry(storage.data_root).register(manifest)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get(f"/analysis-results/{manifest['analysis_result_id']}/status")

    assert response.status_code == 200
    payload = response.json()
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload == {
        "analysis_result_id": manifest["analysis_result_id"],
        "artifact_health": {
            "missing_optional_artifact_keys": [
                "viewer/atlases/32px/atlas-manifest.json",
            ],
            "missing_optional_render_cache_artifact_keys": [
                "viewer/atlases/32px/atlas-manifest.json",
            ],
            "missing_required_artifact_keys": [
                "layouts/dinov3_vits_384_umap.json",
                "viewer/map-data.json",
            ],
            "ready": False,
        },
        "explorer_readiness": {
            "missing_optional_artifact_keys": [
                "viewer/atlases/32px/atlas-manifest.json",
            ],
            "missing_optional_render_cache_artifact_keys": [
                "viewer/atlases/32px/atlas-manifest.json",
            ],
            "missing_required_artifact_keys": [
                "layouts/dinov3_vits_384_umap.json",
                "viewer/map-data.json",
            ],
            "ready": False,
        },
        "result_state": {"complete": True, "state": "ready"},
        "status": "ready",
        "storage_totals": {
            "durable": 8,
            "render-cache": 0,
            "total": 8,
            "viewer-cache": 0,
        },
        "staleness": manifest["staleness"],
    }

    missing = client.get("/analysis-results/missing-result/status")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Analysis Result not found."


def test_analysis_result_api_serves_only_declared_browser_safe_artifacts(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    manifest = analysis_result_manifest()
    result_dir = storage.data_root / "analysis-results" / manifest["analysis_result_id"]
    layout_path = result_dir / "layouts/dinov3_vits_384_umap.json"
    layout_path.parent.mkdir(parents=True, exist_ok=True)
    layout_path.write_text('{"layout": true}', encoding="utf-8")
    faiss_path = result_dir / "indexes/dinov3_vits_384_flat_ip.faiss"
    faiss_path.parent.mkdir(parents=True, exist_ok=True)
    faiss_path.write_bytes(b"faiss")
    manifest_path = result_dir / "manifest.jsonl"
    manifest_path.write_text('{"image_id":"image-asset-1"}\n', encoding="utf-8")
    atlas_manifest_path = result_dir / "viewer/atlases/32px/atlas-manifest.json"
    atlas_manifest_path.parent.mkdir(parents=True, exist_ok=True)
    atlas_manifest_path.write_text('{"pages":[]}', encoding="utf-8")
    manifest["artifacts"].append(
        {
            "byte_size": 11,
            "content_type": "image/svg+xml",
            "key": "viewer/unsafe.svg",
            "required": False,
            "retention_class": "render-cache",
            "role": "thumbnail-atlas-page",
        }
    )
    manifest["output_counts"]["artifacts"] = {
        "durable": 3,
        "render-cache": 2,
        "total": 5,
    }
    unsafe_image_path = result_dir / "viewer/unsafe.svg"
    unsafe_image_path.parent.mkdir(parents=True, exist_ok=True)
    unsafe_image_path.write_text("<svg></svg>", encoding="utf-8")
    LocalAnalysisResultRegistry(storage.data_root).register(manifest)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.get(
        "/analysis-results/"
        f"{manifest['analysis_result_id']}/artifacts/"
        "layouts/dinov3_vits_384_umap.json"
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"layout": True}

    unknown = client.get(
        "/analysis-results/"
        f"{manifest['analysis_result_id']}/artifacts/"
        "layouts/not-declared.json"
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "Analysis Result artifact not found."

    unsafe = client.get(
        "/analysis-results/"
        f"{manifest['analysis_result_id']}/artifacts/"
        "%2E%2E/manifest.jsonl"
    )
    assert unsafe.status_code == 404
    assert unsafe.json()["detail"] == "Analysis Result artifact not found."

    binary = client.get(
        "/analysis-results/"
        f"{manifest['analysis_result_id']}/artifacts/"
        "indexes/dinov3_vits_384_flat_ip.faiss"
    )
    assert binary.status_code == 403
    assert binary.json()["detail"] == "Analysis Result artifact is not browser-safe."

    unsafe_image = client.get(
        "/analysis-results/"
        f"{manifest['analysis_result_id']}/artifacts/"
        "viewer/unsafe.svg"
    )
    assert unsafe_image.status_code == 403
    assert unsafe_image.json()["detail"] == (
        "Analysis Result artifact is not browser-safe."
    )


def test_analysis_job_api_starts_job_and_returns_openable_result(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = FakeStageRunner()
    client = TestClient(
        create_app(
            database_path=storage.database_path,
            data_root=storage.data_root,
            analysis_stage_runner=stage_runner,
        )
    )

    response = client.post(
        "/analysis-jobs",
        json={
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "running"
    assert payload["recipe_ids"] == ["dinov3_vits_384"]
    assert payload["analysis_result_ids"] == []
    assert payload["analysis_job_id"].startswith("analysis-job-")
    assert "manifest_path" not in payload
    assert str(storage.data_root) not in json.dumps(payload)

    ready_payload = wait_for_api_job_status(
        client,
        payload["analysis_job_id"],
        "ready",
    )
    assert len(ready_payload["analysis_result_ids"]) == 1
    assert ready_payload["viewer_hrefs"] == [
        f"/latent-map?analysisResultId={ready_payload['analysis_result_ids'][0]}"
    ]
    assert [call[0] for call in stage_runner.calls] == [
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
    ]

    result_manifest = (
        storage.data_root
        / "analysis-results"
        / ready_payload["analysis_result_ids"][0]
        / "analysis-result.json"
    )
    assert result_manifest.is_file()
    assert json.loads(result_manifest.read_text())["viewer"] == {
        "open_href": ready_payload["viewer_hrefs"][0]
    }

    jobs_response = client.get("/analysis-jobs")
    assert jobs_response.status_code == 200
    assert jobs_response.json()["jobs"] == [ready_payload]


def test_analysis_job_api_default_runner_fails_truthfully_without_fake_result(
    tmp_path,
    monkeypatch,
):
    storage = create_collection(tmp_path, display_name="Unavailable Runner Board")

    class FastFailProductionRunner:
        def run_stage(self, request):
            raise RuntimeError("production runner unavailable in test")

    monkeypatch.setattr(
        "anacronia.api.LatentMapAnalysisStageRunner",
        lambda: FastFailProductionRunner(),
    )
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.post(
        "/analysis-jobs",
        json={
            "collection_slugs": ["unavailable-runner-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "running"
    assert payload["analysis_result_ids"] == []
    assert payload["viewer_hrefs"] == []
    failed_payload = wait_for_api_job_status(
        client,
        payload["analysis_job_id"],
        "failed",
    )
    assert "production runner unavailable in test" in failed_payload["stages"][-1]["error"]
    assert failed_payload["stages"][-1]["stage_name"] == "embedding_computation"

    result_dirs = list((storage.data_root / "analysis-results").glob("*/analysis-result.json"))
    assert result_dirs == []


def test_analysis_job_api_validates_collection_and_recipe(tmp_path):
    storage = create_collection(tmp_path)
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    missing_collection = client.post(
        "/analysis-jobs",
        json={
            "collection_slugs": ["missing-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )
    unknown_recipe = client.post(
        "/analysis-jobs",
        json={
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_999"],
        },
    )

    assert missing_collection.status_code == 404
    assert missing_collection.json()["detail"] == "Collection not found: missing-board"
    assert unknown_recipe.status_code == 422
    assert unknown_recipe.json()["detail"] == "Unknown Analysis Recipe: dinov3_vits_999"


def test_analysis_job_api_blocks_start_while_provider_search_is_active(
    tmp_path,
    monkeypatch,
):
    storage = create_collection(tmp_path)
    monkeypatch.setattr(
        "anacronia.api.get_worker_status",
        lambda *, database_path: SimpleNamespace(
            service="worker",
            status="running",
            active_collect_job_id=42,
        ),
    )
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.post(
        "/analysis-jobs",
        json={
            "collection_slugs": ["analysis-board"],
            "recipe_ids": ["dinov3_vits_384"],
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Another search is already active."


def test_provider_search_start_blocks_while_analysis_job_is_active(tmp_path):
    storage = create_collection(tmp_path)
    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    manifest_path = (
        storage.data_root
        / "analysis-jobs"
        / "analysis-job-20260615T100000Z"
        / "analysis-job.json"
    )
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(
        json.dumps(
            {
                    "asset_kind": "analysis-job",
                    "analysis_job_id": "analysis-job-20260615T100000Z",
                    "analysis_result_ids": [],
                    "created_at": created_at.replace("+00:00", "Z"),
                "recipe_ids": ["dinov3_vits_384"],
                "sibling_group_id": "analysis-sibling-20260615T100000Z",
                "stages": [],
                "status": "running",
            }
        ),
        encoding="utf-8",
    )
    client = TestClient(
        create_app(database_path=storage.database_path, data_root=storage.data_root)
    )

    response = client.post(
        "/search-sets",
        json={
            "display_name": "Snake Studies",
            "terms_text": "snake",
            "provider": "met",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Another Analysis Job is already active."
