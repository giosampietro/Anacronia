from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from anacronia.analysis_result_pins import (
    validate_pinned_latent_map_row_order_if_present,
)


@dataclass(frozen=True)
class LatentMapResultExportSummary:
    run_id: str
    recipe_name: str
    layout_id: str
    cluster_id: str
    result_path: Path
    exact_duplicate_group_count: int
    faiss_candidate_count: int
    selected_image_count: int
    selected_cluster_count: int
    selected_neighbor_anchor_count: int


def export_latent_map_results(
    *,
    run_dir: Path,
    recipe_name: str,
    selected_image_ids: list[str] | None = None,
    selected_cluster_ids: list[int | str] | None = None,
    selected_neighbor_image_ids: list[str] | None = None,
    faiss_duplicate_threshold: float = 0.98,
) -> LatentMapResultExportSummary:
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
    validate_pinned_latent_map_row_order_if_present(
        cluster=cluster,
        layout=layout,
        recipe_name=recipe_name,
        run_dir=resolved_run_dir,
    )
    neighbor_rows = _load_required_neighbors(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
    )
    layout_id = str(layout.get("layout_id", ""))
    cluster_result_id = str(cluster.get("cluster_id", ""))
    exact_duplicates = _build_exact_duplicate_groups(manifest_rows)
    faiss_candidates = _build_faiss_duplicate_candidates(
        neighbor_rows=neighbor_rows,
        recipe_name=recipe_name,
        threshold=faiss_duplicate_threshold,
    )
    selections = _build_selections(
        cluster=cluster,
        cluster_result_id=cluster_result_id,
        layout=layout,
        layout_id=layout_id,
        manifest_by_id=manifest_by_id,
        neighbor_rows=neighbor_rows,
        recipe_name=recipe_name,
        selected_cluster_ids=selected_cluster_ids or [],
        selected_image_ids=selected_image_ids or [],
        selected_neighbor_image_ids=selected_neighbor_image_ids or [],
    )
    result = {
        "schema_version": 1,
        "asset_kind": "latent-map-result-export",
        "run_id": run_id,
        "recipe_name": recipe_name,
        "layout_id": layout_id,
        "cluster_id": cluster_result_id,
        "cluster_result": _build_cluster_metadata(cluster),
        "diagnostics": {
            "exact_duplicates": exact_duplicates,
            "perceptual_hash_duplicates": {
                "status": "deferred",
                "reason": "Dependency and runtime cost need separate evaluation.",
            },
            "faiss_duplicate_candidates": faiss_candidates,
        },
        "selections": selections,
    }
    exports_dir = resolved_run_dir / "viewer" / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    result_path = exports_dir / f"{recipe_name}_result-export.json"
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    _append_result_report(
        run_dir=resolved_run_dir,
        exact_duplicate_group_count=len(exact_duplicates),
        faiss_candidate_count=len(faiss_candidates),
        result_path=result_path,
    )

    return LatentMapResultExportSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        layout_id=layout_id,
        cluster_id=cluster_result_id,
        result_path=result_path,
        exact_duplicate_group_count=len(exact_duplicates),
        faiss_candidate_count=len(faiss_candidates),
        selected_image_count=len(selections["images"]),
        selected_cluster_count=len(selections["clusters"]),
        selected_neighbor_anchor_count=len(selections["neighbors"]),
    )


def _build_exact_duplicate_groups(
    manifest_rows: list[dict[str, object]],
) -> list[dict[str, object]]:
    by_hash: dict[str, list[dict[str, str]]] = {}

    for row in manifest_rows:
        sha256 = str(row.get("sha256", ""))
        if not sha256:
            continue
        by_hash.setdefault(sha256, []).append(_image_ref(row))

    return [
        {
            "sha256": sha256,
            "images": sorted(images, key=lambda image: image["image_id"]),
        }
        for sha256, images in sorted(by_hash.items())
        if len(images) > 1
    ]


