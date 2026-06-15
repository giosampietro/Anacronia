from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Protocol

import numpy as np


HDBSCAN_METRIC = "euclidean"
HDBSCAN_VECTOR_NORMALIZATION = "l2"
HDBSCAN_UNASSIGNED_CLUSTER_ID = -1
HDBSCAN_UNASSIGNED_GROUP_KEY = "unassigned"
GRAPH_COMMUNITY_METHOD = "graph_communities"
GRAPH_COMMUNITY_ALGORITHM = "weighted_label_propagation"
GRAPH_COMMUNITY_NEIGHBOR_SOURCE = "faiss"
HIERARCHY_METHOD = "hierarchy"
HIERARCHY_ALGORITHM = "agglomerative"
HIERARCHY_LINKAGE = "average"
HIERARCHY_METRIC = "cosine"
HIERARCHY_VECTOR_NORMALIZATION = "l2"


@dataclass(frozen=True)
class HdbscanPreset:
    slug: str
    label: str
    min_cluster_size: int
    min_samples: int
    cluster_selection_method: str

    @property
    def cluster_id(self) -> str:
        return (
            f"hdbscan_{self.slug}_mcs{self.min_cluster_size}"
            f"_ms{self.min_samples}_{self.cluster_selection_method}"
        )


HDBSCAN_PRESETS = (
    HdbscanPreset(
        slug="fine",
        label="HDBSCAN · Fine",
        min_cluster_size=10,
        min_samples=5,
        cluster_selection_method="eom",
    ),
    HdbscanPreset(
        slug="detail",
        label="HDBSCAN · Detail",
        min_cluster_size=15,
        min_samples=5,
        cluster_selection_method="leaf",
    ),
    HdbscanPreset(
        slug="balanced",
        label="HDBSCAN · Balanced",
        min_cluster_size=25,
        min_samples=10,
        cluster_selection_method="eom",
    ),
    HdbscanPreset(
        slug="broad",
        label="HDBSCAN · Broad",
        min_cluster_size=50,
        min_samples=15,
        cluster_selection_method="eom",
    ),
)


@dataclass(frozen=True)
class GraphCommunityPreset:
    slug: str
    label: str
    k: int
    min_score: float
    min_group_size: int
    resolution: float
    max_iterations: int = 30

    @property
    def cluster_id(self) -> str:
        return (
            f"graph_communities_{self.slug}_k{self.k}"
            f"_res{_format_score_for_id(self.resolution)}"
            f"_min{self.min_group_size}"
        )


GRAPH_COMMUNITY_PRESETS = (
    GraphCommunityPreset(
        slug="broad",
        label="Graph communities · Broad",
        k=12,
        min_score=0.0,
        min_group_size=2,
        resolution=0.70,
    ),
    GraphCommunityPreset(
        slug="balanced",
        label="Graph communities · Balanced",
        k=8,
        min_score=0.0,
        min_group_size=2,
        resolution=0.60,
    ),
    GraphCommunityPreset(
        slug="detail",
        label="Graph communities · Detail",
        k=6,
        min_score=0.0,
        min_group_size=2,
        resolution=0.65,
    ),
    GraphCommunityPreset(
        slug="fine",
        label="Graph communities · Fine",
        k=3,
        min_score=0.0,
        min_group_size=2,
        resolution=0.70,
    ),
)


@dataclass(frozen=True)
class HierarchyPreset:
    slug: str
    label: str
    target_cluster_count: int
    granularity_rank: int

    @property
    def cluster_id(self) -> str:
        return (
            f"hierarchy_{self.slug}_k{self.target_cluster_count}"
            f"_{HIERARCHY_LINKAGE}_{HIERARCHY_METRIC}_{HIERARCHY_VECTOR_NORMALIZATION}"
        )


