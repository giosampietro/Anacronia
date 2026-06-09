from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path


@dataclass(frozen=True)
class ViewerDataExportSummary:
    run_id: str
    recipe_name: str
    layout_id: str
    cluster_id: str
    point_count: int
    viewer_data_path: Path


def export_viewer_data(
    *,
    run_dir: Path,
    recipe_name: str,
) -> ViewerDataExportSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    manifest_rows = _load_jsonl(resolved_run_dir / "manifest.jsonl")
    manifest_by_id = {str(row["image_id"]): row for row in manifest_rows}
    layout = _load_single_json(
        directory=resolved_run_dir / "layouts",
        pattern=f"{recipe_name}_*.json",
        kind="layout",
    )
    cluster = _load_single_json(
        directory=resolved_run_dir / "clusters",
        pattern=f"{recipe_name}_*.json",
        kind="cluster",
    )
    neighbor_rows = _load_jsonl(
        resolved_run_dir / "indexes" / f"{recipe_name}_neighbors.jsonl"
    )
    cluster_by_id = {
        str(point["image_id"]): int(point["cluster_id"])
        for point in cluster.get("points", [])
    }
    neighbors_by_id = _group_neighbors(
        neighbor_rows=neighbor_rows,
        known_image_ids=set(manifest_by_id),
    )

    points = []
    for point in layout.get("points", []):
        image_id = str(point["image_id"])
        if image_id not in manifest_by_id:
            raise ValueError(f"Layout references unknown image ID: {image_id}")
        if image_id not in cluster_by_id:
            raise ValueError(f"Cluster output is missing image ID: {image_id}")
        manifest = manifest_by_id[image_id]
        points.append(
            {
                "image_id": image_id,
                "x": float(point["x"]),
                "y": float(point["y"]),
                "cluster_id": cluster_by_id[image_id],
                "thumbnail_path": str(manifest.get("thumbnail_path", "")),
                "source_path": str(manifest.get("source_path", "")),
                "relative_path": str(manifest.get("relative_path", "")),
                "width": manifest.get("width"),
                "height": manifest.get("height"),
                "neighbors": neighbors_by_id.get(image_id, []),
            }
        )

    viewer_dir = resolved_run_dir / "viewer"
    viewer_dir.mkdir(parents=True, exist_ok=True)
    viewer_data_path = viewer_dir / "map-data.json"
    viewer_data_path.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "recipe_name": recipe_name,
                "layout_id": str(layout.get("layout_id", "")),
                "cluster_id": str(cluster.get("cluster_id", "")),
                "point_count": len(points),
                "points": points,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    _append_viewer_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        point_count=len(points),
        viewer_data_path=viewer_data_path,
    )

    return ViewerDataExportSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        layout_id=str(layout.get("layout_id", "")),
        cluster_id=str(cluster.get("cluster_id", "")),
        point_count=len(points),
        viewer_data_path=viewer_data_path,
    )


def _group_neighbors(
    *,
    neighbor_rows: list[dict[str, object]],
    known_image_ids: set[str],
) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for row in neighbor_rows:
        image_id = str(row["image_id"])
        neighbor_image_id = str(row["neighbor_image_id"])
        if image_id not in known_image_ids:
            raise ValueError(f"Neighbor file references unknown image ID: {image_id}")
        if neighbor_image_id not in known_image_ids:
            raise ValueError(
                f"Neighbor file references unknown image ID: {neighbor_image_id}"
            )
        grouped.setdefault(image_id, []).append(
            {
                "rank": int(row["neighbor_rank"]),
                "image_id": neighbor_image_id,
                "score": float(row["score"]),
            }
        )
    for neighbors in grouped.values():
        neighbors.sort(key=lambda neighbor: int(neighbor["rank"]))
    return grouped


def _load_single_json(*, directory: Path, pattern: str, kind: str) -> dict[str, object]:
    matches = sorted(directory.glob(pattern), key=lambda path: path.stat().st_mtime)
    if not matches:
        raise ValueError(f"No {kind} file found for pattern: {directory / pattern}")
    return json.loads(matches[-1].read_text(encoding="utf-8"))


def _load_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.is_file():
        raise ValueError(f"Required JSONL file not found: {path}")
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _append_viewer_report(
    *,
    run_dir: Path,
    recipe_name: str,
    point_count: int,
    viewer_data_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## Viewer Data",
            "",
            f"- Recipe: `{recipe_name}`",
            f"- Points: {point_count}",
            f"- File: `{viewer_data_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
