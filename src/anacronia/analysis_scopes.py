from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Sequence

from anacronia.curation import ensure_curation_schema


ANALYSIS_SCOPE_SNAPSHOT_FILENAME = "analysis-scope.json"


@dataclass(frozen=True)
class ResolvedAnalysisScope:
    payload: dict[str, object]
    item_count: int
    counts: dict[str, int]


@dataclass(frozen=True)
class AnalysisScopeSnapshot:
    snapshot_id: str
    snapshot_path: Path
    item_count: int
    counts: dict[str, int]


def create_analysis_scope_snapshot(
    *,
    database_path: Path,
    data_root: Path,
    collection_slugs: Sequence[str],
    created_at: datetime | None = None,
) -> AnalysisScopeSnapshot:
    resolved_scope = resolve_analysis_scope(
        database_path=database_path,
        collection_slugs=collection_slugs,
        data_root=data_root,
    )
    return save_analysis_scope_snapshot(
        data_root=data_root,
        resolved_scope=resolved_scope,
        created_at=created_at,
    )


def resolve_analysis_scope(
    *,
    database_path: Path,
    collection_slugs: Sequence[str],
    data_root: Path | None = None,
) -> ResolvedAnalysisScope:
    payload = _resolve_collection_scope_payload(
        database_path=database_path,
        collection_slugs=collection_slugs,
        data_root=data_root or database_path.parent,
    )
    return ResolvedAnalysisScope(
        payload=payload,
        item_count=len(payload["items"]),
        counts=dict(payload["counts"]),
    )


def save_analysis_scope_snapshot(
    *,
    data_root: Path,
    resolved_scope: ResolvedAnalysisScope,
    created_at: datetime | None = None,
) -> AnalysisScopeSnapshot:
    timestamp = _format_timestamp(created_at or datetime.now(timezone.utc))
    payload = deepcopy(resolved_scope.payload)
    payload["created_at"] = timestamp
    content_hash = _snapshot_content_hash(resolved_scope.payload)
    compact_timestamp = timestamp.replace(":", "").replace("-", "")
    snapshot_id = f"analysis-scope-{compact_timestamp}-{content_hash[:12]}"
    payload["snapshot_id"] = snapshot_id
    payload["scope_content_sha256"] = content_hash

    snapshot_path = (
        data_root
        / "analysis-scopes"
        / snapshot_id
        / ANALYSIS_SCOPE_SNAPSHOT_FILENAME
    )
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return AnalysisScopeSnapshot(
        snapshot_id=snapshot_id,
        snapshot_path=snapshot_path,
        item_count=resolved_scope.item_count,
        counts=dict(payload["counts"]),
    )


def _resolve_collection_scope_payload(
    *,
    database_path: Path,
    collection_slugs: Sequence[str],
    data_root: Path,
) -> dict[str, object]:
    resolved_data_root = data_root.expanduser().resolve()
    selected_slugs = _normalize_selected_collection_slugs(collection_slugs)
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        collections = _load_selected_collections(
            connection=connection,
            collection_slugs=selected_slugs,
        )
        rows = _load_scope_membership_rows(
            connection=connection,
            collection_ids=[collection["id"] for collection in collections],
        )

    collection_by_id = {int(collection["id"]): collection for collection in collections}
    collection_order_by_slug = {
        str(collection["slug"]): index for index, collection in enumerate(collections)
    }
    candidate_memberships = len(rows)
    missing_or_removed_material = 0
    active_memberships = 0
    items_by_key: dict[str, dict[str, object]] = {}

    for row in rows:
        search_set_id = int(row["search_set_id"])
        collection = collection_by_id[search_set_id]
        if not _row_is_active_imported_image(row):
            missing_or_removed_material += 1
            continue

        active_memberships += 1
        source_image_id = str(row["source_image_id"] or row["source_image_url"])
        item_key = _source_identity_key(
            provider=str(row["provider"]),
            object_id=str(row["object_id"]),
            source_image_id=source_image_id,
        )
        item = items_by_key.setdefault(
            item_key,
            {
                "image_asset_id": int(row["image_asset_id"]),
                "source_identity": {
                    "source_type": _source_type_for_provider(str(row["provider"])),
                    "provider": str(row["provider"]),
                    "object_id": str(row["object_id"]),
                    "source_image_id": source_image_id,
                    "source_image_url": str(row["source_image_url"]),
                },
                "display": {
                    "original_width": int(row["original_width"]),
                    "original_height": int(row["original_height"]),
                },
                "derivatives": {
                    "standard-1024": {
                        "artifact_key": _relative_artifact_key(
                            path=Path(str(row["standard_path"])),
                            data_root=resolved_data_root,
                        ),
                    },
                    "thumb-256": {
                        "artifact_key": _relative_artifact_key(
                            path=Path(str(row["thumb_path"])),
                            data_root=resolved_data_root,
                        ),
                    },
                },
                "contributing_collections": [],
            },
        )
        contributing_collections = item["contributing_collections"]
        assert isinstance(contributing_collections, list)
        collection_ref = {
            "slug": str(collection["slug"]),
            "display_name": str(collection["display_name"]),
        }
        if collection_ref not in contributing_collections:
            contributing_collections.append(collection_ref)

    items = sorted(
        items_by_key.values(),
        key=lambda item: (
            str(item["source_identity"]["provider"]),
            str(item["source_identity"]["object_id"]),
            str(item["source_identity"]["source_image_id"]),
        ),
    )
    for item in items:
        contributing_collections = item["contributing_collections"]
        assert isinstance(contributing_collections, list)
        contributing_collections.sort(
            key=lambda collection: collection_order_by_slug[str(collection["slug"])]
        )

    return {
        "schema_version": 1,
        "asset_kind": "analysis-scope-snapshot",
        "scope": {
            "kind": "collections",
            "collection_slugs": [str(collection["slug"]) for collection in collections],
        },
        "counts": {
            "selected_collections": len(collections),
            "candidate_memberships": candidate_memberships,
            "active_memberships": active_memberships,
            "active_images": len(items),
            "duplicates_collapsed": active_memberships - len(items),
            "missing_or_removed_material": missing_or_removed_material,
        },
        "items": items,
    }


