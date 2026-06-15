import json
import shutil
from datetime import datetime, timezone

import numpy as np
from PIL import Image
import pytest

from anacronia.analysis_recipes import get_analysis_recipe
from anacronia.analysis_scopes import resolve_analysis_scope
from anacronia.image_embedding_materializer import (
    ImageEmbeddingMaterializationError,
    materialize_recipe_embedding_matrix,
    plan_recipe_embedding_materialization,
)
from anacronia.image_embedding_results import record_image_embedding_result
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.storage import initialize_storage


def write_image(path, *, size=(640, 320), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def create_resolved_scope(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Materializer Board",
        folder_path=folder,
    )
    return storage, resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["materializer-board"],
    )


def write_embedding_vector(data_root, artifact_key, *, offset):
    path = data_root / artifact_key
    path.parent.mkdir(parents=True, exist_ok=True)
    vector = np.zeros(384, dtype=np.float32)
    vector[offset] = 1.0
    np.save(path, vector)
    return vector


def test_materializes_reusable_embeddings_in_scope_order(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe = get_analysis_recipe("dinov3_vits_384")
    expected_vectors = []
    for index, item in enumerate(resolved_scope.payload["items"]):
        artifact_key = (
            f"image-embeddings/dinov3_vits_384/"
            f"image-asset-{item['image_asset_id']}.npy"
        )
        expected_vectors.append(
            write_embedding_vector(
                storage.data_root,
                artifact_key,
                offset=index,
            )
        )
        record_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            source_identity=item["source_identity"],
            recipe=recipe,
            artifact_key=artifact_key,
            vector_dimension=384,
            created_at=datetime(2026, 6, 14, 12, index, tzinfo=timezone.utc),
        )

    summary = materialize_recipe_embedding_matrix(
        data_root=storage.data_root,
        result_dir=tmp_path / "analysis-result",
        resolved_scope=resolved_scope,
        recipe=recipe,
    )

    vectors = np.load(summary.embedding_path)
    vector_id_map = json.loads(summary.vector_id_map_path.read_text(encoding="utf-8"))
    metadata = json.loads(summary.metadata_path.read_text(encoding="utf-8"))
    assert vectors.shape == (2, 384)
    np.testing.assert_array_equal(vectors, np.vstack(expected_vectors))
    assert [row["image_asset_id"] for row in vector_id_map] == [
        item["image_asset_id"] for item in resolved_scope.payload["items"]
    ]
    assert [row["image_id"] for row in vector_id_map] == [
        f"image-asset-{item['image_asset_id']}"
        for item in resolved_scope.payload["items"]
    ]
    assert vector_id_map[0]["source_identity"] == (
        resolved_scope.payload["items"][0]["source_identity"]
    )
    assert vector_id_map[0]["contributing_collections"] == [
        {"slug": "materializer-board", "display_name": "Materializer Board"}
    ]
    assert metadata["recipe_id"] == "dinov3_vits_384"
    assert metadata["reusable_count"] == 2
    assert metadata["missing_image_asset_ids"] == []
    assert metadata["artifacts"] == [
        {
            "content_type": "application/octet-stream",
            "key": "embeddings/dinov3_vits_384.npy",
            "retention_class": "durable",
            "role": "embedding",
        },
        {
            "content_type": "application/json",
            "key": "embeddings/dinov3_vits_384_vector_id_map.json",
            "retention_class": "durable",
            "role": "embedding-vector-id-map",
        },
        {
            "content_type": "application/json",
            "key": "embeddings/dinov3_vits_384_materialization.json",
            "retention_class": "durable",
            "role": "embedding-materialization-metadata",
        },
    ]
    assert [artifact.role for artifact in summary.artifacts] == [
        "embedding",
        "embedding-vector-id-map",
        "embedding-materialization-metadata",
    ]
    assert all(not artifact.key.startswith("/") for artifact in summary.artifacts)
    assert str(tmp_path) not in json.dumps(metadata)


def test_materializer_plans_reusable_and_missing_from_resolved_scope(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe = get_analysis_recipe("dinov3_vits_384")
    reusable_item = resolved_scope.payload["items"][0]
    artifact_key = (
        f"image-embeddings/dinov3_vits_384/"
        f"image-asset-{reusable_item['image_asset_id']}.npy"
    )
    write_embedding_vector(storage.data_root, artifact_key, offset=0)
    record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=reusable_item["image_asset_id"],
        source_identity=reusable_item["source_identity"],
        recipe=recipe,
        artifact_key=artifact_key,
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 12, 20, tzinfo=timezone.utc),
    )

    plan = plan_recipe_embedding_materialization(
        data_root=storage.data_root,
        resolved_scope=resolved_scope,
        recipe=recipe,
    )

    assert plan.ready is False
    assert plan.reusable_image_asset_ids == [reusable_item["image_asset_id"]]
    assert plan.missing_image_asset_ids == [
        resolved_scope.payload["items"][1]["image_asset_id"]
    ]
    assert plan.source_image_asset_ids == [
        item["image_asset_id"] for item in resolved_scope.payload["items"]
    ]


