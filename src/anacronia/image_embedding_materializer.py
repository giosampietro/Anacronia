from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import numpy as np

from anacronia.analysis_recipes import AnalysisRecipe
from anacronia.analysis_scopes import ResolvedAnalysisScope
from anacronia.image_embedding_results import (
    ImageEmbeddingResult,
    RecipeEmbeddingReusePlan,
    plan_image_embedding_reuse,
)


@dataclass(frozen=True)
class MaterializedEmbeddingArtifact:
    key: str
    role: str
    content_type: str
    retention_class: str
    metadata: dict[str, object] | None = None


@dataclass(frozen=True)
class MaterializedRecipeEmbeddings:
    recipe_id: str
    embedding_path: Path
    vector_id_map_path: Path
    metadata_path: Path
    vector_count: int
    vector_dimension: int
    reusable_count: int
    missing_image_asset_ids: list[int]
    artifacts: list[MaterializedEmbeddingArtifact]


@dataclass(frozen=True)
class RecipeEmbeddingMaterializationPlan:
    recipe_id: str
    reusable: list[ImageEmbeddingResult]
    missing_items: list[dict[str, object]]
    source_items: list[dict[str, object]]

    @property
    def ready(self) -> bool:
        return not self.missing_items

    @property
    def reusable_image_asset_ids(self) -> list[int]:
        return [result.image_asset_id for result in self.reusable]

    @property
    def missing_image_asset_ids(self) -> list[int]:
        return [int(item["image_asset_id"]) for item in self.missing_items]

    @property
    def source_image_asset_ids(self) -> list[int]:
        return [int(item["image_asset_id"]) for item in self.source_items]


class ImageEmbeddingMaterializationError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        missing_image_asset_ids: list[int] | None = None,
    ) -> None:
        super().__init__(message)
        self.missing_image_asset_ids = missing_image_asset_ids or []


def plan_recipe_embedding_materialization(
    *,
    data_root: Path,
    resolved_scope: ResolvedAnalysisScope,
    recipe: AnalysisRecipe,
) -> RecipeEmbeddingMaterializationPlan:
    reuse_plan = plan_image_embedding_reuse(
        data_root=data_root.expanduser().resolve(),
        resolved_scope=resolved_scope,
        recipes=[recipe],
    ).recipe_plans[recipe.recipe_id]
    return RecipeEmbeddingMaterializationPlan(
        recipe_id=recipe.recipe_id,
        reusable=reuse_plan.reusable,
        missing_items=reuse_plan.missing_items,
        source_items=_scope_items(resolved_scope),
    )


