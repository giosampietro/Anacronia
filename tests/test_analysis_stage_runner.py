import json
from datetime import datetime, timezone

import numpy as np
from PIL import Image

from anacronia.analysis_recipes import get_analysis_recipe
from anacronia.analysis_jobs import run_analysis_job
from anacronia.analysis_scopes import resolve_analysis_scope
from anacronia.image_embedding_results import record_image_embedding_result
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


class RaisingEmbedder:
    model_id = "raising-dinov3"
    device = "cpu"

    def embed_batch(self, images):
        raise AssertionError("Reusable embeddings should not call the embedder.")


class MissingOnlyEmbedder:
    model_id = "fake-dinov3"
    device = "cpu"

    def __init__(self):
        self.batch_sizes = []

    def embed_batch(self, images):
        self.batch_sizes.append(len(images))
        vectors = np.zeros((len(images), 384), dtype=np.float32)
        vectors[:, 9] = 1.0
        return vectors


class ShapeSensitiveEmbedder:
    model_id = "fake-dinov3"
    device = "cpu"

    def __init__(self):
        self.batch_sizes = []
        self.batch_image_sizes = []

    def embed_batch(self, images):
        image_sizes = [image.size for image in images]
        if len(set(image_sizes)) != 1:
            raise ValueError("Prepared images in a batch must have one tensor shape.")
        self.batch_sizes.append(len(images))
        self.batch_image_sizes.append(image_sizes[0])
        vectors = np.zeros((len(images), 384), dtype=np.float32)
        vectors[:, 11] = 1.0
        return vectors


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
    artifacts_by_role = {
        str(artifact["role"]): artifact for artifact in result_manifest["artifacts"]
    }
    artifacts_by_key = {
        str(artifact["key"]): artifact for artifact in result_manifest["artifacts"]
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
    assert result_manifest["recipes"][0]["artifact_keys"]["embedding_vector_id_map"] == (
        "embeddings/dinov3_vits_384_vector_id_map.json"
    )
    assert result_manifest["recipes"][0]["artifact_keys"][
        "embedding_materialization_metadata"
    ] == "embeddings/dinov3_vits_384_materialization.json"
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
    assert artifacts_by_role["faiss-neighbors"]["required"] is False
    assert artifacts_by_key["viewer/atlases/32px/atlas-manifest.json"][
        "required"
    ] is True
    assert artifacts_by_key["viewer/atlases/32px/page-000.png"]["required"] is False
    assert artifacts_by_role["viewer-data"]["retention_class"] == "viewer-cache"
    assert artifacts_by_role["viewer-data"]["required"] is True
    assert artifacts_by_role["viewer-neighbors"]["retention_class"] == "viewer-cache"
    assert artifacts_by_role["viewer-neighbors"]["required"] is True
    assert image_manifest_rows[0]["image_id"].startswith("image-asset-")
    viewer_data = json.loads((result_dir / "viewer" / "map-data.json").read_text())
    assert viewer_data["thumbnail_atlas_manifest_paths"] == {
        "32": "viewer/atlases/32px/atlas-manifest.json",
        "64": "viewer/atlases/64px/atlas-manifest.json",
        "96": "viewer/atlases/96px/atlas-manifest.json",
    }
    for artifact_path in [
        result_dir / "report.md",
        result_dir / "embeddings" / "dinov3_vits_384_materialization.json",
        result_dir / "viewer" / "map-data.json",
    ]:
        assert str(tmp_path) not in artifact_path.read_text(encoding="utf-8")


def test_latent_map_stage_runner_materializes_reusable_embeddings_without_recomputing(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Reusable Board",
        folder_path=folder,
    )
    resolved_scope = resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["reusable-board"],
        data_root=storage.data_root,
    )
    recipe = get_analysis_recipe("dinov3_vits_384")
    expected_vectors = []
    for index, item in enumerate(resolved_scope.payload["items"]):
        artifact_key = (
            f"image-embeddings/{recipe.recipe_id}/"
            f"image-asset-{item['image_asset_id']}.npy"
        )
        vector = np.zeros(384, dtype=np.float32)
        vector[index] = 1.0
        embedding_path = storage.data_root / artifact_key
        embedding_path.parent.mkdir(parents=True, exist_ok=True)
        np.save(embedding_path, vector)
        expected_vectors.append(vector)
        record_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            source_identity=item["source_identity"],
            recipe=recipe,
            artifact_key=artifact_key,
            vector_dimension=384,
            created_at=datetime(2026, 6, 14, 13, index, tzinfo=timezone.utc),
        )
    runner = LatentMapAnalysisStageRunner(
        atlas_size=128,
        embedder=RaisingEmbedder(),
        hdbscan_clusterer=FakeHdbscanClusterer(),
        layout_clusterer=FakeClusterer(),
        reducer=FakeReducer(),
    )

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["reusable-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=runner,
        created_at=datetime(2026, 6, 14, 14, 10, tzinfo=timezone.utc),
    )

    result_dir = storage.data_root / "analysis-results" / job.analysis_result_ids[0]
    result_manifest = json.loads((result_dir / "analysis-result.json").read_text())
    vectors = np.load(result_dir / "embeddings" / "dinov3_vits_384.npy")
    materialization = json.loads(
        (
            result_dir
            / "embeddings"
            / "dinov3_vits_384_materialization.json"
        ).read_text(encoding="utf-8")
    )

    assert job.status == "ready"
    np.testing.assert_array_equal(vectors, np.vstack(expected_vectors))
    assert materialization["reusable_count"] == 2
    assert materialization["missing_image_asset_ids"] == []