HIERARCHY_PRESETS = (
    HierarchyPreset(
        slug="broad",
        label="Hierarchy · Broad",
        target_cluster_count=24,
        granularity_rank=0,
    ),
    HierarchyPreset(
        slug="balanced",
        label="Hierarchy · Balanced",
        target_cluster_count=48,
        granularity_rank=1,
    ),
    HierarchyPreset(
        slug="detail",
        label="Hierarchy · Detail",
        target_cluster_count=96,
        granularity_rank=2,
    ),
    HierarchyPreset(
        slug="fine",
        label="Hierarchy · Fine",
        target_cluster_count=192,
        granularity_rank=3,
    ),
)


def _format_score_for_id(score: float) -> str:
    return f"{score:g}".replace(".", "p")


@dataclass(frozen=True)
class LatentMapClusterSummary:
    run_id: str
    recipe_name: str
    cluster_id: str
    label: str
    method: str
    cluster_count: int
    unassigned_count: int
    cluster_path: Path


class Clusterer(Protocol):
    def fit_predict(self, vectors: np.ndarray) -> np.ndarray:
        ...


def build_hdbscan_cluster_result(
    *,
    run_dir: Path,
    recipe_name: str,
    preset: HdbscanPreset,
    clusterer: Clusterer | None = None,
) -> LatentMapClusterSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    vectors = _normalize_vectors(
        _load_vectors(resolved_run_dir=resolved_run_dir, recipe_name=recipe_name)
    )
    manifest_rows = _load_manifest_rows(resolved_run_dir)

    if vectors.shape[0] > len(manifest_rows):
        raise ValueError("Embedding vector count exceeds manifest image count.")

    mapped_rows = manifest_rows[: vectors.shape[0]]
    resolved_clusterer = clusterer or _build_hdbscan_clusterer(preset)
    labels = np.asarray(resolved_clusterer.fit_predict(vectors))

    if labels.shape != (vectors.shape[0],):
        raise ValueError("Clusterer must return one cluster label per vector.")

    memberships = _extract_membership_strengths(
        clusterer=resolved_clusterer,
        vector_count=vectors.shape[0],
    )
    cluster_labels = sorted(
        {
            int(label)
            for label in labels.tolist()
            if int(label) != HDBSCAN_UNASSIGNED_CLUSTER_ID
        }
    )
    unassigned_count = sum(
        1 for label in labels.tolist() if int(label) == HDBSCAN_UNASSIGNED_CLUSTER_ID
    )
    points = [
        _build_cluster_point(
            image_id=str(row["image_id"]),
            label=int(labels[index]),
            membership=memberships[index],
        )
        for index, row in enumerate(mapped_rows)
    ]
    clusters_dir = resolved_run_dir / "clusters"
    clusters_dir.mkdir(parents=True, exist_ok=True)
    cluster_path = clusters_dir / f"{recipe_name}_{preset.cluster_id}.json"
    payload = {
        "schema_version": 1,
        "asset_kind": "latent-map-cluster-result",
        "run_id": run_id,
        "recipe_name": recipe_name,
        "cluster_id": preset.cluster_id,
        "label": preset.label,
        "method": "hdbscan",
        "cluster_count": len(cluster_labels),
        "unassigned_count": unassigned_count,
        "params": {
            "preset": preset.slug,
            "min_cluster_size": preset.min_cluster_size,
            "min_samples": preset.min_samples,
            "cluster_selection_method": preset.cluster_selection_method,
            "metric": HDBSCAN_METRIC,
            "vector_normalization": HDBSCAN_VECTOR_NORMALIZATION,
        },
        "groups": _build_group_summaries(points),
        "points": points,
    }

    cluster_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    _append_cluster_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        cluster_id=preset.cluster_id,
        label=preset.label,
        cluster_count=len(cluster_labels),
        unassigned_count=unassigned_count,
        cluster_path=cluster_path,
    )

    return LatentMapClusterSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        cluster_id=preset.cluster_id,
        label=preset.label,
        method="hdbscan",
        cluster_count=len(cluster_labels),
        unassigned_count=unassigned_count,
        cluster_path=cluster_path,
    )


def build_hdbscan_cluster_results(
    *,
    run_dir: Path,
    recipe_name: str,
    preset_slug: str | None = None,
) -> list[LatentMapClusterSummary]:
    presets = get_hdbscan_presets(preset_slug)

    return [
        build_hdbscan_cluster_result(
            run_dir=run_dir,
            recipe_name=recipe_name,
            preset=preset,
        )
        for preset in presets
    ]