def materialize_recipe_embedding_matrix(
    *,
    data_root: Path,
    result_dir: Path,
    resolved_scope: ResolvedAnalysisScope,
    recipe: AnalysisRecipe,
    reuse_plan: RecipeEmbeddingReusePlan | None = None,
) -> MaterializedRecipeEmbeddings:
    resolved_data_root = data_root.expanduser().resolve()
    resolved_result_dir = result_dir.expanduser().resolve()
    plan = reuse_plan or plan_recipe_embedding_materialization(
        data_root=resolved_data_root,
        resolved_scope=resolved_scope,
        recipe=recipe,
    )
    missing_image_asset_ids = plan.missing_image_asset_ids
    if missing_image_asset_ids:
        raise ImageEmbeddingMaterializationError(
            "Missing reusable embeddings for image assets: "
            + ", ".join(str(image_asset_id) for image_asset_id in missing_image_asset_ids),
            missing_image_asset_ids=missing_image_asset_ids,
        )

    reusable_by_image_asset_id = {
        result.image_asset_id: result for result in plan.reusable
    }
    vectors: list[np.ndarray] = []
    vector_id_map: list[dict[str, object]] = []
    for vector_id, item in enumerate(_scope_items(resolved_scope)):
        image_asset_id = int(item["image_asset_id"])
        result = reusable_by_image_asset_id.get(image_asset_id)
        if result is None:
            raise ImageEmbeddingMaterializationError(
                f"Missing reusable embedding for image asset: {image_asset_id}",
                missing_image_asset_ids=[image_asset_id],
            )
        vectors.append(
            _load_embedding_vector(
                data_root=resolved_data_root,
                result=result,
                recipe=recipe,
            )
        )
        vector_id_map.append(
            {
                "contributing_collections": list(
                    item.get("contributing_collections", [])
                ),
                "image_asset_id": image_asset_id,
                "image_embedding_result_id": result.image_embedding_result_id,
                "image_id": f"image-asset-{image_asset_id}",
                "source_identity": dict(item.get("source_identity", {})),
                "vector_id": vector_id,
            }
        )

    if not vectors:
        matrix = np.empty((0, int(recipe.embedding_dimension or 0)), dtype=np.float32)
    else:
        matrix = np.vstack(vectors).astype(np.float32)

    embeddings_dir = resolved_result_dir / "embeddings"
    embeddings_dir.mkdir(parents=True, exist_ok=True)
    embedding_path = embeddings_dir / f"{recipe.recipe_id}.npy"
    vector_id_map_path = embeddings_dir / f"{recipe.recipe_id}_vector_id_map.json"
    metadata_path = embeddings_dir / f"{recipe.recipe_id}_materialization.json"
    np.save(embedding_path, matrix)
    vector_id_map_path.write_text(
        json.dumps(vector_id_map, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    artifacts = [
        MaterializedEmbeddingArtifact(
            key=_relative_key(embedding_path, resolved_result_dir),
            role="embedding",
            content_type="application/octet-stream",
            retention_class="durable",
        ),
        MaterializedEmbeddingArtifact(
            key=_relative_key(vector_id_map_path, resolved_result_dir),
            role="embedding-vector-id-map",
            content_type="application/json",
            retention_class="durable",
        ),
        MaterializedEmbeddingArtifact(
            key=_relative_key(metadata_path, resolved_result_dir),
            role="embedding-materialization-metadata",
            content_type="application/json",
            retention_class="durable",
        ),
    ]

    metadata = {
        "asset_kind": "embedding-materialization-metadata",
        "artifacts": [_artifact_payload(artifact) for artifact in artifacts],
        "missing_image_asset_ids": [],
        "recipe_fingerprint": recipe.embedding_fingerprint(),
        "recipe_id": recipe.recipe_id,
        "reusable_count": len(plan.reusable),
        "vector_count": int(matrix.shape[0]),
        "vector_dimension": int(matrix.shape[1]) if matrix.ndim == 2 else 0,
    }
    metadata_path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    return MaterializedRecipeEmbeddings(
        recipe_id=recipe.recipe_id,
        embedding_path=embedding_path,
        vector_id_map_path=vector_id_map_path,
        metadata_path=metadata_path,
        vector_count=int(matrix.shape[0]),
        vector_dimension=int(matrix.shape[1]) if matrix.ndim == 2 else 0,
        reusable_count=len(plan.reusable),
        missing_image_asset_ids=[],
        artifacts=artifacts,
    )


def _load_embedding_vector(
    *,
    data_root: Path,
    result: ImageEmbeddingResult,
    recipe: AnalysisRecipe,
) -> np.ndarray:
    artifact_key = result.artifact_key.strip()
    if _is_unsafe_artifact_key(artifact_key):
        raise ImageEmbeddingMaterializationError(
            f"Embedding artifact key is unsafe: {artifact_key}"
        )
    artifact_path = data_root / artifact_key
    if not artifact_path.is_file():
        raise ImageEmbeddingMaterializationError(
            f"Embedding artifact file not found: {artifact_key}"
        )
    vector = np.load(artifact_path).astype(np.float32)
    if vector.ndim == 2 and vector.shape[0] == 1:
        vector = vector[0]
    if vector.ndim != 1:
        raise ImageEmbeddingMaterializationError(
            f"Embedding vector must be one-dimensional: {artifact_key}"
        )
    expected_dimension = recipe.embedding_dimension
    if expected_dimension is not None and int(vector.shape[0]) != expected_dimension:
        raise ImageEmbeddingMaterializationError(
            f"Embedding vector dimension mismatch for {artifact_key}: "
            f"expected {expected_dimension}, got {int(vector.shape[0])}"
        )
    return vector


def _scope_items(resolved_scope: ResolvedAnalysisScope) -> list[dict[str, object]]:
    items = resolved_scope.payload.get("items", [])
    if not isinstance(items, list):
        raise ValueError("Resolved Analysis Scope payload has invalid items.")
    return [item for item in items if isinstance(item, dict)]


def _relative_key(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _artifact_payload(artifact: MaterializedEmbeddingArtifact) -> dict[str, object]:
    return {
        "content_type": artifact.content_type,
        "key": artifact.key,
        "retention_class": artifact.retention_class,
        "role": artifact.role,
    }


def _is_unsafe_artifact_key(artifact_key: str) -> bool:
    path = Path(artifact_key)
    return path.is_absolute() or ".." in path.parts
