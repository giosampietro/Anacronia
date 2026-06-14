from __future__ import annotations

import json
from pathlib import Path


def validate_pinned_latent_map_row_order_if_present(
    *,
    cluster: dict[str, object],
    layout: dict[str, object],
    recipe_name: str,
    run_dir: Path,
) -> None:
    vector_id_map_key = _pinned_vector_id_map_key(
        recipe_name=recipe_name,
        run_dir=run_dir,
    )
    if not vector_id_map_key:
        return

    expected_image_ids = _load_image_id_order(run_dir / vector_id_map_key)
    _validate_point_order(
        artifact_label=f"layout {layout.get('layout_id', '')}",
        expected_image_ids=expected_image_ids,
        points=layout.get("points", []),
    )
    _validate_point_order(
        artifact_label=f"cluster {cluster.get('cluster_id', '')}",
        expected_image_ids=expected_image_ids,
        points=cluster.get("points", []),
    )


def _pinned_vector_id_map_key(*, recipe_name: str, run_dir: Path) -> str:
    manifest_path = run_dir / "analysis-result.json"
    if not manifest_path.is_file():
        return ""

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for recipe in manifest.get("recipes", []):
        if (
            not isinstance(recipe, dict)
            or str(recipe.get("recipe_name", "")) != recipe_name
        ):
            continue

        artifact_keys = recipe.get("artifact_keys", {})
        if isinstance(artifact_keys, dict):
            return str(artifact_keys.get("vector_id_map") or "")

    return ""


def _load_image_id_order(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return [_image_id_from_id_map_row(row) for row in payload]
    if isinstance(payload, dict):
        ids = payload.get("ids")
        if not isinstance(ids, list):
            ids = payload.get("image_ids")
        if isinstance(ids, list):
            return [_image_id_from_id_map_row(row) for row in ids]
    return []


def _image_id_from_id_map_row(row: object) -> str:
    if isinstance(row, dict):
        return str(row.get("image_id", ""))

    return str(row)


def _validate_point_order(
    *,
    artifact_label: str,
    expected_image_ids: list[str],
    points: object,
) -> None:
    if not isinstance(points, list):
        raise ValueError(
            f"Pinned Analysis Result row order mismatch for {artifact_label}."
        )

    point_image_ids = [
        str(point.get("image_id", ""))
        for point in points
        if isinstance(point, dict)
    ]
    if point_image_ids != expected_image_ids:
        raise ValueError(
            f"Pinned Analysis Result row order mismatch for {artifact_label}."
        )
