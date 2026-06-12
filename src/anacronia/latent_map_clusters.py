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


def get_hdbscan_presets(preset_slug: str | None = None) -> tuple[HdbscanPreset, ...]:
    if preset_slug in {None, "all"}:
        return HDBSCAN_PRESETS

    for preset in HDBSCAN_PRESETS:
        if preset.slug == preset_slug:
            return (preset,)

    valid = ", ".join(["all", *(preset.slug for preset in HDBSCAN_PRESETS)])
    raise ValueError(f"Unknown HDBSCAN preset: {preset_slug}. Expected one of: {valid}")


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


def _append_cluster_report(
    *,
    run_dir: Path,
    recipe_name: str,
    cluster_id: str,
    label: str,
    cluster_count: int,
    unassigned_count: int,
    cluster_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## HDBSCAN Clusters",
            "",
            f"- Recipe: `{recipe_name}`",
            f"- Result: `{label}`",
            f"- Cluster result: `{cluster_id}`",
            f"- Groups: {cluster_count}",
            f"- Unassigned images: {unassigned_count}",
            f"- Cluster file: `{cluster_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
