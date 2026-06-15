from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Sequence


DEFAULT_ANALYSIS_RECIPE_ID = "dinov3_vits_384"
DINO_V3_VITS_MODEL_ID = "facebook/dinov3-vits16-pretrain-lvd1689m"
DINO_V3_VITS_EMBEDDING_DIMENSION = 384
DINO_PADDING_COLOR_RGB = (124, 116, 104)
DINO_PREPROCESSOR_ID = "anacronia-dinov3-preserve-aspect-pad-v1"
DINO_PREPROCESSOR_VERSION = "1"
DEFAULT_ATLAS_LEVELS = (32, 64, 96)
OPTIONAL_ATLAS_LEVELS = (128,)
CANONICAL_LATENT_MAP_STAGE_IDS = (
    "embedding_computation",
    "faiss",
    "umap",
    "hdbscan",
    "atlas_generation",
    "viewer_metadata",
    "result_registration",
)
CANONICAL_LATENT_MAP_RUNTIME_STAGE_IDS = (
    "embedding_computation",
    "faiss",
    "umap",
    "hdbscan",
    "atlas_generation",
)
EXPLORER_REQUIRED_ARTIFACT_ROLES = (
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


@dataclass(frozen=True)
class AnalysisStageArtifactDeclaration:
    role: str
    content_type: str
    retention_class: str
    required: bool
    method: str | None = None

    def to_browser_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "content_type": self.content_type,
            "required": self.required,
            "retention_class": self.retention_class,
            "role": self.role,
        }
        if self.method is not None:
            payload["method"] = self.method
        return payload


@dataclass(frozen=True)
class AnalysisRecipeStage:
    stage_id: str
    label: str
    artifacts: tuple[AnalysisStageArtifactDeclaration, ...]
    runtime_stage: bool = True

    def to_browser_payload(self) -> dict[str, object]:
        return {
            "artifacts": [
                artifact.to_browser_payload() for artifact in self.artifacts
            ],
            "label": self.label,
            "runtime_stage": self.runtime_stage,
            "stage_id": self.stage_id,
        }


@dataclass(frozen=True)
class AnalysisRecipeStagePlan:
    recipe_id: str
    stages: tuple[AnalysisRecipeStage, ...]
    default_atlas_levels: tuple[int, ...] = DEFAULT_ATLAS_LEVELS
    optional_atlas_levels: tuple[int, ...] = OPTIONAL_ATLAS_LEVELS
    explorer_required_artifact_roles: tuple[str, ...] = (
        EXPLORER_REQUIRED_ARTIFACT_ROLES
    )
    primary_cluster_method: str = "hdbscan"
    optional_cluster_methods: tuple[str, ...] = ("kmeans",)
    noise_label: str = "Unclustered"

    @property
    def stage_ids(self) -> tuple[str, ...]:
        return tuple(stage.stage_id for stage in self.stages)

    @property
    def runtime_stage_ids(self) -> tuple[str, ...]:
        return tuple(stage.stage_id for stage in self.stages if stage.runtime_stage)

    def to_browser_payload(self) -> dict[str, object]:
        return {
            "artifact_roles_required_for_explorer": list(
                self.explorer_required_artifact_roles
            ),
            "atlas_levels": {
                "default": list(self.default_atlas_levels),
                "optional": list(self.optional_atlas_levels),
            },
            "clusters": {
                "noise_label": self.noise_label,
                "optional": list(self.optional_cluster_methods),
                "primary": self.primary_cluster_method,
            },
            "recipe_id": self.recipe_id,
            "runtime_stage_ids": list(self.runtime_stage_ids),
            "stage_ids": list(self.stage_ids),
            "stages": [stage.to_browser_payload() for stage in self.stages],
        }


