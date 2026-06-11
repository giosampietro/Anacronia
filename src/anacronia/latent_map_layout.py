from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Protocol

import numpy as np

UMAP_INIT = "spectral"
UMAP_METRIC = "cosine"


@dataclass(frozen=True)
class LatentMapLayoutSummary:
    run_id: str
    recipe_name: str
    layout_id: str
    cluster_id: str
    point_count: int
    cluster_count: int
    layout_path: Path
    cluster_path: Path


class Reducer(Protocol):
    def fit_transform(self, vectors: np.ndarray) -> np.ndarray:
        ...


class Clusterer(Protocol):
    def fit_predict(self, vectors: np.ndarray) -> np.ndarray:
        ...


def build_latent_map_layout(
    *,
    run_dir: Path,
    recipe_name: str,
    n_neighbors: int = 15,
    min_dist: float = 0.05,
    cluster_count: int = 12,
    random_state: int = 42,
    reducer: Reducer | None = None,
    clusterer: Clusterer | None = None,
) -> LatentMapLayoutSummary:
    if n_neighbors < 2:
        raise ValueError("n_neighbors must be at least 2")
    if cluster_count < 1:
        raise ValueError("cluster_count must be at least 1")

    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    vectors = _load_vectors(resolved_run_dir=resolved_run_dir, recipe_name=recipe_name)
    if vectors.shape[0] < 2:
        raise ValueError("At least two vectors are required for a layout.")
    manifest_rows = _load_manifest_rows(resolved_run_dir)
    if vectors.shape[0] > len(manifest_rows):
        raise ValueError("Embedding vector count exceeds manifest image count.")
    mapped_rows = manifest_rows[: vectors.shape[0]]
    effective_neighbors = _effective_neighbors(
        requested_n_neighbors=n_neighbors,
        vector_count=vectors.shape[0],
    )
    effective_cluster_count = min(cluster_count, vectors.shape[0])

    resolved_reducer = reducer or _build_umap_reducer(
        n_neighbors=effective_neighbors,
        min_dist=min_dist,
        random_state=random_state,
    )
    coordinates = np.asarray(resolved_reducer.fit_transform(vectors), dtype=np.float32)
    if coordinates.shape != (vectors.shape[0], 2):
        raise ValueError("Reducer must return one 2D coordinate per vector.")
    resolved_clusterer = clusterer or _build_kmeans_clusterer(
        cluster_count=effective_cluster_count,
        random_state=random_state,
    )
    cluster_labels = np.asarray(resolved_clusterer.fit_predict(vectors))
    if cluster_labels.shape != (vectors.shape[0],):
        raise ValueError("Clusterer must return one cluster label per vector.")

    layout_id = (
        f"umap_n{effective_neighbors}_mindist{_float_slug(min_dist)}_seed{random_state}"
    )
    cluster_id = f"kmeans_k{effective_cluster_count}_seed{random_state}"
    layouts_dir = resolved_run_dir / "layouts"
    clusters_dir = resolved_run_dir / "clusters"
    layouts_dir.mkdir(parents=True, exist_ok=True)
    clusters_dir.mkdir(parents=True, exist_ok=True)
    layout_path = layouts_dir / f"{recipe_name}_{layout_id}.json"
    cluster_path = clusters_dir / f"{recipe_name}_{cluster_id}.json"

    layout_points = [
        {
            "image_id": str(row["image_id"]),
            "x": float(coordinates[index, 0]),
            "y": float(coordinates[index, 1]),
        }
        for index, row in enumerate(mapped_rows)
    ]
    cluster_points = [
        {
            "image_id": str(row["image_id"]),
            "cluster_id": int(cluster_labels[index]),
        }
        for index, row in enumerate(mapped_rows)
    ]
    layout_path.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "recipe_name": recipe_name,
                "layout_id": layout_id,
                "method": "umap",
                "params": {
                    "requested_n_neighbors": n_neighbors,
                    "effective_n_neighbors": effective_neighbors,
                    "min_dist": min_dist,
                    "metric": UMAP_METRIC,
                    "init": UMAP_INIT,
                    "random_state": random_state,
                },
                "points": layout_points,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    cluster_path.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "recipe_name": recipe_name,
                "cluster_id": cluster_id,
                "method": "kmeans",
                "cluster_count": effective_cluster_count,
                "random_state": random_state,
                "points": cluster_points,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    _append_layout_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        layout_id=layout_id,
        cluster_id=cluster_id,
        point_count=vectors.shape[0],
        cluster_count=effective_cluster_count,
        layout_path=layout_path,
        cluster_path=cluster_path,
    )

    return LatentMapLayoutSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        layout_id=layout_id,
        cluster_id=cluster_id,
        point_count=int(vectors.shape[0]),
        cluster_count=int(effective_cluster_count),
        layout_path=layout_path,
        cluster_path=cluster_path,
    )


def _build_umap_reducer(*, n_neighbors: int, min_dist: float, random_state: int):
    try:
        import umap
    except Exception as exc:  # pragma: no cover - covered by setup/manual checks
        raise RuntimeError(
            "UMAP dependency is missing. Run batch-cmd/setup-dinov3-local.command first."
        ) from exc

    return umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric=UMAP_METRIC,
        init=UMAP_INIT,
        random_state=random_state,
    )


def _build_kmeans_clusterer(
    *,
    cluster_count: int,
    random_state: int,
):
    try:
        from sklearn.cluster import KMeans
    except Exception as exc:  # pragma: no cover - covered by setup/manual checks
        raise RuntimeError(
            "scikit-learn dependency is missing. Run batch-cmd/setup-dinov3-local.command first."
        ) from exc

    return KMeans(
        n_clusters=cluster_count,
        random_state=random_state,
        n_init="auto",
    )


def _load_vectors(*, resolved_run_dir: Path, recipe_name: str) -> np.ndarray:
    embedding_path = resolved_run_dir / "embeddings" / f"{recipe_name}.npy"
    if not embedding_path.is_file():
        raise ValueError(f"Embedding file not found: {embedding_path}")
    vectors = np.load(embedding_path).astype(np.float32)
    if vectors.ndim != 2 or vectors.shape[0] == 0 or vectors.shape[1] == 0:
        raise ValueError("Embedding matrix must be non-empty and two-dimensional.")
    return vectors


def _load_manifest_rows(run_dir: Path) -> list[dict[str, object]]:
    manifest_path = run_dir / "manifest.jsonl"
    if not manifest_path.is_file():
        raise ValueError(f"Manifest not found: {manifest_path}")
    return [
        json.loads(line)
        for line in manifest_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _effective_neighbors(*, requested_n_neighbors: int, vector_count: int) -> int:
    if vector_count <= 2:
        return 2
    return min(requested_n_neighbors, vector_count - 1)


def _float_slug(value: float) -> str:
    return str(value).replace(".", "p")


def _append_layout_report(
    *,
    run_dir: Path,
    recipe_name: str,
    layout_id: str,
    cluster_id: str,
    point_count: int,
    cluster_count: int,
    layout_path: Path,
    cluster_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## Layout And Clusters",
            "",
            f"- Recipe: `{recipe_name}`",
            f"- Layout: `{layout_id}`",
            f"- Clusters: `{cluster_id}`",
            f"- Points: {point_count}",
            f"- Cluster count: {cluster_count}",
            f"- Layout file: `{layout_path}`",
            f"- Cluster file: `{cluster_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
