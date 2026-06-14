from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from anacronia.analysis_scopes import resolve_analysis_scope


ANALYSIS_RESULT_MANIFEST_NAME = "analysis-result.json"


@dataclass(frozen=True)
class AnalysisResultUpdateDefaults:
    collection_slugs: list[str]
    recipe_ids: list[str]


@dataclass(frozen=True)
class AnalysisResultSourceChangeSummary:
    active_image_ids: list[str]
    added_image_ids: list[str]
    removed_image_ids: list[str]
    run_updated_analysis_available: bool
    state: str
    update_defaults: AnalysisResultUpdateDefaults


def summarize_analysis_result_source_changes(
    *,
    database_path: Path,
    data_root: Path,
    analysis_result_dir: Path,
) -> AnalysisResultSourceChangeSummary:
    result_manifest = _load_json(
        analysis_result_dir / ANALYSIS_RESULT_MANIFEST_NAME
    )
    scope_snapshot = _load_scope_snapshot(
        data_root=data_root,
        result_manifest=result_manifest,
    )
    collection_slugs = _collection_slugs(scope_snapshot)
    current_scope = resolve_analysis_scope(
        database_path=database_path,
        collection_slugs=collection_slugs,
    )
    snapshot_items = _items(scope_snapshot)
    current_items = _items(current_scope.payload)
    snapshot_by_key = {_source_identity_key(item): item for item in snapshot_items}
    current_by_key = {_source_identity_key(item): item for item in current_items}

    active_image_ids = [
        _viewer_image_id(snapshot_item)
        for identity_key, snapshot_item in snapshot_by_key.items()
        if identity_key in current_by_key
    ]
    removed_image_ids = [
        _viewer_image_id(snapshot_item)
        for identity_key, snapshot_item in snapshot_by_key.items()
        if identity_key not in current_by_key
    ]
    added_image_ids = [
        _viewer_image_id(current_item)
        for identity_key, current_item in current_by_key.items()
        if identity_key not in snapshot_by_key
    ]
    return AnalysisResultSourceChangeSummary(
        active_image_ids=active_image_ids,
        added_image_ids=added_image_ids,
        removed_image_ids=removed_image_ids,
        run_updated_analysis_available=bool(added_image_ids),
        state="stale" if added_image_ids or removed_image_ids else "ready",
        update_defaults=AnalysisResultUpdateDefaults(
            collection_slugs=collection_slugs,
            recipe_ids=_recipe_ids(result_manifest),
        ),
    )


def _load_scope_snapshot(
    *,
    data_root: Path,
    result_manifest: dict[str, object],
) -> dict[str, object]:
    scope_snapshot = result_manifest.get("scope_snapshot")
    if not isinstance(scope_snapshot, dict):
        raise ValueError("Analysis Result has no scope snapshot.")

    snapshot_key = str(scope_snapshot.get("snapshot_key") or "").strip()
    snapshot_id = str(scope_snapshot.get("snapshot_id") or "").strip()
    if snapshot_key:
        path = data_root / snapshot_key
    elif snapshot_id:
        path = data_root / "analysis-scopes" / snapshot_id / "analysis-scope.json"
    else:
        raise ValueError("Analysis Result scope snapshot cannot be located.")

    return _load_json(path)


def _collection_slugs(scope_snapshot: dict[str, object]) -> list[str]:
    scope = scope_snapshot.get("scope")
    if not isinstance(scope, dict):
        raise ValueError("Analysis Scope snapshot has no scope payload.")
    collection_slugs = scope.get("collection_slugs")
    if not isinstance(collection_slugs, list):
        raise ValueError("Analysis Scope snapshot has no Collection scope.")
    return [str(slug) for slug in collection_slugs if str(slug)]


def _recipe_ids(result_manifest: dict[str, object]) -> list[str]:
    recipes = result_manifest.get("recipes", [])
    if not isinstance(recipes, list):
        return []
    recipe_ids: list[str] = []
    for recipe in recipes:
        if not isinstance(recipe, dict):
            continue
        recipe_id = str(recipe.get("recipe_name") or "").strip()
        if recipe_id and recipe_id not in recipe_ids:
            recipe_ids.append(recipe_id)
    return recipe_ids


def _items(payload: dict[str, object]) -> list[dict[str, object]]:
    items = payload.get("items", [])
    if not isinstance(items, list):
        raise ValueError("Analysis Scope payload has invalid items.")
    return [item for item in items if isinstance(item, dict)]


def _source_identity_key(item: dict[str, object]) -> str:
    source_identity = item.get("source_identity")
    if not isinstance(source_identity, dict):
        raise ValueError("Analysis Scope item has no source identity.")
    return "\x1f".join(
        [
            str(source_identity.get("provider") or ""),
            str(source_identity.get("object_id") or ""),
            str(source_identity.get("source_image_id") or ""),
        ]
    )


def _viewer_image_id(item: dict[str, object]) -> str:
    return f"image-asset-{int(item['image_asset_id'])}"


def _load_json(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise ValueError(f"Required Analysis Result file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))