def build_graph_community_cluster_result(
    *,
    run_dir: Path,
    recipe_name: str,
    preset: GraphCommunityPreset,
) -> LatentMapClusterSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    manifest_rows = _load_manifest_rows(resolved_run_dir)
    image_ids = [str(row["image_id"]) for row in manifest_rows]
    neighbor_rows = _load_faiss_neighbor_rows(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
    )
    labels = _cluster_faiss_neighbor_graph(
        image_ids=image_ids,
        neighbor_rows=neighbor_rows,
        preset=preset,
    )
    cluster_labels = sorted(
        {
            label
            for label in labels.values()
            if label != HDBSCAN_UNASSIGNED_CLUSTER_ID
        }
    )
    unassigned_count = sum(
        1 for label in labels.values() if label == HDBSCAN_UNASSIGNED_CLUSTER_ID
    )
    points = [
        _build_cluster_point(
            image_id=image_id,
            label=labels[image_id],
            membership=None,
        )
        for image_id in image_ids
    ]
    clusters_dir = resolved_run_dir / "clusters"
    clusters_dir.mkdir(parents=True, exist_ok=True)
    cluster_path = clusters_dir / f"{recipe_name}_{preset.cluster_id}.json"
    payload = {
        "schema_version": 1,
        "asset_kind": "latent-map-cluster-result",
        "run_id": run_id,
        "recipe_name": recipe_name,
        "cluster_id": preset.cluster_id,
        "label": preset.label,
        "method": GRAPH_COMMUNITY_METHOD,
        "cluster_count": len(cluster_labels),
        "unassigned_count": unassigned_count,
        "params": {
            "preset": preset.slug,
            "k": preset.k,
            "min_score": preset.min_score,
            "min_group_size": preset.min_group_size,
            "resolution": preset.resolution,
            "max_iterations": preset.max_iterations,
            "neighbor_source": GRAPH_COMMUNITY_NEIGHBOR_SOURCE,
            "algorithm": GRAPH_COMMUNITY_ALGORITHM,
        },
        "groups": _build_group_summaries(points),
        "points": points,
    }

    cluster_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    _append_cluster_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        cluster_id=preset.cluster_id,
        label=preset.label,
        cluster_count=len(cluster_labels),
        unassigned_count=unassigned_count,
        cluster_path=cluster_path,
        heading="Graph Community Clusters",
    )

    return LatentMapClusterSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        cluster_id=preset.cluster_id,
        label=preset.label,
        method=GRAPH_COMMUNITY_METHOD,
        cluster_count=len(cluster_labels),
        unassigned_count=unassigned_count,
        cluster_path=cluster_path,
    )


def build_graph_community_cluster_results(
    *,
    run_dir: Path,
    recipe_name: str,
    preset_slug: str | None = None,
) -> list[LatentMapClusterSummary]:
    presets = get_graph_community_presets(preset_slug)

    return [
        build_graph_community_cluster_result(
            run_dir=run_dir,
            recipe_name=recipe_name,
            preset=preset,
        )
        for preset in presets
    ]


