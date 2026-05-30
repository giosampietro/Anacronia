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
from anacronia.met_ingest import ensure_met_ingest_schema


ExportFormat = Literal["jsonl", "csv", "package"]


@dataclass(frozen=True)
class ExportSkippedImageAsset:
    image_asset_id: int
    provider: str
    object_id: int
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


@dataclass(frozen=True)
class ExportImageAsset:
    image_asset_id: int
    provider: str
    object_id: int
    source_image_url: str
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


def export_collection(
    *,
    database_path: Path,
    data_root: Path,
    search_set_slug: str,
    export_format: ExportFormat,
    timestamp: str | None = None,
) -> CollectionExportResult:
    if export_format not in {"jsonl", "csv", "package"}:
        raise ValueError(f"Unsupported export format: {export_format}")

    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
        collection = get_export_collection(connection=connection, search_set_slug=search_set_slug)
        image_assets = list_collection_image_assets(
            connection=connection,
            search_set_slug=search_set_slug,
        )
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

    export_path = (
        data_root
        / "exports"
        / search_set_slug
        / (timestamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"))
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
    rows = connection.execute(
        """
        SELECT DISTINCT
          image_assets.id,
          image_assets.provider,
          image_assets.object_id,
          image_assets.source_image_url,
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
          museum_objects.metadata_date
        FROM image_assets
        JOIN museum_objects
          ON museum_objects.provider = image_assets.provider
          AND museum_objects.object_id = image_assets.object_id
        JOIN object_matches
          ON object_matches.provider = image_assets.provider
          AND object_matches.object_id = image_assets.object_id
        JOIN collection_runs
          ON collection_runs.id = object_matches.run_id
        JOIN provider_collections
          ON provider_collections.id = collection_runs.provider_collection_id
        JOIN search_sets
          ON search_sets.id = provider_collections.search_set_id
        WHERE
          search_sets.slug = ?
          AND image_assets.provider = provider_collections.provider
          AND image_assets.imported = 1
        ORDER BY image_assets.id
        """,
        (search_set_slug,),
    ).fetchall()

    return [
        ExportImageAsset(
            image_asset_id=int(row[0]),
            provider=row[1],
            object_id=int(row[2]),
            source_image_url=row[3],
            image_role=row[4],
            image_index=row[5],
            original_width=int(row[6]),
            original_height=int(row[7]),
            standard_path=Path(row[8]),
            thumb_path=Path(row[9]),
            title=row[10],
            object_name=row[11],
            artist_display_name=row[12],
            object_url=row[13],
            rights_and_reproduction=row[14],
            metadata_date=row[15],
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
                    "scope": "collection",
                },
                "image_asset": {
                    "image_asset_id": image_asset.image_asset_id,
                    "provider": image_asset.provider,
                    "object_id": image_asset.object_id,
                    "source_image_url": image_asset.source_image_url,
                    "image_role": image_asset.image_role,
                    "image_index": image_asset.image_index,
                    "original_width": image_asset.original_width,
                    "original_height": image_asset.original_height,
                    "standard_path": standard_path,
                    "thumb_path": thumb_path,
                },
                "museum_object": {
                    "title": image_asset.title,
                    "object_name": image_asset.object_name,
                    "artist_display_name": image_asset.artist_display_name,
                    "object_url": image_asset.object_url,
                    "rights_and_reproduction": image_asset.rights_and_reproduction,
                    "metadata_date": image_asset.metadata_date,
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

    if standard_exists and thumb_exists:
        return None
    if not standard_exists and not thumb_exists:
        return "missing_standard_and_thumb_derivatives"
    if not standard_exists:
        return "missing_standard_derivative"
    return "missing_thumb_derivative"


def get_export_matches(
    *,
    connection: sqlite3.Connection,
    collection_slug: str,
    provider: str,
    object_id: int,
) -> list[ExportMatch]:
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
        (collection_slug, provider, object_id),
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
    object_id: int,
) -> list[ExportDescriptor]:
    rows = connection.execute(
        """
        SELECT provider, descriptor_type, value, normalized_value, source_field
        FROM descriptors
        WHERE provider = ? AND object_id = ?
        ORDER BY descriptor_type, value, source_field
        """,
        (provider, object_id),
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
