import json

from fastapi.testclient import TestClient
from PIL import Image

from anacronia.analysis_jobs import AnalysisStageArtifact, AnalysisStageResult
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
    assert payload["status"] == "ready"
    assert payload["recipe_ids"] == ["dinov3_vits_384"]
    assert len(payload["analysis_result_ids"]) == 1
    assert payload["analysis_job_id"].startswith("analysis-job-")
    assert "manifest_path" not in payload
    assert str(storage.data_root) not in json.dumps(payload)
    assert payload["viewer_hrefs"] == [
        f"/latent-map?analysisResultId={payload['analysis_result_ids'][0]}"
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
        / payload["analysis_result_ids"][0]
        / "analysis-result.json"
    )
    assert result_manifest.is_file()
    assert json.loads(result_manifest.read_text())["viewer"] == {
        "open_href": payload["viewer_hrefs"][0]
    }

    jobs_response = client.get("/analysis-jobs")
    assert jobs_response.status_code == 200
    assert jobs_response.json()["jobs"] == [payload]


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
    assert payload["status"] == "failed"
    assert payload["analysis_result_ids"] == []
    assert payload["viewer_hrefs"] == []
    assert "production runner unavailable in test" in payload["stages"][-1]["error"]
    assert payload["stages"][-1]["stage_name"] == "embedding_computation"

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