def build_hierarchy_cluster_result(
    *,
    run_dir: Path,
    recipe_name: str,
    preset: HierarchyPreset,
    clusterer: Clusterer | None = None,
) -> LatentMapClusterSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    vectors = _normalize_vectors(
        _load_vectors(resolved_run_dir=resolved_run_dir, recipe_name=recipe_name)
    )
    manifest_rows = _load_manifest_rows(resolved_run_dir)

    if vectors.shape[0] > len(manifest_rows):
        raise ValueError("Embedding vector count exceeds manifest image count.")

    mapped_rows = manifest_rows[: vectors.shape[0]]
    effective_cluster_count = min(preset.target_cluster_count, vectors.shape[0])
    resolved_clusterer = clusterer or _build_hierarchy_clusterer(
        cluster_count=effective_cluster_count,
    )
    raw_labels = np.asarray(resolved_clusterer.fit_predict(vectors))

    if raw_labels.shape != (vectors.shape[0],):
        raise ValueError("Clusterer must return one cluster label per vector.")

    labels = _remap_labels_by_group_size(raw_labels)
    cluster_labels = sorted({int(label) for label in labels.tolist()})
    points = [
        _build_cluster_point(
            image_id=str(row["image_id"]),
            label=int(labels[index]),
            membership=None,
        )
        for index, row in enumerate(mapped_rows)
    ]
    clusters_dir = resolved_run_dir / "clusters"
    clusters_dir.mkdir(parents=True, exist_ok=True)
    cluster_path = clusters_dir / f"{recipe_name}_{preset.cluster_id}.json"
    payload = {
        "schema_version": 1,
        "asset_kind": "latent-map-cluster-result",
        "run_id": run_id,
        "recipe_name": recipe_name,
        "cluster_id": preset.cluster_id,
        "label": preset.label,
        "method": HIERARCHY_METHOD,
        "cluster_count": len(cluster_labels),
        "unassigned_count": 0,
        "params": {
            "preset": preset.slug,
            "granularity_rank": preset.granularity_rank,
            "target_cluster_count": preset.target_cluster_count,
            "effective_cluster_count": effective_cluster_count,
            "algorithm": HIERARCHY_ALGORITHM,
            "linkage": HIERARCHY_LINKAGE,
            "metric": HIERARCHY_METRIC,
            "vector_normalization": HIERARCHY_VECTOR_NORMALIZATION,
        },
        "groups": _build_group_summaries(points),
        "points": points,
    }

    cluster_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    _append_cluster_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        cluster_id=preset.cluster_id,
        label=preset.label,
        cluster_count=len(cluster_labels),
        unassigned_count=0,
        cluster_path=cluster_path,
        heading="Hierarchy Clusters",
    )

    return LatentMapClusterSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        cluster_id=preset.cluster_id,
        label=preset.label,
        method=HIERARCHY_METHOD,
        cluster_count=len(cluster_labels),
        unassigned_count=0,
        cluster_path=cluster_path,
    )


def build_hierarchy_cluster_results(
    *,
    run_dir: Path,
    recipe_name: str,
    preset_slug: str | None = None,
) -> list[LatentMapClusterSummary]:
    presets = get_hierarchy_presets(preset_slug)

    return [
        build_hierarchy_cluster_result(
            run_dir=run_dir,
            recipe_name=recipe_name,
            preset=preset,
        )
        for preset in presets
    ]


def get_hdbscan_presets(preset_slug: str | None = None) -> tuple[HdbscanPreset, ...]:
    if preset_slug in {None, "all"}:
        return HDBSCAN_PRESETS

    for preset in HDBSCAN_PRESETS:
        if preset.slug == preset_slug:
            return (preset,)

    valid = ", ".join(["all", *(preset.slug for preset in HDBSCAN_PRESETS)])
    raise ValueError(f"Unknown HDBSCAN preset: {preset_slug}. Expected one of: {valid}")


def get_graph_community_presets(
    preset_slug: str | None = None,
) -> tuple[GraphCommunityPreset, ...]:
    if preset_slug in {None, "all"}:
        return GRAPH_COMMUNITY_PRESETS

    for preset in GRAPH_COMMUNITY_PRESETS:
        if preset.slug == preset_slug:
            return (preset,)

    valid = ", ".join(["all", *(preset.slug for preset in GRAPH_COMMUNITY_PRESETS)])
    raise ValueError(
        f"Unknown graph-community preset: {preset_slug}. Expected one of: {valid}"
    )


def get_hierarchy_presets(
    preset_slug: str | None = None,
) -> tuple[HierarchyPreset, ...]:
    if preset_slug in {None, "all"}:
        return HIERARCHY_PRESETS

    for preset in HIERARCHY_PRESETS:
        if preset.slug == preset_slug:
            return (preset,)

    valid = ", ".join(["all", *(preset.slug for preset in HIERARCHY_PRESETS)])
    raise ValueError(f"Unknown hierarchy preset: {preset_slug}. Expected one of: {valid}")