@dataclass(frozen=True)
class AnalysisRecipe:
    recipe_id: str
    label: str
    recipe_kind: str
    model_family: str
    model_id: str
    model_revision: str | None
    preprocessor_id: str
    preprocessor_version: str | None
    input_derivative: str
    input_size: int | None
    preserve_aspect_ratio: bool
    pad_to_multiple: int | None
    padding_color_rgb: tuple[int, int, int] | None
    embedding_dimension: int | None
    vector_kind: str
    normalization: str
    downstream_stages: tuple[str, ...]
    package_notes: tuple[str, ...] = ()
    component_recipe_ids: tuple[str, ...] = ()
    stage_plan: AnalysisRecipeStagePlan | None = None

    def to_provenance_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "recipe_id": self.recipe_id,
            "label": self.label,
            "recipe_kind": self.recipe_kind,
            "model": {
                "family": self.model_family,
                "id": self.model_id,
                "revision": self.model_revision,
            },
            "preprocessing": {
                "input_derivative": self.input_derivative,
                "input_size": self.input_size,
                "pad_to_multiple": self.pad_to_multiple,
                "padding_color_rgb": (
                    list(self.padding_color_rgb)
                    if self.padding_color_rgb is not None
                    else None
                ),
                "preserve_aspect_ratio": self.preserve_aspect_ratio,
                "preprocessor_id": self.preprocessor_id,
                "preprocessor_version": self.preprocessor_version,
            },
            "embedding": {
                "dimension": self.embedding_dimension,
                "normalization": self.normalization,
                "vector_kind": self.vector_kind,
            },
            "downstream_stages": list(self.downstream_stages),
            "package_notes": list(self.package_notes),
        }
        if self.component_recipe_ids:
            payload["component_recipe_ids"] = list(self.component_recipe_ids)
        if self.stage_plan is not None:
            payload["stage_plan"] = self.stage_plan.to_browser_payload()
        return payload

    def to_browser_payload(self, *, is_default: bool = False) -> dict[str, object]:
        return {
            "embedding": {
                "dimension": self.embedding_dimension,
                "normalization": self.normalization,
                "vector_kind": self.vector_kind,
            },
            "input_derivative": self.input_derivative,
            "input_size": self.input_size,
            "is_default": is_default,
            "label": self.label,
            "model_family": self.model_family,
            "preprocessing": {
                "pad_to_multiple": self.pad_to_multiple,
                "preserve_aspect_ratio": self.preserve_aspect_ratio,
            },
            "recipe_id": self.recipe_id,
            "recipe_kind": self.recipe_kind,
            "stage_plan": (
                self.stage_plan.to_browser_payload()
                if self.stage_plan is not None
                else None
            ),
        }

    def embedding_fingerprint_payload(self) -> dict[str, object]:
        return {
            "recipe_id": self.recipe_id,
            "recipe_kind": self.recipe_kind,
            "model_family": self.model_family,
            "model_id": self.model_id,
            "model_revision": self.model_revision,
            "preprocessor_id": self.preprocessor_id,
            "preprocessor_version": self.preprocessor_version,
            "input_derivative": self.input_derivative,
            "input_size": self.input_size,
            "preserve_aspect_ratio": self.preserve_aspect_ratio,
            "pad_to_multiple": self.pad_to_multiple,
            "padding_color_rgb": (
                list(self.padding_color_rgb)
                if self.padding_color_rgb is not None
                else None
            ),
            "embedding_dimension": self.embedding_dimension,
            "vector_kind": self.vector_kind,
            "normalization": self.normalization,
            "component_recipe_ids": list(self.component_recipe_ids),
        }

    def embedding_fingerprint(self) -> str:
        return hashlib.sha256(
            json.dumps(
                self.embedding_fingerprint_payload(),
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()


def list_analysis_recipes() -> list[AnalysisRecipe]:
    return list(ANALYSIS_RECIPE_REGISTRY.values())


def browser_safe_analysis_recipe_catalog() -> dict[str, object]:
    return {
        "default_recipe_id": DEFAULT_ANALYSIS_RECIPE_ID,
        "recipes": [
            recipe.to_browser_payload(
                is_default=recipe.recipe_id == DEFAULT_ANALYSIS_RECIPE_ID
            )
            for recipe in list_analysis_recipes()
        ],
        "schema_version": 1,
    }


def get_analysis_recipe(recipe_id: str) -> AnalysisRecipe:
    try:
        return ANALYSIS_RECIPE_REGISTRY[recipe_id]
    except KeyError as error:
        raise ValueError(f"Unknown Analysis Recipe: {recipe_id}") from error


def get_default_analysis_recipe() -> AnalysisRecipe:
    return get_analysis_recipe(DEFAULT_ANALYSIS_RECIPE_ID)


def select_analysis_recipes(recipe_ids: Sequence[str] | None) -> list[AnalysisRecipe]:
    if recipe_ids is None:
        return [get_default_analysis_recipe()]
    selected_recipe_ids = _dedupe_recipe_ids(recipe_ids)
    if not selected_recipe_ids:
        return [get_default_analysis_recipe()]
    return [get_analysis_recipe(recipe_id) for recipe_id in selected_recipe_ids]


def _dedupe_recipe_ids(recipe_ids: Sequence[str]) -> list[str]:
    selected_recipe_ids: list[str] = []
    for recipe_id in recipe_ids:
        normalized_recipe_id = recipe_id.strip()
        if normalized_recipe_id and normalized_recipe_id not in selected_recipe_ids:
            selected_recipe_ids.append(normalized_recipe_id)
    return selected_recipe_ids


def _dinov3_recipe(*, long_edge: int) -> AnalysisRecipe:
    recipe_id = f"dinov3_vits_{long_edge}"
    stage_plan = _latent_map_stage_plan(recipe_id=recipe_id)
    return AnalysisRecipe(
        recipe_id=recipe_id,
        label=f"DINOv3 ViT-S {long_edge}px",
        recipe_kind="image-embedding",
        model_family="dinov3",
        model_id=DINO_V3_VITS_MODEL_ID,
        model_revision=None,
        preprocessor_id=DINO_PREPROCESSOR_ID,
        preprocessor_version=DINO_PREPROCESSOR_VERSION,
        input_derivative="standard-1024",
        input_size=long_edge,
        preserve_aspect_ratio=True,
        pad_to_multiple=16,
        padding_color_rgb=DINO_PADDING_COLOR_RGB,
        embedding_dimension=DINO_V3_VITS_EMBEDDING_DIMENSION,
        vector_kind="image-class-token",
        normalization="l2",
        downstream_stages=stage_plan.stage_ids,
        package_notes=(
            "DINOv3 ViT-S/16 frozen visual embedding backbone",
            "Transformers AutoModel class-token embedding",
            "L2-normalized before FAISS and downstream layouts",
        ),
        stage_plan=stage_plan,
    )


def _latent_map_stage_plan(*, recipe_id: str) -> AnalysisRecipeStagePlan:
    return AnalysisRecipeStagePlan(
        recipe_id=recipe_id,
        stages=(
            AnalysisRecipeStage(
                stage_id="embedding_computation",
                label="Embedding computation",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="embedding",
                        content_type="application/octet-stream",
                        retention_class="durable",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="embedding-vector-id-map",
                        content_type="application/json",
                        retention_class="durable",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="embedding-materialization-metadata",
                        content_type="application/json",
                        retention_class="durable",
                        required=True,
                    ),
                ),
            ),
            AnalysisRecipeStage(
                stage_id="faiss",
                label="FAISS similarity index",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="faiss-index",
                        content_type="application/octet-stream",
                        retention_class="durable",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="faiss-id-map",
                        content_type="application/json",
                        retention_class="durable",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="faiss-neighbors",
                        content_type="application/x-jsonlines",
                        retention_class="durable",
                        required=False,
                    ),
                ),
            ),
            AnalysisRecipeStage(
                stage_id="umap",
                label="UMAP navigation layout",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="layout",
                        content_type="application/json",
                        retention_class="durable",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="cluster-result",
                        content_type="application/json",
                        retention_class="durable",
                        required=False,
                        method="kmeans",
                    ),
                ),
            ),
            AnalysisRecipeStage(
                stage_id="hdbscan",
                label="HDBSCAN clusters",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="cluster-result",
                        content_type="application/json",
                        retention_class="durable",
                        required=True,
                        method="hdbscan",
                    ),
                ),
            ),
            AnalysisRecipeStage(
                stage_id="atlas_generation",
                label="Explorer thumbnail atlases",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="thumbnail-atlas",
                        content_type="application/json",
                        retention_class="render-cache",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="thumbnail-atlas-page",
                        content_type="image/png",
                        retention_class="render-cache",
                        required=False,
                    ),
                ),
            ),
            AnalysisRecipeStage(
                stage_id="viewer_metadata",
                label="Explorer viewer metadata",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="viewer-data",
                        content_type="application/json",
                        retention_class="viewer-cache",
                        required=True,
                    ),
                    AnalysisStageArtifactDeclaration(
                        role="viewer-neighbors",
                        content_type="application/json",
                        retention_class="viewer-cache",
                        required=True,
                    ),
                ),
                runtime_stage=False,
            ),
            AnalysisRecipeStage(
                stage_id="result_registration",
                label="Analysis Result registration",
                artifacts=(
                    AnalysisStageArtifactDeclaration(
                        role="analysis-result-manifest",
                        content_type="application/json",
                        retention_class="durable",
                        required=True,
                    ),
                ),
                runtime_stage=False,
            ),
        ),
    )


ANALYSIS_RECIPE_REGISTRY = {
    recipe.recipe_id: recipe
    for recipe in (
        _dinov3_recipe(long_edge=256),
        _dinov3_recipe(long_edge=384),
        _dinov3_recipe(long_edge=512),
    )
}
