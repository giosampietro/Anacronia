from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Mapping

from anacronia.analysis_result_pins import (
    validate_pinned_latent_map_row_order_if_present,
)


@dataclass(frozen=True)
class ViewerDataExportSummary:
    run_id: str
    recipe_name: str
    layout_id: str
    cluster_id: str
    point_count: int
    viewer_data_path: Path
    neighbor_data_path: Path
    map_payload_bytes: int
    neighbor_payload_bytes: int
    thumbnail_atlas_manifest_path: Path | None = None
    thumbnail_atlas_manifest_paths: dict[str, Path] | None = None


def export_viewer_data(
    *,
    run_dir: Path,
    recipe_name: str,
    layout_id: str | None = None,
    cluster_id: str | None = None,
    thumbnail_atlas_manifest_path: Path | None = None,
    thumbnail_atlas_manifest_paths: Mapping[int | str, Path] | None = None,
) -> ViewerDataExportSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    resolved_atlas_manifest_path = _resolve_optional_run_path(
        run_dir=resolved_run_dir,
        path=thumbnail_atlas_manifest_path,
    )
    resolved_atlas_manifest_paths = _resolve_atlas_manifest_paths(
        run_dir=resolved_run_dir,
        thumbnail_atlas_manifest_paths=thumbnail_atlas_manifest_paths,
    )
    if resolved_atlas_manifest_path is None:
        resolved_atlas_manifest_path = _default_atlas_manifest_path(
            resolved_atlas_manifest_paths
        )
    manifest_rows = _load_jsonl(resolved_run_dir / "manifest.jsonl")
    manifest_by_id = {str(row["image_id"]): row for row in manifest_rows}
    layout = _load_selected_json(
        directory=resolved_run_dir / "layouts",
        pattern=f"{recipe_name}_*.json",
        selected_id=layout_id,
        id_key="layout_id",
        kind="layout",
    )
    cluster = _load_selected_json(
        directory=resolved_run_dir / "clusters",
        pattern=f"{recipe_name}_*.json",
        selected_id=cluster_id,
        id_key="cluster_id",
        kind="cluster",
    )
    validate_pinned_latent_map_row_order_if_present(
        cluster=cluster,
        layout=layout,
        recipe_name=recipe_name,
        run_dir=resolved_run_dir,
    )
    neighbor_rows = _load_jsonl(
        resolved_run_dir / "indexes" / f"{recipe_name}_neighbors.jsonl"
    )
    cluster_by_id = {
        str(point["image_id"]): point for point in cluster.get("points", [])
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
        cluster_point = cluster_by_id[image_id]
        points.append(
            _build_viewer_point(
                cluster_point=cluster_point,
                image_id=image_id,
                layout_point=point,
                manifest=manifest,
            )
        )

    viewer_dir = resolved_run_dir / "viewer"
    viewer_dir.mkdir(parents=True, exist_ok=True)
    viewer_data_path = viewer_dir / "map-data.json"
    neighbor_data_path = viewer_dir / "neighbors.json"
    viewer_data = {
        "run_id": run_id,
        "recipe_name": recipe_name,
        "layout_id": str(layout.get("layout_id", "")),
        "cluster_id": str(cluster.get("cluster_id", "")),
        "cluster_result": _build_cluster_metadata(cluster),
        "available_layouts": _list_available_layouts(
            directory=resolved_run_dir / "layouts",
            recipe_name=recipe_name,
        ),
        "available_clusters": _list_available_clusters(
            directory=resolved_run_dir / "clusters",
            recipe_name=recipe_name,
        ),
        "point_count": len(points),
        "neighbor_index_path": neighbor_data_path.relative_to(
            resolved_run_dir
        ).as_posix(),
        "points": points,
    }
    neighbor_data = {
        "schema_version": 1,
        "asset_kind": "latent-map-neighbors",
        "run_id": run_id,
        "recipe_name": recipe_name,
        "neighbors_by_image_id": neighbors_by_id,
    }
    if resolved_atlas_manifest_path is not None:
        viewer_data["thumbnail_atlas_manifest_path"] = (
            resolved_atlas_manifest_path.relative_to(resolved_run_dir).as_posix()
        )
    if resolved_atlas_manifest_paths:
        viewer_data["thumbnail_atlas_manifest_paths"] = {
            tile_size: path.relative_to(resolved_run_dir).as_posix()
            for tile_size, path in sorted(
                resolved_atlas_manifest_paths.items(),
                key=lambda item: int(item[0]),
            )
        }
    neighbor_data_path.write_text(
        json.dumps(neighbor_data, indent=2) + "\n",
        encoding="utf-8",
    )
    viewer_data_path.write_text(
        json.dumps(viewer_data, indent=2) + "\n",
        encoding="utf-8",
    )
    map_payload_bytes = viewer_data_path.stat().st_size
    neighbor_payload_bytes = neighbor_data_path.stat().st_size
    _append_viewer_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        point_count=len(points),
        thumbnail_atlas_manifest_path=resolved_atlas_manifest_path,
        viewer_data_path=viewer_data_path,
        neighbor_data_path=neighbor_data_path,
        map_payload_bytes=map_payload_bytes,
        neighbor_payload_bytes=neighbor_payload_bytes,
    )

    return ViewerDataExportSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        layout_id=str(layout.get("layout_id", "")),
        cluster_id=str(cluster.get("cluster_id", "")),
        point_count=len(points),
        neighbor_data_path=neighbor_data_path,
        map_payload_bytes=map_payload_bytes,
        neighbor_payload_bytes=neighbor_payload_bytes,
        thumbnail_atlas_manifest_path=resolved_atlas_manifest_path,
        thumbnail_atlas_manifest_paths=resolved_atlas_manifest_paths or None,
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