def _build_cluster_point(
    *,
    image_id: str,
    label: int,
    membership: float | None,
) -> dict[str, object]:
    group_key = (
        HDBSCAN_UNASSIGNED_GROUP_KEY
        if label == HDBSCAN_UNASSIGNED_CLUSTER_ID
        else f"cluster:{label}"
    )
    point: dict[str, object] = {
        "image_id": image_id,
        "cluster_id": label,
        "group_key": group_key,
    }

    if membership is not None:
        point["membership"] = membership

    return point


def _build_group_summaries(
    points: list[dict[str, object]],
) -> list[dict[str, object]]:
    summaries: dict[str, dict[str, object]] = {}

    for point in points:
        cluster_id = int(point["cluster_id"])
        group_key = str(point["group_key"])
        if group_key not in summaries:
            summaries[group_key] = {
                "group_key": group_key,
                "cluster_id": cluster_id,
                "label": (
                    "Unassigned"
                    if group_key == HDBSCAN_UNASSIGNED_GROUP_KEY
                    else f"Group {cluster_id}"
                ),
                "count": 0,
                "kind": (
                    "unassigned"
                    if group_key == HDBSCAN_UNASSIGNED_GROUP_KEY
                    else "cluster"
                ),
            }
        summaries[group_key]["count"] = int(summaries[group_key]["count"]) + 1

    return sorted(
        summaries.values(),
        key=lambda summary: (
            0 if summary["kind"] == "unassigned" else 1,
            -int(summary["count"]),
            str(summary["group_key"]),
        ),
    )


def _extract_membership_strengths(
    *,
    clusterer: Clusterer,
    vector_count: int,
) -> list[float | None]:
    probabilities = getattr(clusterer, "probabilities_", None)

    if probabilities is None:
        return [None] * vector_count

    values = np.asarray(probabilities, dtype=np.float32)
    if values.shape != (vector_count,):
        return [None] * vector_count

    return [float(value) for value in values.tolist()]


