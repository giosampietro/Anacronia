import json
from datetime import datetime, timezone

from PIL import Image
import pytest

from anacronia.analysis_recipes import (
    AnalysisRecipe,
    get_analysis_recipe,
    select_analysis_recipes,
)
from anacronia.analysis_scopes import resolve_analysis_scope
from anacronia.image_embedding_results import (
    find_reusable_image_embedding_result,
    plan_image_embedding_reuse,
    record_image_embedding_result,
)
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
        display_name="Embedding Board",
        folder_path=folder,
    )
    return storage, resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["embedding-board"],
    )


def test_records_reusable_image_embedding_result_by_image_and_recipe(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe = get_analysis_recipe("dinov3_vits_384")
    other_recipe = get_analysis_recipe("dinov3_vits_256")
    item = resolved_scope.payload["items"][0]

    result = record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=item["image_asset_id"],
        source_identity=item["source_identity"],
        recipe=recipe,
        artifact_key="image-embeddings/dinov3_vits_384/image-1.npy",
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc),
    )

    payload = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    reusable = find_reusable_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=item["image_asset_id"],
        recipe=recipe,
    )
    assert reusable is not None
    assert reusable.image_embedding_result_id == result.image_embedding_result_id
    assert reusable.artifact_key == "image-embeddings/dinov3_vits_384/image-1.npy"
    assert reusable.source_identity == item["source_identity"]
    assert payload["recipe"]["recipe_id"] == "dinov3_vits_384"
    assert payload["recipe_fingerprint"] == recipe.embedding_fingerprint()
    assert str(tmp_path) not in json.dumps(payload)
    assert (
        find_reusable_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            recipe=other_recipe,
        )
        is None
    )


def test_plans_reusable_and_missing_embeddings_from_resolved_scope(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe_384, recipe_256 = select_analysis_recipes(
        ["dinov3_vits_384", "dinov3_vits_256"]
    )
    reusable_item = resolved_scope.payload["items"][0]
    missing_item = resolved_scope.payload["items"][1]
    record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=reusable_item["image_asset_id"],
        source_identity=reusable_item["source_identity"],
        recipe=recipe_384,
        artifact_key="image-embeddings/dinov3_vits_384/reusable.npy",
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 12, 5, tzinfo=timezone.utc),
    )

    plan = plan_image_embedding_reuse(
        data_root=storage.data_root,
        resolved_scope=resolved_scope,
        recipes=[recipe_384, recipe_256],
    )

    assert plan.recipe_plans["dinov3_vits_384"].reusable_image_asset_ids == [
        reusable_item["image_asset_id"]
    ]
    assert plan.recipe_plans["dinov3_vits_384"].missing_image_asset_ids == [
        missing_item["image_asset_id"]
    ]
    assert plan.recipe_plans["dinov3_vits_256"].reusable_image_asset_ids == []
    assert plan.recipe_plans["dinov3_vits_256"].missing_image_asset_ids == [
        item["image_asset_id"] for item in resolved_scope.payload["items"]
    ]
    assert plan.total_missing_embeddings == 3


def test_embedding_reuse_key_includes_model_and_preprocessing_provenance(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    original_recipe = get_analysis_recipe("dinov3_vits_384")
    changed_recipe = AnalysisRecipe(
        recipe_id=original_recipe.recipe_id,
        label=original_recipe.label,
        recipe_kind=original_recipe.recipe_kind,
        model_family=original_recipe.model_family,
        model_id=original_recipe.model_id,
        model_revision="new-model-revision",
        preprocessor_id=original_recipe.preprocessor_id,
        preprocessor_version=original_recipe.preprocessor_version,
        input_derivative=original_recipe.input_derivative,
        input_size=original_recipe.input_size,
        preserve_aspect_ratio=original_recipe.preserve_aspect_ratio,
        pad_to_multiple=original_recipe.pad_to_multiple,
        padding_color_rgb=original_recipe.padding_color_rgb,
        embedding_dimension=original_recipe.embedding_dimension,
        vector_kind=original_recipe.vector_kind,
        normalization=original_recipe.normalization,
        downstream_stages=original_recipe.downstream_stages,
        package_notes=original_recipe.package_notes,
    )
    item = resolved_scope.payload["items"][0]
    record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=item["image_asset_id"],
        source_identity=item["source_identity"],
        recipe=original_recipe,
        artifact_key="image-embeddings/dinov3_vits_384/original.npy",
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 12, 10, tzinfo=timezone.utc),
    )

    assert (
        find_reusable_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            recipe=changed_recipe,
        )
        is None
    )


def test_embedding_result_rejects_local_absolute_artifact_keys(tmp_path):
    storage, resolved_scope = create_resolved_scope(tmp_path)
    recipe = get_analysis_recipe("dinov3_vits_384")
    item = resolved_scope.payload["items"][0]

    with pytest.raises(ValueError, match="artifact_key must be a relative artifact key"):
        record_image_embedding_result(
            data_root=storage.data_root,
            image_asset_id=item["image_asset_id"],
            source_identity=item["source_identity"],
            recipe=recipe,
            artifact_key=str(tmp_path / "private" / "embedding.npy"),
            vector_dimension=384,
            created_at=datetime(2026, 6, 14, 12, 15, tzinfo=timezone.utc),
        )
