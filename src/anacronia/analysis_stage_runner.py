from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

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
    atlas_tile_size: int = 32
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
        if request.stage_name == "clustering":
            return self._run_clustering(request)
        if request.stage_name == "baseline_atlas":
            return self._run_baseline_atlas(request)
        raise ValueError(f"Unsupported Analysis Job stage: {request.stage_name}")

    def _run_embedding(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        from anacronia.latent_map_embeddings import embed_latent_map_run

        summary = embed_latent_map_run(
            run_dir=request.analysis_result_dir,
            recipe_name=request.recipe.recipe_id,
            batch_size=self.batch_size,
            device=self.device,
            embedder=self.embedder,
        )
        return AnalysisStageResult(
            artifacts=[
                _artifact_for_path(
                    key=_relative_key(summary.embedding_path, request.analysis_result_dir),
                    path=summary.embedding_path,
                    role="embedding",
                    content_type="application/octet-stream",
                    retention_class="durable",
                ),
                _artifact_for_path(
                    key=_relative_key(summary.metadata_path, request.analysis_result_dir),
                    path=summary.metadata_path,
                    role="embedding-metadata",
                    content_type="application/json",
                    retention_class="durable",
                ),
            ]
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

        atlas_tile_sizes = request.recipe.thumbnail_atlas_tile_sizes or (
            self.atlas_tile_size,
        )
        atlases = [
            generate_latent_map_thumbnail_atlas(
                run_dir=request.analysis_result_dir,
                tile_size=tile_size,
                atlas_size=self.atlas_size,
            )
            for tile_size in atlas_tile_sizes
        ]
        viewer = export_viewer_data(
            run_dir=request.analysis_result_dir,
            recipe_name=request.recipe.recipe_id,
            thumbnail_atlas_manifest_path=atlases[0].manifest_path,
            thumbnail_atlas_manifest_paths=tuple(
                atlas.manifest_path for atlas in atlases
            ),
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
        atlas_manifest_artifacts = [
            _artifact_for_path(
                key=_relative_key(atlas.manifest_path, request.analysis_result_dir),
                path=atlas.manifest_path,
                role="thumbnail-atlas",
                content_type="application/json",
                retention_class="render-cache",
                metadata={"tile_size": atlas.tile_size},
            )
            for atlas in atlases
        ]
        return AnalysisStageResult(
            artifacts=[
                *atlas_manifest_artifacts,
                *page_artifacts,
                _artifact_for_path(
                    key=_relative_key(viewer.viewer_data_path, request.analysis_result_dir),
                    path=viewer.viewer_data_path,
                    role="viewer-data",
                    content_type="application/json",
                    retention_class="render-cache",
                ),
                _artifact_for_path(
                    key=_relative_key(viewer.neighbor_data_path, request.analysis_result_dir),
                    path=viewer.neighbor_data_path,
                    role="viewer-neighbors",
                    content_type="application/json",
                    retention_class="render-cache",
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


def _relative_key(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()