def _normalize_vectors(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    safe_norms = np.where(norms > 0, norms, 1)

    return (vectors / safe_norms).astype(np.float32)


def _cluster_faiss_neighbor_graph(
    *,
    image_ids: list[str],
    neighbor_rows: list[dict[str, object]],
    preset: GraphCommunityPreset,
) -> dict[str, int]:
    known_image_ids = set(image_ids)
    adjacency = _build_weighted_adjacency(
        known_image_ids=known_image_ids,
        neighbor_rows=neighbor_rows,
        preset=preset,
    )
    image_order = {image_id: index for index, image_id in enumerate(image_ids)}
    labels = {image_id: image_id for image_id in image_ids}

    for _ in range(preset.max_iterations):
        changed = False
        for image_id in image_ids:
            label_scores: dict[str, float] = {
                labels[image_id]: preset.resolution,
            }
            for neighbor_id, weight in adjacency.get(image_id, {}).items():
                neighbor_label = labels[neighbor_id]
                label_scores[neighbor_label] = (
                    label_scores.get(neighbor_label, 0.0) + weight
                )
            best_label = max(
                label_scores,
                key=lambda label: (label_scores[label], -image_order[label]),
            )
            if best_label != labels[image_id]:
                labels[image_id] = best_label
                changed = True
        if not changed:
            break

    grouped: dict[str, list[str]] = {}
    for image_id, label in labels.items():
        grouped.setdefault(label, []).append(image_id)

    communities = [
        sorted(members, key=image_order.get)
        for members in grouped.values()
        if len(members) >= preset.min_group_size
    ]
    communities.sort(key=lambda members: (-len(members), image_order[members[0]]))

    labels = {image_id: HDBSCAN_UNASSIGNED_CLUSTER_ID for image_id in image_ids}
    for cluster_id, community in enumerate(communities):
        for image_id in community:
            labels[image_id] = cluster_id

    return labels


def _remap_labels_by_group_size(labels: np.ndarray) -> np.ndarray:
    grouped: dict[int, list[int]] = {}
    for index, label in enumerate(labels.tolist()):
        grouped.setdefault(int(label), []).append(index)

    ordered_labels = sorted(
        grouped,
        key=lambda label: (-len(grouped[label]), grouped[label][0], label),
    )
    label_map = {label: index for index, label in enumerate(ordered_labels)}

    return np.asarray([label_map[int(label)] for label in labels.tolist()])


def _build_weighted_adjacency(
    *,
    known_image_ids: set[str],
    neighbor_rows: list[dict[str, object]],
    preset: GraphCommunityPreset,
) -> dict[str, dict[str, float]]:
    ranked_by_anchor: dict[str, list[dict[str, object]]] = {}
    for row in neighbor_rows:
        image_id = str(row["image_id"])
        neighbor_image_id = str(row["neighbor_image_id"])
        if image_id not in known_image_ids:
            raise ValueError(f"FAISS neighbor file references unknown image ID: {image_id}")
        if neighbor_image_id not in known_image_ids:
            raise ValueError(
                f"FAISS neighbor file references unknown image ID: {neighbor_image_id}"
            )
        ranked_by_anchor.setdefault(image_id, []).append(row)

    adjacency: dict[str, dict[str, float]] = {
        image_id: {} for image_id in known_image_ids
    }
    for image_id, rows in ranked_by_anchor.items():
        rows.sort(key=lambda row: int(row["neighbor_rank"]))
        for row in rows[: preset.k]:
            if float(row["score"]) < preset.min_score:
                continue
            neighbor_image_id = str(row["neighbor_image_id"])
            if image_id == neighbor_image_id:
                continue
            weight = max((float(row["score"]) + 1.0) / 2.0, 0.0)
            adjacency[image_id][neighbor_image_id] = max(
                adjacency[image_id].get(neighbor_image_id, 0.0),
                weight,
            )
            adjacency[neighbor_image_id][image_id] = max(
                adjacency[neighbor_image_id].get(image_id, 0.0),
                weight,
            )

    return adjacency


def _build_hdbscan_clusterer(preset: HdbscanPreset):
    try:
        from sklearn.cluster import HDBSCAN
    except Exception as exc:  # pragma: no cover - covered by setup/manual checks
        raise RuntimeError(
            "scikit-learn HDBSCAN is missing. Run batch-cmd/setup-dinov3-local.command first."
        ) from exc

    return HDBSCAN(
        min_cluster_size=preset.min_cluster_size,
        min_samples=preset.min_samples,
        cluster_selection_method=preset.cluster_selection_method,
        copy=True,
        metric=HDBSCAN_METRIC,
    )


def _build_hierarchy_clusterer(*, cluster_count: int):
    try:
        from sklearn.cluster import AgglomerativeClustering
    except Exception as exc:  # pragma: no cover - covered by setup/manual checks
        raise RuntimeError(
            "scikit-learn AgglomerativeClustering is missing. Run batch-cmd/setup-dinov3-local.command first."
        ) from exc

    return AgglomerativeClustering(
        n_clusters=cluster_count,
        metric=HIERARCHY_METRIC,
        linkage=HIERARCHY_LINKAGE,
        compute_full_tree=True,
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


def _load_faiss_neighbor_rows(
    *,
    run_dir: Path,
    recipe_name: str,
) -> list[dict[str, object]]:
    neighbors_path = run_dir / "indexes" / f"{recipe_name}_neighbors.jsonl"
    if not neighbors_path.is_file():
        raise ValueError(f"FAISS neighbor file not found: {neighbors_path}")
    return [
        json.loads(line)
        for line in neighbors_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _append_cluster_report(
    *,
    run_dir: Path,
    recipe_name: str,
    cluster_id: str,
    label: str,
    cluster_count: int,
    unassigned_count: int,
    cluster_path: Path,
    heading: str = "HDBSCAN Clusters",
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            f"## {heading}",
            "",
            f"- Recipe: `{recipe_name}`",
            f"- Result: `{label}`",
            f"- Cluster result: `{cluster_id}`",
            f"- Groups: {cluster_count}",
            f"- Unassigned images: {unassigned_count}",
            f"- Cluster file: `{_relative_key(cluster_path, run_dir)}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")


def _relative_key(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()
