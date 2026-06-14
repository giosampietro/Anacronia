from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import json
from typing import Sequence


DEFAULT_ANALYSIS_RECIPE_ID = "dinov3_vits_384"
DINO_V3_VITS_MODEL_ID = "facebook/dinov3-vits16-pretrain-lvd1689m"
DINO_V3_VITS_EMBEDDING_DIMENSION = 384
DINO_PADDING_COLOR_RGB = (124, 116, 104)
DINO_PREPROCESSOR_ID = "anacronia-dinov3-preserve-aspect-pad-v1"
DINO_PREPROCESSOR_VERSION = "1"


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
    thumbnail_atlas_tile_sizes: tuple[int, ...] = ()
    package_notes: tuple[str, ...] = ()
    component_recipe_ids: tuple[str, ...] = ()

    def with_thumbnail_atlas_tile_sizes(
        self,
        tile_sizes: Sequence[int],
    ) -> AnalysisRecipe:
        normalized_tile_sizes = tuple(
            tile_size for tile_size in tile_sizes if tile_size > 0
        )
        if not normalized_tile_sizes:
            raise ValueError("At least one thumbnail atlas tile size is required.")
        return replace(self, thumbnail_atlas_tile_sizes=normalized_tile_sizes)

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
        if self.thumbnail_atlas_tile_sizes:
            payload["viewer"] = {
                "thumbnail_atlas_tile_sizes": list(self.thumbnail_atlas_tile_sizes),
            }
        if self.component_recipe_ids:
            payload["component_recipe_ids"] = list(self.component_recipe_ids)
        return payload

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
    return AnalysisRecipe(
        recipe_id=f"dinov3_vits_{long_edge}",
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
        downstream_stages=(
            "faiss",
            "umap",
            "hdbscan",
            "baseline-atlas-32px",
        ),
        thumbnail_atlas_tile_sizes=(32, 64, 96),
        package_notes=(
            "DINOv3 ViT-S/16 frozen visual embedding backbone",
            "Transformers AutoModel class-token embedding",
            "L2-normalized before FAISS and downstream layouts",
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
