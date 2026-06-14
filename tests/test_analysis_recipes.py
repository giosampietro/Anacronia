from anacronia.analysis_recipes import (
    AnalysisRecipe,
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
        "faiss",
        "umap",
        "hdbscan",
        "baseline-atlas-32px",
    ]


def test_default_dinov3_recipes_declare_explorer_atlas_levels():
    recipes = list_analysis_recipes()

    assert {
        recipe.recipe_id: recipe.thumbnail_atlas_tile_sizes for recipe in recipes
    } == {
        "dinov3_vits_256": (32, 64, 96),
        "dinov3_vits_384": (32, 64, 96),
        "dinov3_vits_512": (32, 64, 96),
    }
    assert get_default_analysis_recipe().to_provenance_payload()["viewer"] == {
        "thumbnail_atlas_tile_sizes": [32, 64, 96],
    }


def test_recipe_can_opt_into_128px_atlas_without_changing_embedding_fingerprint():
    recipe = get_default_analysis_recipe()

    with_128px = recipe.with_thumbnail_atlas_tile_sizes((32, 64, 96, 128))

    assert with_128px.thumbnail_atlas_tile_sizes == (32, 64, 96, 128)
    assert with_128px.to_provenance_payload()["viewer"] == {
        "thumbnail_atlas_tile_sizes": [32, 64, 96, 128],
    }
    assert with_128px.embedding_fingerprint() == recipe.embedding_fingerprint()


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