def _resolve_atlas_manifest_paths(
    *,
    run_dir: Path,
    thumbnail_atlas_manifest_paths: Mapping[int | str, Path] | None,
) -> dict[str, Path]:
    resolved_paths: dict[str, Path] = {}
    for tile_size, manifest_path in (thumbnail_atlas_manifest_paths or {}).items():
        resolved_path = _resolve_optional_run_path(
            run_dir=run_dir,
            path=manifest_path,
        )
        if resolved_path is not None:
            resolved_paths[str(tile_size)] = resolved_path
    return resolved_paths


def _default_atlas_manifest_path(
    thumbnail_atlas_manifest_paths: Mapping[str, Path],
) -> Path | None:
    if "32" in thumbnail_atlas_manifest_paths:
        return thumbnail_atlas_manifest_paths["32"]
    if thumbnail_atlas_manifest_paths:
        return next(iter(thumbnail_atlas_manifest_paths.values()))
    return None


def _build_viewer_point(
    *,
    cluster_point: dict[str, object],
    image_id: str,
    layout_point: dict[str, object],
    manifest: dict[str, object],
) -> dict[str, object]:
    cluster_id = int(cluster_point["cluster_id"])
    group_key = str(cluster_point.get("group_key") or cluster_id)
    point = {
        "image_id": image_id,
        "x": float(layout_point["x"]),
        "y": float(layout_point["y"]),
        "cluster_id": cluster_id,
        "cluster_group_key": group_key,
        "thumbnail_path": str(manifest.get("thumbnail_path", "")),
        "preview_path": str(
            manifest.get("preview_path") or manifest.get("thumbnail_path", "")
        ),
        "relative_path": str(manifest.get("relative_path", "")),
        "width": manifest.get("width"),
        "height": manifest.get("height"),
    }
    membership = cluster_point.get("membership")

    if isinstance(membership, (int, float)):
        point["cluster_membership"] = float(membership)

    return point


def _build_cluster_metadata(cluster: dict[str, object]) -> dict[str, object]:
    metadata = {
        "cluster_id": str(cluster.get("cluster_id", "")),
        "cluster_count": cluster.get("cluster_count"),
        "method": str(cluster.get("method", "")),
        "random_state": cluster.get("random_state"),
    }

    for key in ("asset_kind", "label", "params", "schema_version", "unassigned_count"):
        if key in cluster:
            metadata[key] = cluster[key]

    if isinstance(cluster.get("groups"), list):
        metadata["groups"] = cluster["groups"]

    return metadata