def _build_faiss_duplicate_candidates(
    *,
    neighbor_rows: list[dict[str, object]],
    recipe_name: str,
    threshold: float,
) -> list[dict[str, object]]:
    candidates: list[dict[str, object]] = []
    seen_pairs: set[tuple[str, str]] = set()

    for row in neighbor_rows:
        score = float(row["score"])
        if score < threshold:
            continue
        image_id = str(row["image_id"])
        neighbor_image_id = str(row["neighbor_image_id"])
        pair = tuple(sorted((image_id, neighbor_image_id)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        candidates.append(
            {
                "image_id": image_id,
                "neighbor_image_id": neighbor_image_id,
                "neighbor_rank": int(row["neighbor_rank"]),
                "score": score,
                "provenance": {
                    "kind": "faiss-neighbor",
                    "recipe_name": recipe_name,
                    "threshold": threshold,
                },
            }
        )

    return sorted(
        candidates,
        key=lambda candidate: (
            str(candidate["image_id"]),
            str(candidate["neighbor_image_id"]),
        ),
    )


def _build_selections(
    *,
    cluster: dict[str, object],
    cluster_result_id: str,
    layout: dict[str, object],
    layout_id: str,
    manifest_by_id: dict[str, dict[str, object]],
    neighbor_rows: list[dict[str, object]],
    recipe_name: str,
    selected_cluster_ids: list[int | str],
    selected_image_ids: list[str],
    selected_neighbor_image_ids: list[str],
) -> dict[str, object]:
    cluster_points = [
        {
            "cluster_id": int(point["cluster_id"]),
            "group_key": str(point.get("group_key") or point["cluster_id"]),
            "image_id": str(point["image_id"]),
            **(
                {"membership": float(point["membership"])}
                if isinstance(point.get("membership"), (int, float))
                else {}
            ),
        }
        for point in cluster.get("points", [])
    ]
    neighbors_by_image_id = _group_neighbors(neighbor_rows)

    return {
        "images": [
            _image_ref(_required_manifest_row(manifest_by_id, image_id))
            for image_id in selected_image_ids
        ],
        "clusters": [
            _build_cluster_selection(
                cluster_points=cluster_points,
                cluster_result=cluster,
                cluster_result_id=cluster_result_id,
                selected_cluster_id=cluster_id,
            )
            for cluster_id in selected_cluster_ids
        ],
        "neighbors": [
            {
                "image_id": image_id,
                "neighbors": neighbors_by_image_id.get(image_id, []),
                "provenance": {
                    "kind": "faiss-neighbor-selection",
                    "recipe_name": recipe_name,
                },
            }
            for image_id in selected_neighbor_image_ids
        ],
        "layout": {
            "layout_id": layout_id,
            "point_count": len(layout.get("points", [])),
        },
    }


def _build_cluster_metadata(cluster: dict[str, object]) -> dict[str, object]:
    metadata = {
        "cluster_id": str(cluster.get("cluster_id", "")),
        "cluster_count": cluster.get("cluster_count"),
        "method": str(cluster.get("method", "")),
    }

    for key in (
        "asset_kind",
        "label",
        "params",
        "random_state",
        "schema_version",
        "unassigned_count",
    ):
        if key in cluster:
            metadata[key] = cluster[key]

    if isinstance(cluster.get("groups"), list):
        metadata["groups"] = cluster["groups"]

    return metadata


def _build_cluster_selection(
    *,
    cluster_points: list[dict[str, object]],
    cluster_result: dict[str, object],
    cluster_result_id: str,
    selected_cluster_id: int | str,
) -> dict[str, object]:
    selected_group_key = _selected_cluster_group_key(selected_cluster_id)
    matching_points = [
        point for point in cluster_points if point["group_key"] == selected_group_key
    ]
    selection = {
        "cluster_id": selected_cluster_id,
        "group_key": selected_group_key,
        "image_ids": sorted(str(point["image_id"]) for point in matching_points),
        "provenance": {
            "cluster_id": cluster_result_id,
            "kind": "cluster-selection",
            "method": str(cluster_result.get("method", "")),
        },
    }

    group_label = _cluster_group_label(
        cluster_result=cluster_result,
        group_key=selected_group_key,
    )
    if group_label:
        selection["label"] = group_label
    elif selected_group_key == "unassigned":
        selection["label"] = "Unassigned"
    elif str(cluster_result.get("method", "")).lower() == "hdbscan":
        selection["label"] = f"Group {str(selected_cluster_id).removeprefix('cluster:')}"

    if any("membership" in point for point in matching_points):
        selection["assignments"] = [
            {
                "image_id": str(point["image_id"]),
                **(
                    {"membership": float(point["membership"])}
                    if "membership" in point
                    else {}
                ),
            }
            for point in sorted(
                matching_points,
                key=lambda point: str(point["image_id"]),
            )
        ]

    return selection


def _cluster_group_label(
    *,
    cluster_result: dict[str, object],
    group_key: str,
) -> str | None:
    groups = cluster_result.get("groups")
    if not isinstance(groups, list):
        return None

    for group in groups:
        if not isinstance(group, dict):
            continue
        if str(group.get("group_key", "")) == group_key and isinstance(
            group.get("label"),
            str,
        ):
            return str(group["label"])

    return None


def _selected_cluster_group_key(cluster_id: int | str) -> str:
    if cluster_id == "unassigned":
        return "unassigned"
    if isinstance(cluster_id, str) and cluster_id.startswith("cluster:"):
        return cluster_id

    return str(cluster_id)


def _group_neighbors(
    neighbor_rows: list[dict[str, object]],
) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for row in neighbor_rows:
        grouped.setdefault(str(row["image_id"]), []).append(
            {
                "rank": int(row["neighbor_rank"]),
                "image_id": str(row["neighbor_image_id"]),
                "score": float(row["score"]),
            }
        )
    for neighbors in grouped.values():
        neighbors.sort(key=lambda neighbor: int(neighbor["rank"]))
    return grouped


def _required_manifest_row(
    manifest_by_id: dict[str, dict[str, object]],
    image_id: str,
) -> dict[str, object]:
    if image_id not in manifest_by_id:
        raise ValueError(f"Selected image ID is not in manifest: {image_id}")
    return manifest_by_id[image_id]


def _image_ref(row: dict[str, object]) -> dict[str, str]:
    return {
        "image_id": str(row["image_id"]),
        "relative_path": str(row.get("relative_path", "")),
    }


def _load_required_neighbors(*, run_dir: Path, recipe_name: str) -> list[dict[str, object]]:
    neighbors_path = run_dir / "indexes" / f"{recipe_name}_neighbors.jsonl"
    if not neighbors_path.is_file():
        raise ValueError(f"FAISS neighbor file not found: {neighbors_path}")
    return _load_jsonl(neighbors_path)


def _load_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.is_file():
        raise ValueError(f"Required JSONL file not found: {path}")
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _load_single_json(*, directory: Path, pattern: str, kind: str) -> dict[str, object]:
    matches = sorted(directory.glob(pattern), key=lambda path: path.stat().st_mtime)
    if not matches:
        raise ValueError(f"No {kind} file found for pattern: {directory / pattern}")
    return json.loads(matches[-1].read_text(encoding="utf-8"))


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _append_result_report(
    *,
    run_dir: Path,
    exact_duplicate_group_count: int,
    faiss_candidate_count: int,
    result_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## Duplicate Diagnostics",
            "",
            f"- Exact duplicate groups: {exact_duplicate_group_count}",
            f"- FAISS duplicate candidates: {faiss_candidate_count}",
            f"- Result export: `{result_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
