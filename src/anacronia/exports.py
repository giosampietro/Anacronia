from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import sqlite3
from typing import Literal

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.curation import ensure_collection_memberships
from anacronia.image_pipeline import (
    ImageDerivativeSettings,
    STANDARD_1024_SETTINGS,
    THUMB_256_SETTINGS,
    validate_image_derivative,
)
from anacronia.local_folder_import import LOCAL_FOLDER_PROVIDER
from anacronia.met_ingest import ensure_met_ingest_schema
from anacronia.provider_identity import SourceObjectId, normalize_source_object_id


ExportFormat = Literal["jsonl", "csv", "package"]
EXPORT_STANDARD_SETTINGS = ImageDerivativeSettings(**STANDARD_1024_SETTINGS)
EXPORT_THUMB_SETTINGS = ImageDerivativeSettings(**THUMB_256_SETTINGS)


@dataclass(frozen=True)
class ExportSkippedImageAsset:
    image_asset_id: int
    provider: str
    object_id: SourceObjectId
    source_image_url: str
    reason: str


@dataclass(frozen=True)
class CollectionExportResult:
    export_format: ExportFormat
    export_path: Path
    row_count: int
    skipped_image_assets: list[ExportSkippedImageAsset]

    @property
    def skipped_image_asset_count(self) -> int:
        return len(self.skipped_image_assets)


class NoExportableAssetsError(RuntimeError):
    def __init__(self, skipped_image_assets: list[ExportSkippedImageAsset]) -> None:
        super().__init__("Collection has no exportable Image Assets.")
        self.skipped_image_assets = skipped_image_assets


@dataclass(frozen=True)
class ExportCollection:
    slug: str
    title: str
    scope: str = "collection"


@dataclass(frozen=True)
class ExportImageAsset:
    image_asset_id: int
    provider: str
    object_id: SourceObjectId
    source_image_url: str
    source_image_id: str
    source_rights_statement: str
    source_rights_uri: str
    source_license_name: str
    source_license_uri: str
    source_iiif_service_url: str
    source_metadata: dict[str, object]
    image_role: str
    image_index: int | None
    original_width: int
    original_height: int
    standard_path: Path
    thumb_path: Path
    title: str
    object_name: str
    artist_display_name: str
    object_url: str
    rights_and_reproduction: str
    metadata_date: str
    object_is_favorite: bool
    image_is_favorite: bool


@dataclass(frozen=True)
class ExportMatch:
    search_term: str
    verified: bool
    matched_fields: list[str]


@dataclass(frozen=True)
class ExportDescriptor:
    provider: str
    descriptor_type: str
    value: str
    normalized_value: str
    source_field: str


@dataclass(frozen=True)
class PackageImageCopy:
    source_path: Path
    relative_path: str


def normalize_selected_object_refs(
    selected_objects: list[tuple[str, SourceObjectId | int]],
) -> set[tuple[str, SourceObjectId]]:
    return {
        (provider, normalize_source_object_id(object_id))
        for provider, object_id in selected_objects
    }


