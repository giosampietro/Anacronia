from anacronia.analysis_recipes import (
    AnalysisRecipe,
    browser_safe_analysis_recipe_catalog,
    get_default_analysis_recipe,
    list_analysis_recipes,
    select_analysis_recipes,
)


def test_recipe_registry_defaults_to_dinov3_384_with_comparison_recipes():
    default_recipe = get_default_analysis_recipe()
    recipes = list_analysis_recipes()

    assert default_recipe.recipe_id == "dinov3_vits_384"
    assert [recipe.recipe_id for recipe in recipes] == [
        "dinov3_vits_256",
        "dinov3_vits_384",
        "dinov3_vits_512",
    ]
    assert [recipe.recipe_id for recipe in select_analysis_recipes(None)] == [
        "dinov3_vits_384"
    ]
    assert [
        recipe.recipe_id
        for recipe in select_analysis_recipes(["dinov3_vits_256", "dinov3_vits_512"])
    ] == ["dinov3_vits_256", "dinov3_vits_512"]

    provenance = default_recipe.to_provenance_payload()
    assert provenance["model"] == {
        "family": "dinov3",
        "id": "facebook/dinov3-vits16-pretrain-lvd1689m",
        "revision": None,
    }
    assert provenance["preprocessing"] == {
        "input_derivative": "standard-1024",
        "input_size": 384,
        "pad_to_multiple": 16,
        "padding_color_rgb": [124, 116, 104],
        "preserve_aspect_ratio": True,
        "preprocessor_id": "anacronia-dinov3-preserve-aspect-pad-v1",
        "preprocessor_version": "1",
    }
    assert provenance["embedding"] == {
        "dimension": 384,
        "normalization": "l2",
        "vector_kind": "image-class-token",
    }
    assert provenance["downstream_stages"] == [
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
        "viewer_metadata",
        "result_registration",
    ]


def test_future_siglip2_and_fusion_recipes_use_same_provenance_contract():
    siglip2_recipe = AnalysisRecipe(
        recipe_id="siglip2_so400m_384",
        label="SigLIP2 SO400M 384px",
        recipe_kind="image-embedding",
        model_family="siglip2",
        model_id="google/siglip2-so400m-patch14-384",
        model_revision=None,
        preprocessor_id="siglip2-default-image-processor",
        preprocessor_version=None,
        input_derivative="standard-1024",
        input_size=384,
        preserve_aspect_ratio=True,
        pad_to_multiple=None,
        padding_color_rgb=None,
        embedding_dimension=1152,
        vector_kind="image-text-aligned",
        normalization="l2",
        downstream_stages=("faiss", "umap", "hdbscan", "baseline-atlas-32px"),
    )
    fusion_recipe = AnalysisRecipe(
        recipe_id="fusion_dinov3_siglip2_balanced",
        label="DINOv3 + SigLIP2 balanced fusion",
        recipe_kind="fusion-embedding",
        model_family="fusion",
        model_id="anacronia/fusion-weighted-v1",
        model_revision=None,
        preprocessor_id="anacronia-fusion-v1",
        preprocessor_version="1",
        input_derivative="standard-1024",
        input_size=None,
        preserve_aspect_ratio=True,
        pad_to_multiple=None,
        padding_color_rgb=None,
        embedding_dimension=None,
        vector_kind="weighted-composite",
        normalization="l2",
        downstream_stages=("faiss", "umap", "hdbscan", "baseline-atlas-32px"),
        component_recipe_ids=("dinov3_vits_384", "siglip2_so400m_384"),
    )

    assert siglip2_recipe.to_provenance_payload()["model"]["family"] == "siglip2"
    assert fusion_recipe.to_provenance_payload()["component_recipe_ids"] == [
        "dinov3_vits_384",
        "siglip2_so400m_384",
    ]
    assert siglip2_recipe.embedding_fingerprint() != fusion_recipe.embedding_fingerprint()


def test_dinov3_recipe_declares_explorer_ready_stage_plan():
    recipe = get_default_analysis_recipe()

    assert recipe.stage_plan is not None
    assert recipe.stage_plan.stage_ids == (
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
        "viewer_metadata",
        "result_registration",
    )
    assert recipe.stage_plan.runtime_stage_ids == (
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
    )
    assert recipe.stage_plan.default_atlas_levels == (32, 64, 96)
    assert recipe.stage_plan.optional_atlas_levels == (128,)
    assert recipe.stage_plan.primary_cluster_method == "hdbscan"
    assert recipe.stage_plan.optional_cluster_methods == ("kmeans",)
    assert recipe.stage_plan.noise_label == "Unclustered"
    assert recipe.stage_plan.explorer_required_artifact_roles == (
        "image-manifest",
        "embedding",
        "faiss-index",
        "faiss-id-map",
        "layout",
        "cluster-result",
        "thumbnail-atlas",
        "viewer-data",
        "viewer-neighbors",
        "analysis-result-manifest",
    )

    artifacts_by_stage = {
        stage.stage_id: {
            artifact.role: artifact.retention_class for artifact in stage.artifacts
        }
        for stage in recipe.stage_plan.stages
    }
    assert artifacts_by_stage["embedding_computation"]["embedding"] == "durable"
    assert artifacts_by_stage["faiss"]["faiss-index"] == "durable"
    assert artifacts_by_stage["umap"]["layout"] == "durable"
    assert artifacts_by_stage["hdbscan"]["cluster-result"] == "durable"
    assert artifacts_by_stage["atlas_generation"]["thumbnail-atlas"] == "render-cache"
    assert artifacts_by_stage["viewer_metadata"]["viewer-data"] == "viewer-cache"
    assert (
        artifacts_by_stage["result_registration"]["analysis-result-manifest"]
        == "durable"
    )


def test_recipe_catalog_exposes_browser_safe_ui_metadata():
    catalog = browser_safe_analysis_recipe_catalog()

    assert catalog["default_recipe_id"] == "dinov3_vits_384"
    assert [recipe["recipe_id"] for recipe in catalog["recipes"]] == [
        "dinov3_vits_256",
        "dinov3_vits_384",
        "dinov3_vits_512",
    ]
    default_recipe = catalog["recipes"][1]
    assert default_recipe["is_default"] is True
    assert default_recipe["label"] == "DINOv3 ViT-S 384px"
    assert default_recipe["model_family"] == "dinov3"
    assert default_recipe["stage_plan"]["stage_ids"] == [
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
        "viewer_metadata",
        "result_registration",
    ]
    assert default_recipe["stage_plan"]["atlas_levels"] == {
        "default": [32, 64, 96],
        "optional": [128],
    }
    assert default_recipe["stage_plan"]["clusters"] == {
        "noise_label": "Unclustered",
        "optional": ["kmeans"],
        "primary": "hdbscan",
    }

    serialized = str(catalog)
    assert "/Users/" not in serialized
    assert "/private/" not in serialized
    assert "hf_" not in serialized
