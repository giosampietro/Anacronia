import concurrent.futures
import json
import threading

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
            "clustering": AnalysisStageArtifact(
                key=f"clusters/{request.recipe.recipe_id}_hdbscan_default.json",
                role="cluster-result",
                content_type="application/json",
                retention_class="durable",
                metadata={"cluster_id": "hdbscan_default"},
            ),
            "baseline_atlas": AnalysisStageArtifact(
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


class BlockingStageRunner(FakeStageRunner):
    def __init__(self):
        super().__init__()
        self.started = threading.Event()
        self.release = threading.Event()

    def run_stage(self, request):
        if request.stage_name == "embedding_computation":
            self.started.set()
            if not self.release.wait(timeout=5):
                raise RuntimeError("timed out waiting for blocked analysis stage")
        return super().run_stage(request)


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
    assert payload["viewer_hrefs"] == [
        f"/latent-map?analysisResultId={payload['analysis_result_ids'][0]}"
    ]
    assert [call[0] for call in stage_runner.calls] == [
        "embedding_computation",
        "faiss",
        "umap",
        "clustering",
        "baseline_atlas",
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


def test_analysis_job_api_rejects_second_job_while_recipe_is_running(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = BlockingStageRunner()
    app = create_app(
        database_path=storage.database_path,
        data_root=storage.data_root,
        analysis_stage_runner=stage_runner,
    )

    def post_analysis_job():
        client = TestClient(app)
        return client.post(
            "/analysis-jobs",
            json={
                "collection_slugs": ["analysis-board"],
                "recipe_ids": ["dinov3_vits_384"],
            },
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(post_analysis_job)
        assert stage_runner.started.wait(timeout=2)

        active_response = TestClient(app).get("/analysis-jobs")
        assert active_response.status_code == 200
        assert active_response.json()["active_analysis_job_id"].startswith(
            "analysis-job-"
        )

        second = executor.submit(post_analysis_job)
        done, _pending = concurrent.futures.wait([second], timeout=0.5)

        try:
            assert second in done
            second_response = second.result()
            assert second_response.status_code == 409
            assert (
                second_response.json()["detail"]
                == "Another analysis job is already active."
            )
        finally:
            stage_runner.release.set()

        assert first.result(timeout=5).status_code == 201


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