def export_collection(
    *,
    database_path: Path,
    data_root: Path,
    search_set_slug: str,
    export_format: ExportFormat,
    selected_image_asset_ids: list[int] | None = None,
    selected_objects: list[tuple[str, SourceObjectId | int]] | None = None,
    timestamp: str | None = None,
) -> CollectionExportResult:
    if export_format not in {"jsonl", "csv", "package"}:
        raise ValueError(f"Unsupported export format: {export_format}")

    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
        ensure_collection_memberships(connection)
        collection = get_export_collection(connection=connection, search_set_slug=search_set_slug)
        image_assets = list_collection_image_assets(
            connection=connection,
            search_set_slug=search_set_slug,
        )
        if selected_image_asset_ids is not None or selected_objects is not None:
            selected_ids = set(selected_image_asset_ids or [])
            selected_object_refs = normalize_selected_object_refs(selected_objects or [])
            image_assets = [
                image_asset
                for image_asset in image_assets
                if image_asset.image_asset_id in selected_ids
                or (image_asset.provider, image_asset.object_id) in selected_object_refs
            ]
        rows_and_skips = build_export_rows(
            connection=connection,
            collection=collection,
            image_assets=image_assets,
            path_mode="relative" if export_format == "package" else "absolute",
        )

    rows = rows_and_skips[0]
    skipped_image_assets = rows_and_skips[1]
    package_image_copies = rows_and_skips[2]
    if not rows:
        raise NoExportableAssetsError(skipped_image_assets=skipped_image_assets)

    export_path = unique_export_path(
        data_root=data_root,
        search_set_slug=search_set_slug,
        export_format=export_format,
        timestamp=timestamp,
    )
    export_path.mkdir(parents=True, exist_ok=False)

    if export_format in {"jsonl", "package"}:
        write_jsonl_manifest(path=export_path / "manifest.jsonl", rows=rows)
    if export_format in {"csv", "package"}:
        write_csv_metadata(path=export_path / "metadata.csv", rows=rows)
    if export_format == "package":
        copy_package_images(export_path=export_path, image_copies=package_image_copies)
    if skipped_image_assets:
        write_export_warnings(
            path=export_path / "export-warnings.json",
            skipped_image_assets=skipped_image_assets,
        )

    return CollectionExportResult(
        export_format=export_format,
        export_path=export_path,
        row_count=len(rows),
        skipped_image_assets=skipped_image_assets,
    )


def export_user_library(
    *,
    database_path: Path,
    data_root: Path,
    export_format: ExportFormat,
    selected_image_asset_ids: list[int] | None = None,
    selected_objects: list[tuple[str, SourceObjectId | int]] | None = None,
    timestamp: str | None = None,
) -> CollectionExportResult:
    if export_format not in {"jsonl", "csv", "package"}:
        raise ValueError(f"Unsupported export format: {export_format}")

    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
        ensure_collection_memberships(connection)
        collection = ExportCollection(
            slug="user-library",
            title="My Library",
            scope="user-library",
        )
        image_assets = list_user_library_image_assets(connection=connection)
        if selected_image_asset_ids is not None or selected_objects is not None:
            selected_ids = set(selected_image_asset_ids or [])
            selected_object_refs = normalize_selected_object_refs(selected_objects or [])
            image_assets = [
                image_asset
                for image_asset in image_assets
                if image_asset.image_asset_id in selected_ids
                or (image_asset.provider, image_asset.object_id) in selected_object_refs
            ]
        rows_and_skips = build_export_rows(
            connection=connection,
            collection=collection,
            image_assets=image_assets,
            path_mode="relative" if export_format == "package" else "absolute",
        )

    rows = rows_and_skips[0]
    skipped_image_assets = rows_and_skips[1]
    package_image_copies = rows_and_skips[2]
    if not rows:
        raise NoExportableAssetsError(skipped_image_assets=skipped_image_assets)

    export_path = unique_export_path(
        data_root=data_root,
        search_set_slug="user-library",
        export_format=export_format,
        timestamp=timestamp,
    )
    export_path.mkdir(parents=True, exist_ok=False)

    if export_format in {"jsonl", "package"}:
        write_jsonl_manifest(path=export_path / "manifest.jsonl", rows=rows)
    if export_format in {"csv", "package"}:
        write_csv_metadata(path=export_path / "metadata.csv", rows=rows)
    if export_format == "package":
        copy_package_images(export_path=export_path, image_copies=package_image_copies)
    if skipped_image_assets:
        write_export_warnings(
            path=export_path / "export-warnings.json",
            skipped_image_assets=skipped_image_assets,
        )

    return CollectionExportResult(
        export_format=export_format,
        export_path=export_path,
        row_count=len(rows),
        skipped_image_assets=skipped_image_assets,
    )


