from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from anacronia.analysis_jobs import (
    AnalysisStageArtifact,
    AnalysisStageRequest,
    AnalysisStageResult,
)


class _ImageEmbedder(Protocol):
    model_id: str
    device: str

    def embed_batch(self, images):
        ...


class _Reducer(Protocol):
    def fit_transform(self, vectors):
        ...


class _Clusterer(Protocol):
    def fit_predict(self, vectors):
        ...


@dataclass
class LatentMapAnalysisStageRunner:
    atlas_size: int = 2048
    batch_size: int = 8
    device: str = "auto"
    embedder: _ImageEmbedder | None = None
    hdbscan_clusterer: _Clusterer | None = None
    hdbscan_preset_slug: str = "detail"
    layout_cluster_count: int = 12
    layout_clusterer: _Clusterer | None = None
    reducer: _Reducer | None = None
    top_k: int = 20
    umap_min_dist: float = 0.05
    umap_n_neighbors: int = 15
    umap_random_state: int = 42

    def run_stage(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        if request.stage_name == "embedding_computation":
            return self._run_embedding(request)
        if request.stage_name == "faiss":
            return self._run_faiss(request)
        if request.stage_name == "umap":
            return self._run_umap(request)
        if request.stage_name in {"hdbscan", "clustering"}:
            return self._run_clustering(request)
        if request.stage_name in {"atlas_generation", "baseline_atlas"}:
            return self._run_baseline_atlas(request)
        raise ValueError(f"Unsupported Analysis Job stage: {request.stage_name}")

    def _run_embedding(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        from anacronia.image_embedding_materializer import (
            materialize_recipe_embedding_matrix,
        )

        try:
            if request.embedding_plan.missing_items:
                self._record_missing_image_embedding_results(request)
            summary = materialize_recipe_embedding_matrix(
                data_root=request.data_root,
                result_dir=request.analysis_result_dir,
                resolved_scope=request.resolved_scope,
                recipe=request.recipe,
            )
            return AnalysisStageResult(
                artifacts=[
                    _artifact_for_path(
                        key=artifact.key,
                        path=request.analysis_result_dir / artifact.key,
                        role=artifact.role,
                        content_type=artifact.content_type,
                        retention_class=artifact.retention_class,
                        metadata=artifact.metadata,
                    )
                    for artifact in summary.artifacts
                ]
            )
        except Exception as error:
            friendly_error = _friendly_embedding_error(error)
            if friendly_error is not None:
                raise RuntimeError(friendly_error) from error
            raise

    def _record_missing_image_embedding_results(
        self,
        request: AnalysisStageRequest,
    ) -> None:
        from PIL import Image

        from anacronia.image_embedding_results import record_image_embedding_result
        from anacronia.latent_map_embedding_recipes import DINO_EMBEDDING_RECIPES
        from anacronia.latent_map_embeddings import (
            DinoImageEmbedder,
            prepare_image_for_embedding,
        )

        try:
            embedding_recipe = DINO_EMBEDDING_RECIPES[request.recipe.recipe_id]
        except KeyError as error:
            raise ValueError(
                f"Unsupported embedding recipe: {request.recipe.recipe_id}"
            ) from error

        embedder = self.embedder or DinoImageEmbedder(
            model_id=embedding_recipe.model_id,
            device=self.device,
        )
        scope_items_by_id = {
            int(item["image_asset_id"]): item
            for item in _scope_items(request.resolved_scope)
        }
        missing_items = [
            scope_items_by_id[int(item["image_asset_id"])]
            for item in request.embedding_plan.missing_items
        ]

        batch_size = max(1, int(self.batch_size))
        prepared_groups: dict[
            tuple[int, int],
            list[tuple[dict[str, object], object]],
        ] = {}
        for item in missing_items:
            derivative_key = _input_derivative_key(
                item=item,
                derivative=request.recipe.input_derivative,
            )
            image_path = request.data_root / derivative_key
            with Image.open(image_path) as image:
                prepared_image = prepare_image_for_embedding(
                    image,
                    recipe=embedding_recipe,
                ).image

            group = prepared_groups.setdefault(prepared_image.size, [])
            group.append((item, prepared_image))
            if len(group) >= batch_size:
                self._record_prepared_embedding_batch(
                    embedder=embedder,
                    items_and_images=group,
                    request=request,
                    record_image_embedding_result=record_image_embedding_result,
                )
                group.clear()

        for group in prepared_groups.values():
            if group:
                self._record_prepared_embedding_batch(
                    embedder=embedder,
                    items_and_images=group,
                    request=request,
                    record_image_embedding_result=record_image_embedding_result,
                )

    def _record_prepared_embedding_batch(
        self,
        *,
        embedder: _ImageEmbedder,
        items_and_images: list[tuple[dict[str, object], object]],
        request: AnalysisStageRequest,
        record_image_embedding_result,
    ) -> None:
        items = [item for item, _image in items_and_images]
        prepared_images = [image for _item, image in items_and_images]
        vectors = _l2_normalize(embedder.embed_batch(prepared_images))

        for item, vector in zip(items, vectors, strict=True):
            image_asset_id = int(item["image_asset_id"])
            artifact_key = _image_embedding_artifact_key(
                image_asset_id=image_asset_id,
                recipe_id=request.recipe.recipe_id,
                recipe_fingerprint=request.recipe.embedding_fingerprint(),
            )
            artifact_path = request.data_root / artifact_key
            artifact_path.parent.mkdir(parents=True, exist_ok=True)
            np.save(artifact_path, vector.astype(np.float32))
            record_image_embedding_result(
                data_root=request.data_root,
                image_asset_id=image_asset_id,
                source_identity=dict(item.get("source_identity", {})),
                recipe=request.recipe,
                artifact_key=artifact_key,
                vector_dimension=int(vector.shape[0]),
            )

    def _run_faiss(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        from anacronia.latent_map_faiss import build_faiss_index

        summary = build_faiss_index(
            run_dir=request.analysis_result_dir,
            recipe_name=request.recipe.recipe_id,
            top_k=self.top_k,
        )
        return AnalysisStageResult(
            artifacts=[
                _artifact_for_path(
                    key=_relative_key(summary.index_path, request.analysis_result_dir),
                    path=summary.index_path,
                    role="faiss-index",
                    content_type="application/octet-stream",
                    retention_class="durable",
                ),
                _artifact_for_path(
                    key=_relative_key(summary.id_map_path, request.analysis_result_dir),
                    path=summary.id_map_path,
                    role="faiss-id-map",
                    content_type="application/json",
                    retention_class="durable",
                ),
                _artifact_for_path(
                    key=_relative_key(summary.neighbors_path, request.analysis_result_dir),
                    path=summary.neighbors_path,
                    role="faiss-neighbors",
                    content_type="application/x-jsonlines",
                    retention_class="durable",
                ),
            ]
        )

    def _run_umap(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        from anacronia.latent_map_layout import build_latent_map_layout

        summary = build_latent_map_layout(
            run_dir=request.analysis_result_dir,
            recipe_name=request.recipe.recipe_id,
            n_neighbors=self.umap_n_neighbors,
            min_dist=self.umap_min_dist,
            cluster_count=self.layout_cluster_count,
            random_state=self.umap_random_state,
            reducer=self.reducer,
            clusterer=self.layout_clusterer,
        )
        return AnalysisStageResult(
            artifacts=[
                _artifact_for_path(
                    key=_relative_key(summary.layout_path, request.analysis_result_dir),
                    path=summary.layout_path,
                    role="layout",
                    content_type="application/json",
                    retention_class="durable",
                    metadata={"layout_id": summary.layout_id},
                ),
                _artifact_for_path(
                    key=_relative_key(summary.cluster_path, request.analysis_result_dir),
                    path=summary.cluster_path,
                    role="cluster-result",
                    content_type="application/json",
                    retention_class="durable",
                    metadata={"cluster_id": summary.cluster_id},
                ),
            ]
        )

    def _run_clustering(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        from anacronia.latent_map_clusters import (
            build_hdbscan_cluster_result,
            build_hdbscan_cluster_results,
            get_hdbscan_presets,
        )

        if self.hdbscan_clusterer is None:
            summaries = build_hdbscan_cluster_results(
                run_dir=request.analysis_result_dir,
                recipe_name=request.recipe.recipe_id,
                preset_slug=self.hdbscan_preset_slug,
            )
        else:
            summaries = [
                build_hdbscan_cluster_result(
                    run_dir=request.analysis_result_dir,
                    recipe_name=request.recipe.recipe_id,
                    preset=get_hdbscan_presets(self.hdbscan_preset_slug)[0],
                    clusterer=self.hdbscan_clusterer,
                )
            ]

        return AnalysisStageResult(
            artifacts=[
                _artifact_for_path(
                    key=_relative_key(summary.cluster_path, request.analysis_result_dir),
                    path=summary.cluster_path,
                    role="cluster-result",
                    content_type="application/json",
                    retention_class="durable",
                    metadata={"cluster_id": summary.cluster_id},
                )
                for summary in summaries
            ]
        )

    def _run_baseline_atlas(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        from anacronia.latent_map_atlas import generate_latent_map_thumbnail_atlas
        from anacronia.latent_map_viewer_export import export_viewer_data

        atlas_levels = _atlas_levels_for_recipe(request.recipe)
        atlases = [
            generate_latent_map_thumbnail_atlas(
                run_dir=request.analysis_result_dir,
                tile_size=tile_size,
                atlas_size=max(self.atlas_size, tile_size),
            )
            for tile_size in atlas_levels
        ]
        atlas_manifest_paths = {
            atlas.tile_size: atlas.manifest_path for atlas in atlases
        }
        baseline_atlas = atlas_manifest_paths.get(32) or next(
            iter(atlas_manifest_paths.values())
        )
        viewer = export_viewer_data(
            run_dir=request.analysis_result_dir,
            recipe_name=request.recipe.recipe_id,
            thumbnail_atlas_manifest_path=baseline_atlas,
            thumbnail_atlas_manifest_paths=atlas_manifest_paths,
        )
        page_artifacts = [
            _artifact_for_path(
                key=_relative_key(path, request.analysis_result_dir),
                path=path,
                role="thumbnail-atlas-page",
                content_type="image/png",
                retention_class="render-cache",
            )
            for atlas in atlases
            for path in sorted(atlas.manifest_path.parent.glob("page-*.png"))
        ]
        return AnalysisStageResult(
            artifacts=[
                *[
                    _artifact_for_path(
                        key=_relative_key(
                            atlas.manifest_path,
                            request.analysis_result_dir,
                        ),
                        path=atlas.manifest_path,
                        role="thumbnail-atlas",
                        content_type="application/json",
                        retention_class="render-cache",
                        metadata={"tile_size": atlas.tile_size},
                    )
                    for atlas in atlases
                ],
                *page_artifacts,
                _artifact_for_path(
                    key=_relative_key(viewer.viewer_data_path, request.analysis_result_dir),
                    path=viewer.viewer_data_path,
                    role="viewer-data",
                    content_type="application/json",
                    retention_class="viewer-cache",
                ),
                _artifact_for_path(
                    key=_relative_key(viewer.neighbor_data_path, request.analysis_result_dir),
                    path=viewer.neighbor_data_path,
                    role="viewer-neighbors",
                    content_type="application/json",
                    retention_class="viewer-cache",
                ),
            ]
        )


def _artifact_for_path(
    *,
    key: str,
    path: Path,
    role: str,
    content_type: str,
    retention_class: str,
    metadata: dict[str, object] | None = None,
) -> AnalysisStageArtifact:
    return AnalysisStageArtifact(
        key=key,
        role=role,
        content_type=content_type,
        retention_class=retention_class,
        byte_size=path.stat().st_size if path.is_file() else None,
        metadata=metadata or {},
    )


def _scope_items(resolved_scope) -> list[dict[str, object]]:
    items = resolved_scope.payload.get("items", [])
    if not isinstance(items, list):
        raise ValueError("Resolved Analysis Scope payload has invalid items.")
    return [item for item in items if isinstance(item, dict)]


def _input_derivative_key(*, item: dict[str, object], derivative: str) -> str:
    derivatives = item.get("derivatives", {})
    if not isinstance(derivatives, dict):
        raise ValueError("Analysis Scope item has invalid derivatives.")
    derivative_payload = derivatives.get(derivative, {})
    if not isinstance(derivative_payload, dict):
        raise ValueError(f"Analysis Scope item is missing {derivative}.")
    artifact_key = str(derivative_payload.get("artifact_key", "")).strip()
    if not artifact_key or Path(artifact_key).is_absolute() or ".." in Path(artifact_key).parts:
        raise ValueError(f"Analysis Scope item has an invalid {derivative} key.")
    return artifact_key


def _image_embedding_artifact_key(
    *,
    image_asset_id: int,
    recipe_id: str,
    recipe_fingerprint: str,
) -> str:
    return (
        f"image-embeddings/{recipe_id}/"
        f"image-asset-{image_asset_id}-{recipe_fingerprint[:12]}.npy"
    )


def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
    array = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(array, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return array / norms


def _friendly_embedding_error(error: Exception) -> str | None:
    message = str(error)
    lower_message = message.lower()
    if (
        "gated repo" in lower_message
        or "access to model" in lower_message
        or "401 client error" in lower_message
        or "please log in" in lower_message
    ):
        return (
            "Hugging Face access failed: DINOv3 is gated for this process. "
            "Run batch-cmd/login-huggingface.command, confirm model access, "
            "then restart Anacronia so the backend reads .hf-cache/token."
        )
    return None


def _atlas_levels_for_recipe(recipe) -> tuple[int, ...]:
    if recipe.stage_plan is None:
        return (32,)
    return tuple(
        int(level)
        for level in recipe.stage_plan.default_atlas_levels
        if int(level) > 0
    ) or (32,)


def _relative_key(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()