def _normalize_selected_collection_slugs(collection_slugs: Sequence[str]) -> list[str]:
    selected_slugs: list[str] = []
    for slug in collection_slugs:
        normalized_slug = slug.strip()
        if normalized_slug and normalized_slug not in selected_slugs:
            selected_slugs.append(normalized_slug)
    if not selected_slugs:
        raise ValueError("At least one Collection is required for an Analysis Scope.")
    return selected_slugs


def _load_selected_collections(
    *,
    connection: sqlite3.Connection,
    collection_slugs: list[str],
) -> list[dict[str, object]]:
    placeholders = ",".join("?" for _ in collection_slugs)
    rows = connection.execute(
        f"""
        SELECT id, slug, display_name
        FROM search_sets
        WHERE slug IN ({placeholders})
        """,
        collection_slugs,
    ).fetchall()
    collections_by_slug = {
        str(row[1]): {
            "id": int(row[0]),
            "slug": str(row[1]),
            "display_name": str(row[2]),
        }
        for row in rows
    }
    missing_slugs = [
        slug for slug in collection_slugs if slug not in collections_by_slug
    ]
    if missing_slugs:
        raise LookupError(f"Collection not found: {', '.join(missing_slugs)}")
    return [collections_by_slug[slug] for slug in collection_slugs]


def _load_scope_membership_rows(
    *,
    connection: sqlite3.Connection,
    collection_ids: list[int],
) -> list[sqlite3.Row]:
    connection.row_factory = sqlite3.Row
    placeholders = ",".join("?" for _ in collection_ids)
    return connection.execute(
        f"""
        SELECT
          collection_image_asset_memberships.search_set_id,
          collection_image_asset_memberships.provider,
          collection_image_asset_memberships.object_id,
          collection_image_asset_memberships.source_image_url,
          collection_image_asset_memberships.active AS membership_active,
          image_assets.id AS image_asset_id,
          image_assets.source_image_id,
          image_assets.original_width,
          image_assets.original_height,
          image_assets.standard_path,
          image_assets.thumb_path,
          image_assets.imported AS image_imported,
          image_assets.active AS image_active,
          museum_objects.active AS object_active
        FROM collection_image_asset_memberships
        LEFT JOIN image_assets
          ON image_assets.provider = collection_image_asset_memberships.provider
          AND image_assets.object_id = collection_image_asset_memberships.object_id
          AND image_assets.source_image_url = collection_image_asset_memberships.source_image_url
        LEFT JOIN museum_objects
          ON museum_objects.provider = collection_image_asset_memberships.provider
          AND museum_objects.object_id = collection_image_asset_memberships.object_id
        WHERE collection_image_asset_memberships.search_set_id IN ({placeholders})
        ORDER BY
          collection_image_asset_memberships.search_set_id,
          collection_image_asset_memberships.provider,
          collection_image_asset_memberships.object_id,
          collection_image_asset_memberships.source_image_url
        """,
        collection_ids,
    ).fetchall()


def _row_is_active_imported_image(row: sqlite3.Row) -> bool:
    return (
        int(row["membership_active"] or 0) == 1
        and row["image_asset_id"] is not None
        and int(row["image_imported"] or 0) == 1
        and int(row["image_active"] or 0) == 1
        and int(row["object_active"] or 0) == 1
    )


def _source_identity_key(
    *,
    provider: str,
    object_id: str,
    source_image_id: str,
) -> str:
    return "\x1f".join([provider, object_id, source_image_id])


def _source_type_for_provider(provider: str) -> str:
    return "local-folder" if provider == "local-folder" else "online-provider"


def _relative_artifact_key(*, path: Path, data_root: Path) -> str:
    resolved_path = path.expanduser().resolve()
    try:
        return resolved_path.relative_to(data_root).as_posix()
    except ValueError as error:
        raise ValueError(
            f"Image derivative path is outside the data root: {resolved_path}"
        ) from error


def _snapshot_content_hash(payload: dict[str, object]) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _format_timestamp(value: datetime) -> str:
    timestamp = value.astimezone(timezone.utc)
    return timestamp.isoformat().replace("+00:00", "Z")
