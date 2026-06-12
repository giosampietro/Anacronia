from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path


HDBSCAN_DEFERRED_REASON = "No precomputed HDBSCAN cluster artifacts found."
GRAPH_COMMUNITIES_DEFERRED_REASON = (
    "No precomputed graph-community cluster artifacts found."
)


@dataclass(frozen=True)
class LatentMapMethodComparisonSummary:
    run_id: str
    comparison_path: Path
    embedding_count: int
    layout_count: int
    cluster_count: int
    hdbscan_status: str


def export_method_comparison(*, run_dir: Path) -> LatentMapMethodComparisonSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    embeddings = _list_embedding_metadata(resolved_run_dir / "embeddings")
    layouts = _list_layout_metadata(resolved_run_dir / "layouts")
    clusters = _list_cluster_metadata(resolved_run_dir / "clusters")
    hdbscan = _build_hdbscan_summary(clusters)
    graph_communities = _build_graph_communities_summary(clusters)
    comparison = {
        "schema_version": 1,
        "asset_kind": "latent-map-method-comparison",
        "run_id": run_id,
        "embeddings": embeddings,
        "layouts": layouts,
        "clusters": clusters,
        "graph_communities": graph_communities,
        "hdbscan": hdbscan,
    }
    comparison_dir = resolved_run_dir / "comparisons"
    comparison_dir.mkdir(parents=True, exist_ok=True)
    comparison_path = comparison_dir / "method-comparison.json"
    comparison_path.write_text(
        json.dumps(comparison, indent=2) + "\n",
        encoding="utf-8",
    )
    _append_comparison_report(
        run_dir=resolved_run_dir,
        comparison_path=comparison_path,
        embedding_count=len(embeddings),
        layout_count=len(layouts),
        cluster_count=len(clusters),
        graph_communities_status=str(graph_communities["status"]),
        hdbscan_status=str(hdbscan["status"]),
    )

    return LatentMapMethodComparisonSummary(
        run_id=run_id,
        comparison_path=comparison_path,
        embedding_count=len(embeddings),
        layout_count=len(layouts),
        cluster_count=len(clusters),
        hdbscan_status=str(hdbscan["status"]),
    )


def _list_embedding_metadata(directory: Path) -> list[dict[str, object]]:
    entries = []
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        recipe = data.get("recipe", {})
        recipe_name = str(data.get("recipe_name", path.stem))
        entries.append(
            {
                "recipe_name": recipe_name,
                "family": str(recipe.get("family", "")) or _infer_family(recipe_name),
                "model_id": str(recipe.get("model_id", data.get("model_id", ""))),
                "long_edge": recipe.get("long_edge"),
                "vector_count": data.get("vector_count"),
                "vector_dim": data.get("vector_dim"),
                "metadata_path": path.relative_to(directory.parent).as_posix(),
            }
        )
    return sorted(entries, key=lambda entry: str(entry["recipe_name"]))


def _infer_family(recipe_name: str) -> str:
    if recipe_name.startswith("dinov3_"):
        return "dinov3"
    return ""


def _list_layout_metadata(directory: Path) -> list[dict[str, object]]:
    entries = []
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        entries.append(
            {
                "recipe_name": str(data.get("recipe_name", "")),
                "layout_id": str(data.get("layout_id", "")),
                "method": str(data.get("method", "")),
                "params": data.get("params", {}),
                "point_count": len(data.get("points", [])),
                "path": path.relative_to(directory.parent).as_posix(),
            }
        )
    return sorted(
        entries,
        key=lambda entry: (str(entry["recipe_name"]), str(entry["layout_id"])),
    )


def _list_cluster_metadata(directory: Path) -> list[dict[str, object]]:
    entries = []
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        entries.append(
            {
                "cluster_id": str(data.get("cluster_id", "")),
                "cluster_count": data.get("cluster_count"),
                "method": str(data.get("method", "")),
                "recipe_name": str(data.get("recipe_name", "")),
                **(
                    {"label": str(data["label"])}
                    if isinstance(data.get("label"), str)
                    else {}
                ),
                **(
                    {"params": data["params"]}
                    if isinstance(data.get("params"), dict)
                    else {}
                ),
                **(
                    {"unassigned_count": data["unassigned_count"]}
                    if isinstance(data.get("unassigned_count"), int)
                    else {}
                ),
            }
        )
    return sorted(
        entries,
        key=lambda entry: (str(entry["recipe_name"]), str(entry["cluster_id"])),
    )


def _build_hdbscan_summary(
    clusters: list[dict[str, object]],
) -> dict[str, object]:
    presets = [
        cluster
        for cluster in clusters
        if str(cluster.get("method", "")).lower() == "hdbscan"
    ]

    if not presets:
        return {
            "status": "deferred",
            "reason": HDBSCAN_DEFERRED_REASON,
        }

    return {
        "status": "available",
        "preset_count": len(presets),
        "presets": [
            {
                "cluster_id": preset["cluster_id"],
                "label": preset.get("label", preset["cluster_id"]),
                "recipe_name": preset["recipe_name"],
                "cluster_count": preset.get("cluster_count"),
                "unassigned_count": preset.get("unassigned_count"),
                "params": preset.get("params", {}),
            }
            for preset in sorted(
                presets,
                key=lambda preset: (
                    str(preset["recipe_name"]),
                    _hdbscan_order(str(preset.get("label", ""))),
                    str(preset["cluster_id"]),
                ),
            )
        ],
    }


def _build_graph_communities_summary(
    clusters: list[dict[str, object]],
) -> dict[str, object]:
    presets = [
        cluster
        for cluster in clusters
        if str(cluster.get("method", "")).lower() == "graph_communities"
    ]

    if not presets:
        return {
            "status": "deferred",
            "reason": GRAPH_COMMUNITIES_DEFERRED_REASON,
        }

    return {
        "status": "available",
        "preset_count": len(presets),
        "presets": [
            {
                "cluster_id": preset["cluster_id"],
                "label": preset.get("label", preset["cluster_id"]),
                "recipe_name": preset["recipe_name"],
                "cluster_count": preset.get("cluster_count"),
                "unassigned_count": preset.get("unassigned_count"),
                "params": preset.get("params", {}),
            }
            for preset in sorted(
                presets,
                key=lambda preset: (
                    str(preset["recipe_name"]),
                    _graph_communities_order(str(preset.get("label", ""))),
                    str(preset["cluster_id"]),
                ),
            )
        ],
    }


def _graph_communities_order(label: str) -> int:
    labels = {
        "Graph communities · Broad": 0,
        "Graph communities · Balanced": 1,
        "Graph communities · Detail": 2,
        "Graph communities · Fine": 3,
    }

    return labels.get(label, 99)


def _hdbscan_order(label: str) -> int:
    labels = {
        "HDBSCAN · Fine": 0,
        "HDBSCAN · Detail": 1,
        "HDBSCAN · Balanced": 2,
        "HDBSCAN · Broad": 3,
    }

    return labels.get(label, 99)


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _append_comparison_report(
    *,
    run_dir: Path,
    comparison_path: Path,
    embedding_count: int,
    layout_count: int,
    cluster_count: int,
    graph_communities_status: str,
    hdbscan_status: str,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## Method Comparison",
            "",
            f"- Embedding outputs: {embedding_count}",
            f"- Layout outputs: {layout_count}",
            f"- Cluster outputs: {cluster_count}",
            f"- Graph communities: {graph_communities_status}",
            f"- HDBSCAN: {hdbscan_status}",
            f"- File: `{comparison_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
