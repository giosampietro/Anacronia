from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Mapping, Sequence

from anacronia.analysis_recipes import AnalysisRecipe
from anacronia.analysis_scopes import ResolvedAnalysisScope


IMAGE_EMBEDDING_RESULT_MANIFEST_NAME = "image-embedding-result.json"


@dataclass(frozen=True)
class ImageEmbeddingResult:
    image_embedding_result_id: str
    image_asset_id: int
    recipe_id: str
    recipe_fingerprint: str
    artifact_key: str
    vector_dimension: int
    source_identity: dict[str, object]
    manifest_path: Path


@dataclass(frozen=True)
class RecipeEmbeddingReusePlan:
    recipe_id: str
    reusable: list[ImageEmbeddingResult]
    missing_items: list[dict[str, object]]

    @property
    def reusable_image_asset_ids(self) -> list[int]:
        return [result.image_asset_id for result in self.reusable]

    @property
    def missing_image_asset_ids(self) -> list[int]:
        return [int(item["image_asset_id"]) for item in self.missing_items]


@dataclass(frozen=True)
class ImageEmbeddingReusePlan:
    recipe_plans: dict[str, RecipeEmbeddingReusePlan]

    @property
    def total_missing_embeddings(self) -> int:
        return sum(
            len(recipe_plan.missing_items)
            for recipe_plan in self.recipe_plans.values()
        )

    @property
    def total_reusable_embeddings(self) -> int:
        return sum(
            len(recipe_plan.reusable)
            for recipe_plan in self.recipe_plans.values()
        )


def record_image_embedding_result(
    *,
    data_root: Path,
    image_asset_id: int,
    source_identity: Mapping[str, object],
    recipe: AnalysisRecipe,
    artifact_key: str,
    vector_dimension: int,
    created_at: datetime | None = None,
) -> ImageEmbeddingResult:
    if image_asset_id < 1:
        raise ValueError("image_asset_id must be a positive integer.")
    normalized_artifact_key = artifact_key.strip()
    if not normalized_artifact_key:
        raise ValueError("artifact_key is required.")
    if _is_unsafe_artifact_key(normalized_artifact_key):
        raise ValueError("artifact_key must be a relative artifact key.")
    if (
        recipe.embedding_dimension is not None
        and vector_dimension != recipe.embedding_dimension
    ):
        raise ValueError("vector_dimension does not match the Analysis Recipe.")

    recipe_fingerprint = recipe.embedding_fingerprint()
    result_id = _image_embedding_result_id(
        image_asset_id=image_asset_id,
        recipe_fingerprint=recipe_fingerprint,
    )
    manifest_path = _image_embedding_manifest_path(
        data_root=data_root,
        recipe=recipe,
        image_asset_id=image_asset_id,
    )
    payload = {
        "schema_version": 1,
        "asset_kind": "image-embedding-result",
        "image_embedding_result_id": result_id,
        "created_at": _format_timestamp(created_at or datetime.now(timezone.utc)),
        "image_asset_id": image_asset_id,
        "source_identity": dict(source_identity),
        "recipe_id": recipe.recipe_id,
        "recipe_fingerprint": recipe_fingerprint,
        "recipe": recipe.to_provenance_payload(),
        "input_derivative": recipe.input_derivative,
        "vector_dimension": vector_dimension,
        "normalization": recipe.normalization,
        "artifact_key": normalized_artifact_key,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return _image_embedding_result_from_payload(
        payload=payload,
        manifest_path=manifest_path,
    )


def find_reusable_image_embedding_result(
    *,
    data_root: Path,
    image_asset_id: int,
    recipe: AnalysisRecipe,
) -> ImageEmbeddingResult | None:
    manifest_path = _image_embedding_manifest_path(
        data_root=data_root,
        recipe=recipe,
        image_asset_id=image_asset_id,
    )
    if not manifest_path.is_file():
        return None

    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if payload.get("recipe_fingerprint") != recipe.embedding_fingerprint():
        return None
    if int(payload.get("image_asset_id", 0)) != image_asset_id:
        return None
    if str(payload.get("recipe_id", "")) != recipe.recipe_id:
        return None
    if not str(payload.get("artifact_key", "")).strip():
        return None
    if (
        recipe.embedding_dimension is not None
        and int(payload.get("vector_dimension", 0)) != recipe.embedding_dimension
    ):
        return None

    return _image_embedding_result_from_payload(
        payload=payload,
        manifest_path=manifest_path,
    )


def plan_image_embedding_reuse(
    *,
    data_root: Path,
    resolved_scope: ResolvedAnalysisScope,
    recipes: Sequence[AnalysisRecipe],
) -> ImageEmbeddingReusePlan:
    recipe_plans = {}
    scope_items = _scope_items(resolved_scope)
    for recipe in recipes:
        reusable: list[ImageEmbeddingResult] = []
        missing_items: list[dict[str, object]] = []
        for item in scope_items:
            image_asset_id = int(item["image_asset_id"])
            existing = find_reusable_image_embedding_result(
                data_root=data_root,
                image_asset_id=image_asset_id,
                recipe=recipe,
            )
            if existing is not None:
                reusable.append(existing)
                continue
            missing_items.append(
                {
                    "image_asset_id": image_asset_id,
                    "source_identity": dict(item["source_identity"]),
                }
            )
        recipe_plans[recipe.recipe_id] = RecipeEmbeddingReusePlan(
            recipe_id=recipe.recipe_id,
            reusable=reusable,
            missing_items=missing_items,
        )
    return ImageEmbeddingReusePlan(recipe_plans=recipe_plans)


def _scope_items(resolved_scope: ResolvedAnalysisScope) -> list[dict[str, object]]:
    items = resolved_scope.payload.get("items", [])
    if not isinstance(items, list):
        raise ValueError("Resolved Analysis Scope payload has invalid items.")
    return items


def _image_embedding_manifest_path(
    *,
    data_root: Path,
    recipe: AnalysisRecipe,
    image_asset_id: int,
) -> Path:
    recipe_fingerprint = recipe.embedding_fingerprint()
    return (
        data_root
        / "image-embedding-results"
        / recipe.recipe_id
        / f"image-asset-{image_asset_id}-{recipe_fingerprint[:12]}"
        / IMAGE_EMBEDDING_RESULT_MANIFEST_NAME
    )


def _image_embedding_result_id(
    *,
    image_asset_id: int,
    recipe_fingerprint: str,
) -> str:
    return f"image-embedding-{image_asset_id}-{recipe_fingerprint[:12]}"


def _is_unsafe_artifact_key(artifact_key: str) -> bool:
    path = Path(artifact_key)
    return path.is_absolute() or ".." in path.parts


def _image_embedding_result_from_payload(
    *,
    payload: dict[str, object],
    manifest_path: Path,
) -> ImageEmbeddingResult:
    source_identity = payload.get("source_identity", {})
    if not isinstance(source_identity, dict):
        source_identity = {}
    return ImageEmbeddingResult(
        image_embedding_result_id=str(payload["image_embedding_result_id"]),
        image_asset_id=int(payload["image_asset_id"]),
        recipe_id=str(payload["recipe_id"]),
        recipe_fingerprint=str(payload["recipe_fingerprint"]),
        artifact_key=str(payload["artifact_key"]),
        vector_dimension=int(payload["vector_dimension"]),
        source_identity=dict(source_identity),
        manifest_path=manifest_path,
    )


def _format_timestamp(value: datetime) -> str:
    timestamp = value.astimezone(timezone.utc)
    return timestamp.isoformat().replace("+00:00", "Z")
