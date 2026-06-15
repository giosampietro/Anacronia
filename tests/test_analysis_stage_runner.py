import json
from datetime import datetime, timezone

import numpy as np
from PIL import Image

from anacronia.analysis_jobs import run_analysis_job
from anacronia.analysis_stage_runner import LatentMapAnalysisStageRunner
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.storage import initialize_storage


def write_image(path, *, size=(640, 320), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


class FakeEmbedder:
    model_id = "fake-dinov3"
    device = "cpu"

    def embed_batch(self, images):
        return np.asarray(
            [
                [1.0, 0.0, *([0.0] * 382)],
                [0.0, 1.0, *([0.0] * 382)],
            ][: len(images)],
            dtype=np.float32,
        )


class GatedRepoEmbedder:
    model_id = "facebook/dinov3-vits16-pretrain-lvd1689m"
    device = "cpu"

    def embed_batch(self, images):
        raise RuntimeError(
            "You are trying to access a gated repo. 401 Client Error. "
            "Access to model facebook/dinov3-vits16-pretrain-lvd1689m is restricted. "
            "Please log in."
        )


class FakeReducer:
    def fit_transform(self, vectors):
        return vectors[:, :2]


class FakeClusterer:
    def fit_predict(self, vectors):
        return np.arange(vectors.shape[0]) % 2


class FakeHdbscanClusterer:
    def __init__(self):
        self.probabilities_ = np.asarray([0.95, 0.85], dtype=np.float32)

    def fit_predict(self, vectors):
        return np.arange(vectors.shape[0]) % 2


def test_latent_map_stage_runner_builds_openable_analysis_result(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Runner Board",
        folder_path=folder,
    )
    runner = LatentMapAnalysisStageRunner(
        atlas_size=128,
        embedder=FakeEmbedder(),
        hdbscan_clusterer=FakeHdbscanClusterer(),
        layout_clusterer=FakeClusterer(),
        reducer=FakeReducer(),
    )

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["runner-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=runner,
        created_at=datetime(2026, 6, 14, 14, 0, tzinfo=timezone.utc),
    )

    result_dir = storage.data_root / "analysis-results" / job.analysis_result_ids[0]
    result_manifest = json.loads((result_dir / "analysis-result.json").read_text())
    image_manifest_rows = [
        json.loads(line)
        for line in (result_dir / "manifest.jsonl").read_text().splitlines()
        if line.strip()
    ]
    artifact_keys = {
        str(artifact["key"]) for artifact in result_manifest["artifacts"]
    }

    assert job.status == "ready"
    assert [stage["status"] for stage in json.loads(job.manifest_path.read_text())["stages"]] == [
        "ready",
        "ready",
        "ready",
        "ready",
        "ready",
        "ready",
        "ready",
        "ready",
    ]
    assert result_manifest["recipes"][0]["artifact_keys"]["embedding_vectors"] == (
        "embeddings/dinov3_vits_384.npy"
    )
    assert result_manifest["recipes"][0]["artifact_keys"]["faiss_id_map"] == (
        "indexes/dinov3_vits_384_faiss_id_map.json"
    )
    assert result_manifest["recipes"][0]["artifact_keys"]["baseline_atlas_manifest"] == (
        "viewer/atlases/32px/atlas-manifest.json"
    )
    assert result_manifest["recipes"][0]["artifact_keys"][
        "thumbnail_atlas_manifests"
    ] == {
        "32": "viewer/atlases/32px/atlas-manifest.json",
        "64": "viewer/atlases/64px/atlas-manifest.json",
        "96": "viewer/atlases/96px/atlas-manifest.json",
    }
    assert any(
        cluster["cluster_id"] == "hdbscan_detail_mcs15_ms5_leaf"
        for cluster in result_manifest["recipes"][0]["artifact_keys"]["clusters"]
    )
    assert all(not row["source_path"].startswith("/") for row in image_manifest_rows)
    assert all((result_dir / row["source_path"]).is_file() for row in image_manifest_rows)
    assert all((result_dir / row["thumbnail_path"]).is_file() for row in image_manifest_rows)
    assert all((result_dir / row["preview_path"]).is_file() for row in image_manifest_rows)
    assert "viewer/atlases/32px/page-000.png" in artifact_keys
    assert "viewer/atlases/64px/page-000.png" in artifact_keys
    assert "viewer/atlases/96px/page-000.png" in artifact_keys
    assert "viewer/map-data.json" in artifact_keys
    assert "viewer/neighbors.json" in artifact_keys
    assert image_manifest_rows[0]["image_id"].startswith("image-asset-")
    viewer_data = json.loads((result_dir / "viewer" / "map-data.json").read_text())
    assert viewer_data["thumbnail_atlas_manifest_paths"] == {
        "32": "viewer/atlases/32px/atlas-manifest.json",
        "64": "viewer/atlases/64px/atlas-manifest.json",
        "96": "viewer/atlases/96px/atlas-manifest.json",
    }


def test_latent_map_stage_runner_reports_gated_dinov3_setup_error(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Gated Board",
        folder_path=folder,
    )
    runner = LatentMapAnalysisStageRunner(embedder=GatedRepoEmbedder())

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["gated-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=runner,
        created_at=datetime(2026, 6, 15, 6, 15, tzinfo=timezone.utc),
    )

    job_manifest = json.loads(job.manifest_path.read_text())
    error = job_manifest["stages"][-1]["error"]

    assert job.status == "failed"
    assert "Hugging Face access failed: DINOv3 is gated for this process." in error
    assert "batch-cmd/login-huggingface.command" in error
    assert "401 Client Error" not in error