def unique_export_path(
    *,
    data_root: Path,
    search_set_slug: str,
    export_format: ExportFormat,
    timestamp: str | None,
) -> Path:
    export_root = data_root / "exports" / search_set_slug
    short_timestamp = timestamp or datetime.now(UTC).strftime("%y%m%d-%H%MZ")
    folder_name = f"{export_format}-{short_timestamp}"
    export_path = export_root / folder_name
    if not export_path.exists():
        return export_path

    sequence = 2
    while True:
        candidate_path = export_root / f"{folder_name}-{sequence:02d}"
        if not candidate_path.exists():
            return candidate_path
        sequence += 1


def get_export_collection(
    *,
    connection: sqlite3.Connection,
    search_set_slug: str,
) -> ExportCollection:
    row = connection.execute(
        """
        SELECT slug, display_name
        FROM search_sets
        WHERE slug = ?
        """,
        (search_set_slug,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Unknown Collection: {search_set_slug}")

    return ExportCollection(slug=row[0], title=row[1])


def list_collection_image_assets(
    *,
    connection: sqlite3.Connection,
    search_set_slug: str,
) -> list[ExportImageAsset]:
    ensure_collection_memberships(connection)
    rows = connection.execute(
        """
        SELECT DISTINCT
          image_assets.id,
          image_assets.provider,
          image_assets.object_id,
          image_assets.source_image_url,
          image_assets.source_image_id,
          image_assets.source_rights_statement,
          image_assets.source_rights_uri,
          image_assets.source_license_name,
          image_assets.source_license_uri,
          image_assets.source_iiif_service_url,
          image_assets.source_metadata_json,
          image_assets.image_role,
          image_assets.image_index,
          image_assets.original_width,
          image_assets.original_height,
          image_assets.standard_path,
          image_assets.thumb_path,
          museum_objects.title,
          museum_objects.object_name,
          museum_objects.artist_display_name,
          museum_objects.object_url,
          museum_objects.rights_and_reproduction,
          museum_objects.metadata_date,
          EXISTS (
            SELECT 1
            FROM object_favorites
            WHERE
              object_favorites.provider = image_assets.provider
              AND object_favorites.object_id = image_assets.object_id
          ) AS object_is_favorite,
          EXISTS (
            SELECT 1
            FROM image_asset_favorites
            WHERE
              image_asset_favorites.provider = image_assets.provider
              AND image_asset_favorites.object_id = image_assets.object_id
              AND image_asset_favorites.source_image_url = image_assets.source_image_url
          ) AS image_is_favorite
        FROM image_assets
        JOIN museum_objects
          ON museum_objects.provider = image_assets.provider
          AND museum_objects.object_id = image_assets.object_id
        JOIN search_sets
          ON search_sets.slug = ?
        JOIN collection_object_memberships
          ON collection_object_memberships.search_set_id = search_sets.id
          AND collection_object_memberships.provider = image_assets.provider
          AND collection_object_memberships.object_id = image_assets.object_id
          AND collection_object_memberships.active = 1
        JOIN collection_image_asset_memberships
          ON collection_image_asset_memberships.search_set_id = search_sets.id
          AND collection_image_asset_memberships.provider = image_assets.provider
          AND collection_image_asset_memberships.object_id = image_assets.object_id
          AND collection_image_asset_memberships.source_image_url = image_assets.source_image_url
          AND collection_image_asset_memberships.active = 1
        WHERE
          image_assets.imported = 1
          AND image_assets.active = 1
          AND museum_objects.active = 1
        ORDER BY image_assets.id
        """,
        (search_set_slug,),
    ).fetchall()

    return [
        ExportImageAsset(
            image_asset_id=int(row[0]),
            provider=row[1],
            object_id=normalize_source_object_id(row[2]),
            source_image_url=row[3],
            source_image_id=row[4],
            source_rights_statement=row[5],
            source_rights_uri=row[6],
            source_license_name=row[7],
            source_license_uri=row[8],
            source_iiif_service_url=row[9],
            source_metadata=parse_source_metadata(row[10]),
            image_role=row[11],
            image_index=row[12],
            original_width=int(row[13]),
            original_height=int(row[14]),
            standard_path=Path(row[15]),
            thumb_path=Path(row[16]),
            title=row[17],
            object_name=row[18],
            artist_display_name=row[19],
            object_url=row[20],
            rights_and_reproduction=row[21],
            metadata_date=row[22],
            object_is_favorite=bool(row[23]),
            image_is_favorite=bool(row[24]),
        )
        for row in rows
    ]


def list_user_library_image_assets(
    *,
    connection: sqlite3.Connection,
) -> list[ExportImageAsset]:
    ensure_collection_memberships(connection)
    rows = connection.execute(
        """
        SELECT DISTINCT
          image_assets.id,
          image_assets.provider,
          image_assets.object_id,
          image_assets.source_image_url,
          image_assets.source_image_id,
          image_assets.source_rights_statement,
          image_assets.source_rights_uri,
          image_assets.source_license_name,
          image_assets.source_license_uri,
          image_assets.source_iiif_service_url,
          image_assets.source_metadata_json,
          image_assets.image_role,
          image_assets.image_index,
          image_assets.original_width,
          image_assets.original_height,
          image_assets.standard_path,
          image_assets.thumb_path,
          museum_objects.title,
          museum_objects.object_name,
          museum_objects.artist_display_name,
          museum_objects.object_url,
          museum_objects.rights_and_reproduction,
          museum_objects.metadata_date,
          EXISTS (
            SELECT 1
            FROM object_favorites
            WHERE
              object_favorites.provider = image_assets.provider
              AND object_favorites.object_id = image_assets.object_id
          ) AS object_is_favorite,
          EXISTS (
            SELECT 1
            FROM image_asset_favorites
            WHERE
              image_asset_favorites.provider = image_assets.provider
              AND image_asset_favorites.object_id = image_assets.object_id
              AND image_asset_favorites.source_image_url = image_assets.source_image_url
          ) AS image_is_favorite
        FROM image_assets
        JOIN museum_objects
          ON museum_objects.provider = image_assets.provider
          AND museum_objects.object_id = image_assets.object_id
        WHERE
          image_assets.imported = 1
          AND image_assets.active = 1
          AND museum_objects.active = 1
        ORDER BY image_assets.id
        """
    ).fetchall()

    return [
        ExportImageAsset(
            image_asset_id=int(row[0]),
            provider=row[1],
            object_id=normalize_source_object_id(row[2]),
            source_image_url=row[3],
            source_image_id=row[4],
            source_rights_statement=row[5],
            source_rights_uri=row[6],
            source_license_name=row[7],
            source_license_uri=row[8],
            source_iiif_service_url=row[9],
            source_metadata=parse_source_metadata(row[10]),
            image_role=row[11],
            image_index=row[12],
            original_width=int(row[13]),
            original_height=int(row[14]),
            standard_path=Path(row[15]),
            thumb_path=Path(row[16]),
            title=row[17],
            object_name=row[18],
            artist_display_name=row[19],
            object_url=row[20],
            rights_and_reproduction=row[21],
            metadata_date=row[22],
            object_is_favorite=bool(row[23]),
            image_is_favorite=bool(row[24]),
        )
        for row in rows
    ]


def build_export_rows(
    *,
    connection: sqlite3.Connection,
    collection: ExportCollection,
    image_assets: list[ExportImageAsset],
    path_mode: Literal["absolute", "relative"],
) -> tuple[list[dict[str, object]], list[ExportSkippedImageAsset], list[PackageImageCopy]]:
    rows: list[dict[str, object]] = []
    skipped_image_assets: list[ExportSkippedImageAsset] = []
    package_image_copies: list[PackageImageCopy] = []

    for image_asset in image_assets:
        missing_reason = missing_derivative_reason(image_asset)
        if missing_reason is not None:
            skipped_image_assets.append(
                ExportSkippedImageAsset(
                    image_asset_id=image_asset.image_asset_id,
                    provider=image_asset.provider,
                    object_id=image_asset.object_id,
                    source_image_url=image_asset.source_image_url,
                    reason=missing_reason,
                )
            )
            continue

        if collection.scope == "user-library":
            matches = get_user_library_export_matches(
                connection=connection,
                provider=image_asset.provider,
                object_id=image_asset.object_id,
            )
        else:
            matches = get_export_matches(
                connection=connection,
                collection_slug=collection.slug,
                provider=image_asset.provider,
                object_id=image_asset.object_id,
            )
        descriptors = get_export_descriptors(
            connection=connection,
            provider=image_asset.provider,
            object_id=image_asset.object_id,
        )
        standard_path, thumb_path = export_row_paths(
            image_asset=image_asset,
            path_mode=path_mode,
        )
        if path_mode == "relative":
            package_image_copies.extend(
                [
                    PackageImageCopy(
                        source_path=image_asset.standard_path,
                        relative_path=standard_path,
                    ),
                    PackageImageCopy(
                        source_path=image_asset.thumb_path,
                        relative_path=thumb_path,
                    ),
                ]
            )
        rows.append(
            {
                "collection": {
                    "slug": collection.slug,
                    "title": collection.title,
                    "scope": collection.scope,
                },
                "image_asset": {
                    "image_asset_id": image_asset.image_asset_id,
                    "provider": image_asset.provider,
                    "object_id": image_asset.object_id,
                    "source_type": export_source_type(image_asset),
                    "source_identity": export_source_identity(image_asset),
                    "source_object_identity": export_source_object_identity(image_asset),
                    "source_image_url": export_source_image_url(image_asset),
                    "source_image_id": image_asset.source_image_id,
                    "source_image_identity": export_source_image_identity(image_asset),
                    "source_system_number": export_source_system_number(image_asset),
                    "source_iiif_image_url": export_source_iiif_image_url(image_asset),
                    "source_iiif_service_url": image_asset.source_iiif_service_url,
                    "source_rights_statement": image_asset.source_rights_statement,
                    "source_rights_uri": image_asset.source_rights_uri,
                    "source_license_name": image_asset.source_license_name,
                    "source_license_uri": image_asset.source_license_uri,
                    "source_sensitive_image": export_source_sensitive_image(image_asset),
                    "image_role": image_asset.image_role,
                    "image_index": image_asset.image_index,
                    "original_width": image_asset.original_width,
                    "original_height": image_asset.original_height,
                    "standard_path": standard_path,
                    "thumb_path": thumb_path,
                    "is_favorite": image_asset.image_is_favorite,
                },
                "museum_object": {
                    "title": image_asset.title,
                    "object_name": image_asset.object_name,
                    "artist_display_name": image_asset.artist_display_name,
                    "object_url": image_asset.object_url,
                    "rights_and_reproduction": image_asset.rights_and_reproduction,
                    "metadata_date": image_asset.metadata_date,
                    "is_favorite": image_asset.object_is_favorite,
                },
                "matches": [
                    {
                        "search_term": match.search_term,
                        "verified": match.verified,
                        "matched_fields": match.matched_fields,
                    }
                    for match in matches
                ],
                "descriptors": [
                    {
                        "provider": descriptor.provider,
                        "type": descriptor.descriptor_type,
                        "value": descriptor.value,
                        "normalized_value": descriptor.normalized_value,
                        "source_field": descriptor.source_field,
                    }
                    for descriptor in descriptors
                ],
                "semantic_text": build_semantic_text(
                    image_asset=image_asset,
                    descriptors=descriptors,
                ),
            }
        )

    return rows, skipped_image_assets, package_image_copies


def missing_derivative_reason(image_asset: ExportImageAsset) -> str | None:
    standard_exists = image_asset.standard_path.is_file()
    thumb_exists = image_asset.thumb_path.is_file()

    if not standard_exists and not thumb_exists:
        return "missing_standard_and_thumb_derivatives"
    if not standard_exists:
        return "missing_standard_derivative"
    if not thumb_exists:
        return "missing_thumb_derivative"
    if not validate_image_derivative(
        path=image_asset.standard_path,
        settings=EXPORT_STANDARD_SETTINGS,
    ) or not validate_image_derivative(
        path=image_asset.thumb_path,
        settings=EXPORT_THUMB_SETTINGS,
    ):
        return "invalid_derivative"
    return None


def export_source_image_url(image_asset: ExportImageAsset) -> str:
    if image_asset.provider == LOCAL_FOLDER_PROVIDER:
        return ""
    return image_asset.source_image_url


def export_source_type(image_asset: ExportImageAsset) -> str:
    if image_asset.provider == LOCAL_FOLDER_PROVIDER:
        return "local-folder"
    return "online-provider"


def export_source_identity(image_asset: ExportImageAsset) -> str:
    if image_asset.provider == LOCAL_FOLDER_PROVIDER:
        return export_source_image_identity(image_asset)
    return (
        f"{export_source_type(image_asset)}:"
        f"{export_source_object_identity(image_asset)}:"
        f"{image_asset.source_image_url}"
    )


def export_source_object_identity(image_asset: ExportImageAsset) -> str:
    return f"{image_asset.provider}:{image_asset.object_id}"


def export_source_image_identity(image_asset: ExportImageAsset) -> str:
    if image_asset.provider == LOCAL_FOLDER_PROVIDER:
        return image_asset.source_image_url
    return f"{image_asset.provider}:{image_asset.source_image_url}"


def export_source_system_number(image_asset: ExportImageAsset) -> str:
    if image_asset.provider == "vam":
        return str(image_asset.object_id)
    return ""


def export_source_iiif_image_url(image_asset: ExportImageAsset) -> str:
    if image_asset.provider == "vam":
        return image_asset.source_image_url
    return ""


def export_source_sensitive_image(image_asset: ExportImageAsset) -> bool | None:
    value = image_asset.source_metadata.get("sensitive_image")
    return value if isinstance(value, bool) else None


def parse_source_metadata(value: object) -> dict[str, object]:
    if not isinstance(value, str):
        return {}
    try:
        metadata = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return metadata if isinstance(metadata, dict) else {}


def get_export_matches(
    *,
    connection: sqlite3.Connection,
    collection_slug: str,
    provider: str,
    object_id: SourceObjectId | int,
) -> list[ExportMatch]:
    source_object_id = normalize_source_object_id(object_id)
    rows = connection.execute(
        """
        SELECT DISTINCT
          object_matches.search_term,
          object_matches.verified,
          object_matches.matched_fields_json
        FROM object_matches
        JOIN collection_runs
          ON collection_runs.id = object_matches.run_id
        JOIN provider_collections
          ON provider_collections.id = collection_runs.provider_collection_id
        JOIN search_sets
          ON search_sets.id = provider_collections.search_set_id
        WHERE
          search_sets.slug = ?
          AND object_matches.provider = ?
          AND object_matches.object_id = ?
        ORDER BY object_matches.search_term
        """,
        (collection_slug, provider, source_object_id),
    ).fetchall()

    return [
        ExportMatch(
            search_term=row[0],
            verified=bool(row[1]),
            matched_fields=json.loads(row[2]),
        )
        for row in rows
    ]


def get_user_library_export_matches(
    *,
    connection: sqlite3.Connection,
    provider: str,
    object_id: SourceObjectId | int,
) -> list[ExportMatch]:
    source_object_id = normalize_source_object_id(object_id)
    rows = connection.execute(
        """
        SELECT DISTINCT
          object_matches.search_term,
          object_matches.verified,
          object_matches.matched_fields_json
        FROM object_matches
        WHERE
          object_matches.provider = ?
          AND object_matches.object_id = ?
        ORDER BY object_matches.search_term
        """,
        (provider, source_object_id),
    ).fetchall()

    return [
        ExportMatch(
            search_term=row[0],
            verified=bool(row[1]),
            matched_fields=json.loads(row[2]),
        )
        for row in rows
    ]


def get_export_descriptors(
    *,
    connection: sqlite3.Connection,
    provider: str,
    object_id: SourceObjectId | int,
) -> list[ExportDescriptor]:
    source_object_id = normalize_source_object_id(object_id)
    rows = connection.execute(
        """
        SELECT provider, descriptor_type, value, normalized_value, source_field
        FROM descriptors
        WHERE provider = ? AND object_id = ?
        ORDER BY descriptor_type, value, source_field
        """,
        (provider, source_object_id),
    ).fetchall()

    return [
        ExportDescriptor(
            provider=row[0],
            descriptor_type=row[1],
            value=row[2],
            normalized_value=row[3],
            source_field=row[4],
        )
        for row in rows
    ]


def export_row_paths(
    *,
    image_asset: ExportImageAsset,
    path_mode: Literal["absolute", "relative"],
) -> tuple[str, str]:
    if path_mode == "absolute":
        return (
            str(image_asset.standard_path.resolve()),
            str(image_asset.thumb_path.resolve()),
        )

    return (
        package_image_path(image_asset=image_asset, derivative="standard-1024"),
        package_image_path(image_asset=image_asset, derivative="thumb-256"),
    )


def package_image_path(*, image_asset: ExportImageAsset, derivative: str) -> str:
    folder = "standard-1024" if derivative == "standard-1024" else "thumb-256"
    return f"images/{folder}/{image_asset.image_asset_id}.jpg"


def build_semantic_text(
    *,
    image_asset: ExportImageAsset,
    descriptors: list[ExportDescriptor],
) -> str:
    parts = compact_values([image_asset.title])
    labeled_parts = [
        ("Object name", compact_values([image_asset.object_name])),
        ("Tags", descriptor_values(descriptors=descriptors, descriptor_type="tag")),
        ("Medium", descriptor_values(descriptors=descriptors, descriptor_type="medium")),
        (
            "Classification",
            descriptor_values(descriptors=descriptors, descriptor_type="classification"),
        ),
        ("Culture", descriptor_values(descriptors=descriptors, descriptor_type="culture")),
        ("Period", descriptor_values(descriptors=descriptors, descriptor_type="period")),
        ("Date", descriptor_values(descriptors=descriptors, descriptor_type="date")),
        ("Place", descriptor_values(descriptors=descriptors, descriptor_type="place")),
    ]

    for label, values in labeled_parts:
        if values:
            parts.append(f"{label}: {'; '.join(values)}")

    return ". ".join(parts) + "." if parts else ""


def descriptor_values(
    *,
    descriptors: list[ExportDescriptor],
    descriptor_type: str,
) -> list[str]:
    return compact_values(
        [
            descriptor.value
            for descriptor in descriptors
            if descriptor.descriptor_type == descriptor_type
        ]
    )


def compact_values(values: list[str]) -> list[str]:
    compacted: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized = " ".join(value.split()).casefold()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        compacted.append(" ".join(value.split()))

    return compacted


def write_jsonl_manifest(*, path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def write_csv_metadata(*, path: Path, rows: list[dict[str, object]]) -> None:
    columns = [
        "collection_slug",
        "collection_title",
        "source_type",
        "source_identity",
        "source_object_identity",
        "source_image_id",
        "source_image_identity",
        "source_system_number",
        "source_iiif_image_url",
        "source_iiif_service_url",
        "source_rights_statement",
        "source_rights_uri",
        "source_license_name",
        "source_license_uri",
        "source_sensitive_image",
        "provider",
        "object_id",
        "image_asset_id",
        "source_image_url",
        "image_role",
        "image_index",
        "standard_path",
        "thumb_path",
        "title",
        "object_name",
        "artist_display_name",
        "object_url",
        "rights_and_reproduction",
        "metadata_date",
        "matched_terms",
        "verified_matched_terms",
        "matched_fields",
        "descriptors",
        "semantic_text",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(flatten_export_row(row))


def flatten_export_row(row: dict[str, object]) -> dict[str, object]:
    collection = row["collection"]
    image_asset = row["image_asset"]
    museum_object = row["museum_object"]
    matches = row["matches"]
    descriptors = row["descriptors"]
    assert isinstance(collection, dict)
    assert isinstance(image_asset, dict)
    assert isinstance(museum_object, dict)
    assert isinstance(matches, list)
    assert isinstance(descriptors, list)

    return {
        "collection_slug": collection["slug"],
        "collection_title": collection["title"],
        "source_type": image_asset["source_type"],
        "source_identity": image_asset["source_identity"],
        "source_object_identity": image_asset["source_object_identity"],
        "source_image_id": image_asset["source_image_id"],
        "source_image_identity": image_asset["source_image_identity"],
        "source_system_number": image_asset["source_system_number"],
        "source_iiif_image_url": image_asset["source_iiif_image_url"],
        "source_iiif_service_url": image_asset["source_iiif_service_url"],
        "source_rights_statement": image_asset["source_rights_statement"],
        "source_rights_uri": image_asset["source_rights_uri"],
        "source_license_name": image_asset["source_license_name"],
        "source_license_uri": image_asset["source_license_uri"],
        "source_sensitive_image": csv_bool_or_empty(
            image_asset["source_sensitive_image"]
        ),
        "provider": image_asset["provider"],
        "object_id": image_asset["object_id"],
        "image_asset_id": image_asset["image_asset_id"],
        "source_image_url": image_asset["source_image_url"],
        "image_role": image_asset["image_role"],
        "image_index": "" if image_asset["image_index"] is None else image_asset["image_index"],
        "standard_path": image_asset["standard_path"],
        "thumb_path": image_asset["thumb_path"],
        "title": museum_object["title"],
        "object_name": museum_object["object_name"],
        "artist_display_name": museum_object["artist_display_name"],
        "object_url": museum_object["object_url"],
        "rights_and_reproduction": museum_object["rights_and_reproduction"],
        "metadata_date": museum_object["metadata_date"],
        "matched_terms": "; ".join(str(match["search_term"]) for match in matches),
        "verified_matched_terms": "; ".join(
            str(match["search_term"])
            for match in matches
            if match["verified"]
        ),
        "matched_fields": "; ".join(
            field
            for match in matches
            for field in match["matched_fields"]
        ),
        "descriptors": "; ".join(
            f"{descriptor['type']}: {descriptor['value']} [{descriptor['source_field']}]"
            for descriptor in descriptors
        ),
        "semantic_text": row["semantic_text"],
    }


def csv_bool_or_empty(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return ""


def copy_package_images(*, export_path: Path, image_copies: list[PackageImageCopy]) -> None:
    for image_copy in image_copies:
        destination = export_path / image_copy.relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image_copy.source_path, destination)


def write_export_warnings(
    *,
    path: Path,
    skipped_image_assets: list[ExportSkippedImageAsset],
) -> None:
    path.write_text(
        json.dumps(
            {
                "skipped_image_assets": [
                    {
                        "image_asset_id": skipped.image_asset_id,
                        "provider": skipped.provider,
                        "object_id": skipped.object_id,
                        "source_image_url": skipped.source_image_url,
                        "reason": skipped.reason,
                    }
                    for skipped in skipped_image_assets
                ]
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