def test_latent_map_stage_runner_computes_only_missing_embeddings_then_materializes(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Partial Reuse Board",
        folder_path=folder,
    )
    resolved_scope = resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["partial-reuse-board"],
        data_root=storage.data_root,
    )
    recipe = get_analysis_recipe("dinov3_vits_384")
    reusable_item = resolved_scope.payload["items"][0]
    reusable_artifact_key = (
        f"image-embeddings/{recipe.recipe_id}/"
        f"image-asset-{reusable_item['image_asset_id']}.npy"
    )
    reusable_vector = np.zeros(384, dtype=np.float32)
    reusable_vector[5] = 1.0
    reusable_path = storage.data_root / reusable_artifact_key
    reusable_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(reusable_path, reusable_vector)
    record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=reusable_item["image_asset_id"],
        source_identity=reusable_item["source_identity"],
        recipe=recipe,
        artifact_key=reusable_artifact_key,
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 13, 10, tzinfo=timezone.utc),
    )
    embedder = MissingOnlyEmbedder()
    runner = LatentMapAnalysisStageRunner(
        atlas_size=128,
        embedder=embedder,
        hdbscan_clusterer=FakeHdbscanClusterer(),
        layout_clusterer=FakeClusterer(),
        reducer=FakeReducer(),
    )

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["partial-reuse-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=runner,
        created_at=datetime(2026, 6, 14, 14, 20, tzinfo=timezone.utc),
    )

    result_dir = storage.data_root / "analysis-results" / job.analysis_result_ids[0]
    result_manifest = json.loads((result_dir / "analysis-result.json").read_text())
    vectors = np.load(result_dir / "embeddings" / "dinov3_vits_384.npy")
    materialization = json.loads(
        (
            result_dir
            / "embeddings"
            / "dinov3_vits_384_materialization.json"
        ).read_text(encoding="utf-8")
    )

    assert job.status == "ready"
    assert embedder.batch_sizes == [1]
    np.testing.assert_array_equal(vectors[0], reusable_vector)
    assert vectors[1][9] == 1.0
    assert materialization["reusable_count"] == 2
    assert materialization["missing_image_asset_ids"] == []
    assert result_manifest["embedding_reuse"]["missing_count"] == 0
    assert result_manifest["embedding_reuse"]["reusable_count"] == 2


def test_latent_map_stage_runner_groups_missing_embeddings_by_prepared_image_shape(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "wide.jpg", size=(640, 320), color=(10, 20, 30))
    write_image(folder / "tall.jpg", size=(320, 640), color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Mixed Shape Board",
        folder_path=folder,
    )
    embedder = ShapeSensitiveEmbedder()
    runner = LatentMapAnalysisStageRunner(
        atlas_size=128,
        batch_size=2,
        embedder=embedder,
        hdbscan_clusterer=FakeHdbscanClusterer(),
        layout_clusterer=FakeClusterer(),
        reducer=FakeReducer(),
    )

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["mixed-shape-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=runner,
        created_at=datetime(2026, 6, 14, 14, 30, tzinfo=timezone.utc),
    )

    assert job.status == "ready"
    assert embedder.batch_sizes == [1, 1]
    assert len(set(embedder.batch_image_sizes)) == 2


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