def test_materialization_reports_missing_embeddings_without_writing_matrix(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe = get_analysis_recipe("dinov3_vits_384")
    first_item = resolved_scope.payload["items"][0]
    artifact_key = (
        f"image-embeddings/dinov3_vits_384/"
        f"image-asset-{first_item['image_asset_id']}.npy"
    )
    write_embedding_vector(storage.data_root, artifact_key, offset=0)
    record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=first_item["image_asset_id"],
        source_identity=first_item["source_identity"],
        recipe=recipe,
        artifact_key=artifact_key,
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc),
    )

    with pytest.raises(ImageEmbeddingMaterializationError) as exc_info:
        materialize_recipe_embedding_matrix(
            data_root=storage.data_root,
            result_dir=tmp_path / "analysis-result",
            resolved_scope=resolved_scope,
            recipe=recipe,
        )

    missing_item = resolved_scope.payload["items"][1]
    assert exc_info.value.missing_image_asset_ids == [missing_item["image_asset_id"]]
    assert "Missing reusable embeddings" in str(exc_info.value)
    assert not (tmp_path / "analysis-result" / "embeddings").exists()


def test_materialization_rejects_wrong_vector_dimension(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe = get_analysis_recipe("dinov3_vits_384")
    for index, item in enumerate(resolved_scope.payload["items"]):
        artifact_key = (
            f"image-embeddings/dinov3_vits_384/"
            f"image-asset-{item['image_asset_id']}.npy"
        )
        path = storage.data_root / artifact_key
        path.parent.mkdir(parents=True, exist_ok=True)
        vector = np.zeros(128 if index == 0 else 384, dtype=np.float32)
        np.save(path, vector)
        record_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            source_identity=item["source_identity"],
            recipe=recipe,
            artifact_key=artifact_key,
            vector_dimension=384,
            created_at=datetime(2026, 6, 14, 13, index, tzinfo=timezone.utc),
        )

    with pytest.raises(ImageEmbeddingMaterializationError) as exc_info:
        materialize_recipe_embedding_matrix(
            data_root=storage.data_root,
            result_dir=tmp_path / "analysis-result",
            resolved_scope=resolved_scope,
            recipe=recipe,
        )

    assert "dimension mismatch" in str(exc_info.value)
    assert not (tmp_path / "analysis-result" / "embeddings").exists()


def test_materialization_treats_stale_recipe_provenance_as_missing(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    stale_recipe = get_analysis_recipe("dinov3_vits_256")
    requested_recipe = get_analysis_recipe("dinov3_vits_384")
    for index, item in enumerate(resolved_scope.payload["items"]):
        artifact_key = (
            f"image-embeddings/dinov3_vits_256/"
            f"image-asset-{item['image_asset_id']}.npy"
        )
        path = storage.data_root / artifact_key
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, np.ones(384, dtype=np.float32))
        record_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            source_identity=item["source_identity"],
            recipe=stale_recipe,
            artifact_key=artifact_key,
            vector_dimension=384,
            created_at=datetime(2026, 6, 14, 14, index, tzinfo=timezone.utc),
        )

    with pytest.raises(ImageEmbeddingMaterializationError) as exc_info:
        materialize_recipe_embedding_matrix(
            data_root=storage.data_root,
            result_dir=tmp_path / "analysis-result",
            resolved_scope=resolved_scope,
            recipe=requested_recipe,
        )

    assert exc_info.value.missing_image_asset_ids == [
        item["image_asset_id"] for item in resolved_scope.payload["items"]
    ]


def test_materialization_preserves_cross_collection_duplicate_contributors(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    first_folder = tmp_path / "first"
    second_folder = tmp_path / "second"
    write_image(first_folder / "shared.jpg", color=(10, 20, 30))
    write_image(first_folder / "first-only.jpg", color=(40, 50, 60))
    second_folder.mkdir()
    shutil.copyfile(first_folder / "shared.jpg", second_folder / "shared-copy.jpg")
    write_image(second_folder / "second-only.jpg", color=(70, 80, 90))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Jewelry",
        folder_path=first_folder,
    )
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Vases",
        folder_path=second_folder,
    )
    resolved_scope = resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["snake-jewelry", "snake-vases"],
    )
    recipe = get_analysis_recipe("dinov3_vits_384")
    for index, item in enumerate(resolved_scope.payload["items"]):
        artifact_key = (
            f"image-embeddings/dinov3_vits_384/"
            f"image-asset-{item['image_asset_id']}.npy"
        )
        write_embedding_vector(storage.data_root, artifact_key, offset=index)
        record_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            source_identity=item["source_identity"],
            recipe=recipe,
            artifact_key=artifact_key,
            vector_dimension=384,
            created_at=datetime(2026, 6, 14, 15, index, tzinfo=timezone.utc),
        )

    summary = materialize_recipe_embedding_matrix(
        data_root=storage.data_root,
        result_dir=tmp_path / "analysis-result",
        resolved_scope=resolved_scope,
        recipe=recipe,
    )

    vector_id_map = json.loads(summary.vector_id_map_path.read_text(encoding="utf-8"))
    shared_rows = [
        row for row in vector_id_map if len(row["contributing_collections"]) == 2
    ]
    assert summary.vector_count == resolved_scope.counts["active_images"] == 3
    assert resolved_scope.counts["duplicates_collapsed"] == 1
    assert len(shared_rows) == 1
    assert shared_rows[0]["contributing_collections"] == [
        {"slug": "snake-jewelry", "display_name": "Snake Jewelry"},
        {"slug": "snake-vases", "display_name": "Snake Vases"},
    ]