def _load_selected_json(
    *,
    directory: Path,
    pattern: str,
    selected_id: str | None,
    id_key: str,
    kind: str,
) -> dict[str, object]:
    matches = sorted(directory.glob(pattern), key=lambda path: path.stat().st_mtime)
    if not matches:
        raise ValueError(f"No {kind} file found for pattern: {directory / pattern}")
    if selected_id is None:
        return json.loads(matches[-1].read_text(encoding="utf-8"))

    for path in matches:
        data = json.loads(path.read_text(encoding="utf-8"))
        if str(data.get(id_key, "")) == selected_id:
            return data

    raise ValueError(f"No {kind} file found with {id_key}: {selected_id}")


def _list_available_layouts(
    *,
    directory: Path,
    recipe_name: str,
) -> list[dict[str, object]]:
    layouts = []
    for path in sorted(directory.glob(f"{recipe_name}_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        layouts.append(
            {
                "layout_id": str(data.get("layout_id", "")),
                "method": str(data.get("method", "")),
                "params": data.get("params", {}),
            }
        )
    return sorted(layouts, key=lambda layout: str(layout["layout_id"]))


def _list_available_clusters(
    *,
    directory: Path,
    recipe_name: str,
) -> list[dict[str, object]]:
    clusters = []
    for path in sorted(directory.glob(f"{recipe_name}_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        clusters.append(
            {
                "cluster_id": str(data.get("cluster_id", "")),
                "cluster_count": data.get("cluster_count"),
                "method": str(data.get("method", "")),
                "random_state": data.get("random_state"),
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
                **(
                    {"groups": data["groups"]}
                    if isinstance(data.get("groups"), list)
                    else {}
                ),
            }
        )
    return sorted(
        clusters,
        key=lambda cluster: (
            _cluster_method_order(str(cluster["method"]).lower()),
            _graph_community_order(str(cluster.get("label", ""))),
            _hierarchy_order(str(cluster.get("label", ""))),
            _hdbscan_order(str(cluster.get("label", ""))),
            str(cluster["cluster_id"]),
        ),
    )


def _cluster_method_order(method: str) -> int:
    if method == "graph_communities":
        return 0
    if method == "hierarchy":
        return 1
    if method == "hdbscan":
        return 2
    if method == "kmeans":
        return 3

    return 4


def _graph_community_order(label: str) -> int:
    labels = {
        "Graph communities · Broad": 0,
        "Graph communities · Balanced": 1,
        "Graph communities · Detail": 2,
        "Graph communities · Fine": 3,
    }

    return labels.get(label, 99)


def _hierarchy_order(label: str) -> int:
    labels = {
        "Hierarchy · Broad": 0,
        "Hierarchy · Balanced": 1,
        "Hierarchy · Detail": 2,
        "Hierarchy · Fine": 3,
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


def _resolve_optional_run_path(
    *,
    run_dir: Path,
    path: Path | None,
) -> Path | None:
    if path is None:
        return None

    resolved_path = path.expanduser().resolve()
    if resolved_path != run_dir and not resolved_path.is_relative_to(run_dir):
        raise ValueError(f"Path is outside the latent-map run: {path}")
    if not resolved_path.is_file():
        raise ValueError(f"Required file not found: {path}")

    return resolved_path


def _append_viewer_report(
    *,
    run_dir: Path,
    recipe_name: str,
    point_count: int,
    thumbnail_atlas_manifest_path: Path | None,
    viewer_data_path: Path,
    neighbor_data_path: Path,
    map_payload_bytes: int,
    neighbor_payload_bytes: int,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    bytes_per_point = map_payload_bytes / max(point_count, 1)
    estimated_payload_rows = [
        (
            f"- Estimated initial map payload at {label} images: "
            f"{int(bytes_per_point * target):,} bytes"
        )
        for label, target in (("5k", 5_000), ("10k", 10_000), ("30k", 30_000))
    ]
    addition = "\n".join(
        [
            "",
            "## Viewer Data",
            "",
            f"- Recipe: `{recipe_name}`",
            f"- Points: {point_count}",
            f"- File: `{viewer_data_path}`",
            f"- Neighbor index: `{neighbor_data_path}`",
            f"- Initial map payload: {map_payload_bytes:,} bytes",
            f"- Neighbor payload: {neighbor_payload_bytes:,} bytes",
            *estimated_payload_rows,
            *(
                [
                    (
                        "- Thumbnail atlas manifest: "
                        f"`{thumbnail_atlas_manifest_path}`"
                    )
                ]
                if thumbnail_atlas_manifest_path is not None
                else []
            ),
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
