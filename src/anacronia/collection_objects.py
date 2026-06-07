from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.curation import ensure_collection_memberships
from anacronia.met_ingest import ensure_met_ingest_schema
from anacronia.provider_identity import (
    ProviderObjectIdValue,
    SourceObjectId,
    normalize_source_object_id,
    provider_object_id_value,
)
from anacronia.search_sets import normalize_search_term


@dataclass(frozen=True)
class CollectionObjectSummary:
    provider: str
    object_id: ProviderObjectIdValue
    title: str
    object_name: str
    artist_display_name: str
    image_count: int
    cover_image_asset_id: int
    cover_original_width: int
    cover_original_height: int
    is_favorite: bool


@dataclass(frozen=True)
class CollectionObjectMetadata:
    provider: str
    object_id: ProviderObjectIdValue
    title: str
    object_name: str
    artist_display_name: str
    artist_display_bio: str
    artist_nationality: str
    department: str
    object_date: str
    medium: str
    dimensions: str
    classification: str
    credit_line: str
    accession_number: str
    repository: str
    tags: list[str]
    object_url: str
    is_public_domain: bool
    rights_and_reproduction: str
    metadata_date: str
    is_favorite: bool


@dataclass(frozen=True)
class CollectionObjectImage:
    image_asset_id: int
    source_image_url: str
    image_role: str
    image_index: int | None
    original_width: int
    original_height: int
    is_favorite: bool


@dataclass(frozen=True)
class CollectionObjectMatch:
    search_term: str
    verified: bool
    matched_fields: list[str]


@dataclass(frozen=True)
class CollectionObjectSkippedImageReference:
    source_image_url: str
    image_role: str
    image_index: int | None
    reason: str


@dataclass(frozen=True)
class LibraryImageAssetCollection:
    slug: str
    display_name: str


@dataclass(frozen=True)
class LibraryObjectSummary:
    provider: str
    object_id: ProviderObjectIdValue
    title: str
    object_name: str
    artist_display_name: str
    image_count: int
    cover_image_asset_id: int
    cover_original_width: int
    cover_original_height: int
    is_favorite: bool
    collections: list[LibraryImageAssetCollection]


@dataclass(frozen=True)
class LibraryImageAssetSummary:
    image_asset_id: int
    provider: str
    object_id: ProviderObjectIdValue
    title: str
    object_name: str
    artist_display_name: str
    image_role: str
    image_index: int | None
    original_width: int
    original_height: int
    image_count: int
    is_favorite: bool
    collections: list[LibraryImageAssetCollection]


@dataclass(frozen=True)
class CollectionObjectDetail:
    object: CollectionObjectMetadata
    images: list[CollectionObjectImage]
    matches: list[CollectionObjectMatch]
    skipped_image_references: list[CollectionObjectSkippedImageReference]


@dataclass(frozen=True)
class CollectionResultCounts:
    objects: int
    images: int


@dataclass(frozen=True)
class CollectionProviderFacet:
    provider: str
    object_count: int
    image_count: int


@dataclass(frozen=True)
class CollectionLocalResultSet:
    query: str
    provider: str
    view: str
    counts: CollectionResultCounts
    provider_facets: list[CollectionProviderFacet]
    objects: list[CollectionObjectSummary]
    image_assets: list[LibraryImageAssetSummary]


@dataclass(frozen=True)
class LibraryLocalResultSet:
    query: str
    provider: str
    view: str
    counts: CollectionResultCounts
    provider_facets: list[CollectionProviderFacet]
    objects: list[LibraryObjectSummary]
    image_assets: list[LibraryImageAssetSummary]


def raw_string(record: dict[str, object], key: str) -> str:
    value = record.get(key)
    if isinstance(value, str):
        return value
    return ""


def raw_tags(record: dict[str, object]) -> list[str]:
    tags = record.get("tags")
    if not isinstance(tags, list):
        return []

    values: list[str] = []
    for tag in tags:
        if not isinstance(tag, dict):
            continue
        term = tag.get("term")
        if isinstance(term, str) and term:
            values.append(term)
    return values


def provider_raw_string(
    *,
    provider: str,
    record: dict[str, object],
    key: str,
) -> str:
    if provider == "vam":
        return vam_raw_string(record=record, key=key)
    return raw_string(record, key)


def provider_raw_tags(*, provider: str, record: dict[str, object]) -> list[str]:
    if provider == "vam":
        return vam_raw_tags(record)
    return raw_tags(record)


def vam_raw_string(*, record: dict[str, object], key: str) -> str:
    payload = vam_record_payload(record)
    if key == "objectDate":
        return first_nested_text(payload, ["productionDates"], ("date", "text"))
    if key == "medium":
        return raw_string(payload, "materialsAndTechniques") or ", ".join(
            text_values(payload.get("materials"))
        )
    if key == "dimensions":
        return vam_dimensions(payload)
    if key == "classification":
        return ", ".join(text_values(payload.get("categories")))
    if key == "creditLine":
        return raw_string(payload, "creditLine")
    if key == "accessionNumber":
        return raw_string(payload, "accessionNumber")
    if key == "repository":
        return "Victoria and Albert Museum"
    return raw_string(payload, key)


def vam_record_payload(record: dict[str, object]) -> dict[str, object]:
    payload = record.get("record")
    return payload if isinstance(payload, dict) else {}


def first_nested_text(
    payload: dict[str, object],
    list_path: list[str],
    key_path: tuple[str, str],
) -> str:
    items = nested_raw_value(payload, list_path)
    if not isinstance(items, list):
        return ""
    for item in items:
        if not isinstance(item, dict):
            continue
        text = nested_raw_string(item, [key_path[0], key_path[1]])
        if text:
            return text
    return ""


def nested_raw_value(value: object, path: list[str]) -> object:
    current = value
    for path_item in path:
        if not isinstance(current, dict):
            return None
        current = current.get(path_item)
    return current


def nested_raw_string(value: object, path: list[str]) -> str:
    nested = nested_raw_value(value, path)
    return nested.strip() if isinstance(nested, str) else ""


def text_values(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    values: list[str] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            values.append(text.strip())
    return values


def vam_dimensions(payload: dict[str, object]) -> str:
    dimensions = payload.get("dimensions")
    if not isinstance(dimensions, list):
        return ""
    values: list[str] = []
    for dimension in dimensions:
        if not isinstance(dimension, dict):
            continue
        name = raw_string(dimension, "dimension")
        value = raw_string(dimension, "value")
        unit = raw_string(dimension, "unit")
        if not name or not value:
            continue
        values.append(" ".join(part for part in [name, value, unit] if part))
    return "; ".join(values)


def vam_raw_tags(record: dict[str, object]) -> list[str]:
    payload = vam_record_payload(record)
    seen: set[str] = set()
    tags: list[str] = []
    for value in (
        text_values(payload.get("categories"))
        + text_values(payload.get("materials"))
        + text_values(payload.get("techniques"))
        + text_values(payload.get("styles"))
    ):
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(value)
    return tags


def load_raw_record(raw_record_path: str) -> dict[str, object]:
    try:
        data = json.loads(Path(raw_record_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    if not isinstance(data, dict):
        return {}
    return data


def normalized_local_query(query_text: str) -> str:
    return normalize_search_term(query_text)


def local_query_like_pattern(query_text: str) -> str:
    return f"%{normalized_local_query(query_text)}%"


def normalized_provider_filter(provider: str) -> str:
    provider_filter = provider.strip()
    return "" if provider_filter == "all" else provider_filter


def normalized_library_collection_filter(collection: str) -> str:
    collection_filter = collection.strip().lower()
    return "none" if collection_filter == "none" else "all"


def list_collection_objects(
    *,
    database_path: Path,
    search_set_slug: str,
    query_text: str = "",
    provider: str = "",
    favorite_only: bool = False,
) -> list[CollectionObjectSummary]:
    normalized_query = normalized_local_query(query_text)
    query_pattern = local_query_like_pattern(query_text)
    provider_filter = normalized_provider_filter(provider)

    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        rows = connection.execute(
            """
            WITH collection_image_assets AS (
              SELECT DISTINCT
                image_assets.id,
                image_assets.provider,
                image_assets.object_id,
                image_assets.image_role,
                image_assets.image_index,
                image_assets.original_width,
                image_assets.original_height,
                museum_objects.title,
                museum_objects.object_name,
                museum_objects.artist_display_name
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
                AND (? = '' OR image_assets.provider = ?)
                AND (
                  ? = ''
                  OR LOWER(image_assets.provider) LIKE ?
                  OR CAST(image_assets.object_id AS TEXT) LIKE ?
                  OR LOWER(museum_objects.title) LIKE ?
                  OR LOWER(museum_objects.object_name) LIKE ?
                  OR LOWER(museum_objects.artist_display_name) LIKE ?
                  OR EXISTS (
                    SELECT 1
                    FROM descriptors
                    WHERE
                      descriptors.provider = image_assets.provider
                      AND descriptors.object_id = image_assets.object_id
                      AND descriptors.normalized_value LIKE ?
                  )
                )
            )
            SELECT
              collection_image_assets.provider,
              collection_image_assets.object_id,
              collection_image_assets.title,
              collection_image_assets.object_name,
              collection_image_assets.artist_display_name,
              COUNT(collection_image_assets.id) AS image_count,
              (
                SELECT cover.id
                FROM collection_image_assets AS cover
                WHERE
                  cover.provider = collection_image_assets.provider
                  AND cover.object_id = collection_image_assets.object_id
                ORDER BY
                  CASE WHEN cover.image_role = 'primary' THEN 0 ELSE 1 END,
                  COALESCE(cover.image_index, 0),
                  cover.id
                LIMIT 1
              ) AS cover_image_asset_id,
              (
                SELECT cover.original_width
                FROM collection_image_assets AS cover
                WHERE
                  cover.provider = collection_image_assets.provider
                  AND cover.object_id = collection_image_assets.object_id
                ORDER BY
                  CASE WHEN cover.image_role = 'primary' THEN 0 ELSE 1 END,
                  COALESCE(cover.image_index, 0),
                  cover.id
                LIMIT 1
              ) AS cover_original_width,
              (
                SELECT cover.original_height
                FROM collection_image_assets AS cover
                WHERE
                  cover.provider = collection_image_assets.provider
                  AND cover.object_id = collection_image_assets.object_id
                ORDER BY
                  CASE WHEN cover.image_role = 'primary' THEN 0 ELSE 1 END,
                  COALESCE(cover.image_index, 0),
                  cover.id
                LIMIT 1
              ) AS cover_original_height,
              EXISTS (
                SELECT 1
                FROM object_favorites
                WHERE
                  object_favorites.provider = collection_image_assets.provider
                  AND object_favorites.object_id = collection_image_assets.object_id
              ) AS is_favorite,
              MAX(collection_image_assets.id) AS latest_image_asset_id
            FROM collection_image_assets
            WHERE
              ? = 0
              OR EXISTS (
                SELECT 1
                FROM object_favorites
                WHERE
                  object_favorites.provider = collection_image_assets.provider
                  AND object_favorites.object_id = collection_image_assets.object_id
              )
            GROUP BY
              collection_image_assets.provider,
              collection_image_assets.object_id,
              collection_image_assets.title,
              collection_image_assets.object_name,
              collection_image_assets.artist_display_name
            ORDER BY latest_image_asset_id DESC
            """,
            (
                search_set_slug,
                provider_filter,
                provider_filter,
                normalized_query,
                query_pattern,
                query_pattern,
                query_pattern,
                query_pattern,
                query_pattern,
                query_pattern,
                1 if favorite_only else 0,
            ),
        ).fetchall()

    return [
        CollectionObjectSummary(
            provider=row[0],
            object_id=provider_object_id_value(provider=row[0], value=row[1]),
            title=row[2],
            object_name=row[3],
            artist_display_name=row[4],
            image_count=int(row[5]),
            cover_image_asset_id=int(row[6]),
            cover_original_width=int(row[7]),
            cover_original_height=int(row[8]),
            is_favorite=bool(row[9]),
        )
        for row in rows
    ]


def list_library_image_assets(
    *,
    database_path: Path,
    filter_text: str = "",
    favorite_only: bool = False,
    collection: str = "all",
) -> list[LibraryImageAssetSummary]:
    collection_filter = normalized_library_collection_filter(collection)
    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        rows = connection.execute(
            """
            SELECT DISTINCT
              image_assets.id,
              image_assets.provider,
              image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name,
              image_assets.image_role,
              image_assets.image_index,
              image_assets.original_width,
              image_assets.original_height,
              (
                SELECT COUNT(*)
                FROM image_assets AS sibling_image_assets
                WHERE
                  sibling_image_assets.provider = image_assets.provider
                  AND sibling_image_assets.object_id = image_assets.object_id
                  AND sibling_image_assets.imported = 1
                  AND sibling_image_assets.active = 1
              ) AS image_count,
              EXISTS (
                SELECT 1
                FROM image_asset_favorites
                WHERE
                  image_asset_favorites.provider = image_assets.provider
                  AND image_asset_favorites.object_id = image_assets.object_id
                  AND image_asset_favorites.source_image_url = image_assets.source_image_url
              ) AS is_favorite,
              search_sets.id AS search_set_id,
              search_sets.slug,
              search_sets.display_name
            FROM image_assets
            JOIN museum_objects
              ON museum_objects.provider = image_assets.provider
              AND museum_objects.object_id = image_assets.object_id
            LEFT JOIN collection_image_asset_memberships
              ON collection_image_asset_memberships.provider = image_assets.provider
              AND collection_image_asset_memberships.object_id = image_assets.object_id
              AND collection_image_asset_memberships.source_image_url = image_assets.source_image_url
              AND collection_image_asset_memberships.active = 1
            LEFT JOIN collection_object_memberships
              ON collection_object_memberships.search_set_id = collection_image_asset_memberships.search_set_id
              AND collection_object_memberships.provider = image_assets.provider
              AND collection_object_memberships.object_id = image_assets.object_id
              AND collection_object_memberships.active = 1
            LEFT JOIN search_sets
              ON search_sets.id = collection_image_asset_memberships.search_set_id
              AND collection_object_memberships.id IS NOT NULL
            WHERE
              image_assets.imported = 1
              AND image_assets.active = 1
              AND museum_objects.active = 1
              AND (
                ? = 0
                OR EXISTS (
                  SELECT 1
                  FROM image_asset_favorites
                  WHERE
                    image_asset_favorites.provider = image_assets.provider
                    AND image_asset_favorites.object_id = image_assets.object_id
                    AND image_asset_favorites.source_image_url = image_assets.source_image_url
                )
              )
            ORDER BY image_assets.id DESC, search_set_id
            """
            ,
            (1 if favorite_only else 0,),
        ).fetchall()

    image_assets: dict[int, LibraryImageAssetSummary] = {}
    seen_collections: dict[int, set[str]] = {}
    for row in rows:
        image_asset_id = int(row[0])
        if image_asset_id not in image_assets:
            image_assets[image_asset_id] = LibraryImageAssetSummary(
                image_asset_id=image_asset_id,
                provider=row[1],
                object_id=provider_object_id_value(provider=row[1], value=row[2]),
                title=row[3],
                object_name=row[4],
                artist_display_name=row[5],
                image_role=row[6],
                image_index=row[7],
                original_width=int(row[8]),
                original_height=int(row[9]),
                image_count=int(row[10]),
                is_favorite=bool(row[11]),
                collections=[],
            )
            seen_collections[image_asset_id] = set()

        collection_slug = row[13]
        if collection_slug is None or collection_slug in seen_collections[image_asset_id]:
            continue

        image_assets[image_asset_id].collections.append(
            LibraryImageAssetCollection(
                slug=collection_slug,
                display_name=row[14],
            )
        )
        seen_collections[image_asset_id].add(collection_slug)

    return [
        image_asset
        for image_asset in image_assets.values()
        if (
            collection_filter == "all"
            or (collection_filter == "none" and not image_asset.collections)
        )
        if library_image_asset_matches_filter(
            image_asset=image_asset,
            filter_text=filter_text,
        )
    ]


def list_collection_image_assets(
    *,
    database_path: Path,
    search_set_slug: str,
    query_text: str = "",
    provider: str = "",
    favorite_only: bool = False,
) -> list[LibraryImageAssetSummary]:
    normalized_query = normalized_local_query(query_text)
    query_pattern = local_query_like_pattern(query_text)
    provider_filter = normalized_provider_filter(provider)

    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        rows = connection.execute(
            """
            SELECT DISTINCT
              image_assets.id,
              image_assets.provider,
              image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name,
              image_assets.image_role,
              image_assets.image_index,
              image_assets.original_width,
              image_assets.original_height,
              (
                SELECT COUNT(*)
                FROM image_assets AS sibling_image_assets
                JOIN collection_image_asset_memberships AS sibling_image_memberships
                  ON sibling_image_memberships.provider = sibling_image_assets.provider
                  AND sibling_image_memberships.object_id = sibling_image_assets.object_id
                  AND sibling_image_memberships.source_image_url = sibling_image_assets.source_image_url
                  AND sibling_image_memberships.search_set_id = search_sets.id
                  AND sibling_image_memberships.active = 1
                JOIN collection_object_memberships AS sibling_object_memberships
                  ON sibling_object_memberships.provider = sibling_image_assets.provider
                  AND sibling_object_memberships.object_id = sibling_image_assets.object_id
                  AND sibling_object_memberships.search_set_id = search_sets.id
                  AND sibling_object_memberships.active = 1
                WHERE
                  sibling_image_assets.provider = image_assets.provider
                  AND sibling_image_assets.object_id = image_assets.object_id
                  AND sibling_image_assets.imported = 1
                  AND sibling_image_assets.active = 1
              ) AS image_count,
              EXISTS (
                SELECT 1
                FROM image_asset_favorites
                WHERE
                  image_asset_favorites.provider = image_assets.provider
                  AND image_asset_favorites.object_id = image_assets.object_id
                  AND image_asset_favorites.source_image_url = image_assets.source_image_url
              ) AS is_favorite,
              search_sets.slug,
              search_sets.display_name
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
              AND (? = '' OR image_assets.provider = ?)
              AND (
                ? = 0
                OR EXISTS (
                  SELECT 1
                  FROM image_asset_favorites
                  WHERE
                    image_asset_favorites.provider = image_assets.provider
                    AND image_asset_favorites.object_id = image_assets.object_id
                    AND image_asset_favorites.source_image_url = image_assets.source_image_url
                )
              )
              AND (
                ? = ''
                OR LOWER(image_assets.provider) LIKE ?
                OR CAST(image_assets.object_id AS TEXT) LIKE ?
                OR LOWER(museum_objects.title) LIKE ?
                OR LOWER(museum_objects.object_name) LIKE ?
                OR LOWER(museum_objects.artist_display_name) LIKE ?
                OR EXISTS (
                  SELECT 1
                  FROM descriptors
                  WHERE
                    descriptors.provider = image_assets.provider
                    AND descriptors.object_id = image_assets.object_id
                    AND descriptors.normalized_value LIKE ?
                )
              )
            ORDER BY image_assets.id DESC
            """,
            (
                search_set_slug,
                provider_filter,
                provider_filter,
                1 if favorite_only else 0,
                normalized_query,
                query_pattern,
                query_pattern,
                query_pattern,
                query_pattern,
                query_pattern,
                query_pattern,
            ),
        ).fetchall()

    return [
        LibraryImageAssetSummary(
            image_asset_id=int(row[0]),
            provider=row[1],
            object_id=provider_object_id_value(provider=row[1], value=row[2]),
            title=row[3],
            object_name=row[4],
            artist_display_name=row[5],
            image_role=row[6],
            image_index=row[7],
            original_width=int(row[8]),
            original_height=int(row[9]),
            image_count=int(row[10]),
            is_favorite=bool(row[11]),
            collections=[
                LibraryImageAssetCollection(
                    slug=row[12],
                    display_name=row[13],
                )
            ],
        )
        for row in rows
    ]


def create_collection_provider_facets(
    image_assets: list[LibraryImageAssetSummary],
) -> list[CollectionProviderFacet]:
    image_counts_by_provider: dict[str, int] = {}
    object_keys_by_provider: dict[str, set[tuple[str, ProviderObjectIdValue]]] = {}

    for image_asset in image_assets:
        image_counts_by_provider[image_asset.provider] = (
            image_counts_by_provider.get(image_asset.provider, 0) + 1
        )
        object_keys_by_provider.setdefault(image_asset.provider, set()).add(
            (image_asset.provider, image_asset.object_id)
        )

    return [
        CollectionProviderFacet(
            provider=provider,
            object_count=len(object_keys_by_provider.get(provider, set())),
            image_count=image_counts_by_provider[provider],
        )
        for provider in sorted(image_counts_by_provider)
    ]


def get_collection_local_result_set(
    *,
    database_path: Path,
    search_set_slug: str,
    query_text: str = "",
    provider: str = "all",
    view: str = "objects",
    favorite_only: bool = False,
) -> CollectionLocalResultSet:
    query = normalized_local_query(query_text)
    provider_filter = normalized_provider_filter(provider)
    selected_provider = provider_filter or "all"
    all_query_objects = list_collection_objects(
        database_path=database_path,
        search_set_slug=search_set_slug,
        query_text=query,
        favorite_only=favorite_only,
    )
    all_query_image_assets = list_collection_image_assets(
        database_path=database_path,
        search_set_slug=search_set_slug,
        query_text=query,
        favorite_only=favorite_only,
    )

    if provider_filter:
        objects = [
            collection_object
            for collection_object in all_query_objects
            if collection_object.provider == provider_filter
        ]
        image_assets = [
            image_asset
            for image_asset in all_query_image_assets
            if image_asset.provider == provider_filter
        ]
    else:
        objects = all_query_objects
        image_assets = all_query_image_assets

    return CollectionLocalResultSet(
        query=query,
        provider=selected_provider,
        view=view,
        counts=CollectionResultCounts(
            objects=len(all_query_objects),
            images=len(all_query_image_assets),
        ),
        provider_facets=create_collection_provider_facets(all_query_image_assets),
        objects=objects,
        image_assets=image_assets,
    )


def get_library_local_result_set(
    *,
    database_path: Path,
    query_text: str = "",
    provider: str = "all",
    view: str = "images",
    favorite_only: bool = False,
    collection: str = "all",
) -> LibraryLocalResultSet:
    query = normalized_local_query(query_text)
    provider_filter = normalized_provider_filter(provider)
    selected_provider = provider_filter or "all"
    all_query_objects = list_library_objects(
        database_path=database_path,
        filter_text=query,
        favorite_only=favorite_only,
        collection=collection,
    )
    all_query_image_assets = list_library_image_assets(
        database_path=database_path,
        filter_text=query,
        favorite_only=favorite_only,
        collection=collection,
    )

    if provider_filter:
        objects = [
            library_object
            for library_object in all_query_objects
            if library_object.provider == provider_filter
        ]
        image_assets = [
            image_asset
            for image_asset in all_query_image_assets
            if image_asset.provider == provider_filter
        ]
    else:
        objects = all_query_objects
        image_assets = all_query_image_assets

    return LibraryLocalResultSet(
        query=query,
        provider=selected_provider,
        view=view,
        counts=CollectionResultCounts(
            objects=len(all_query_objects),
            images=len(all_query_image_assets),
        ),
        provider_facets=create_collection_provider_facets(all_query_image_assets),
        objects=objects,
        image_assets=image_assets,
    )


def list_library_objects(
    *,
    database_path: Path,
    filter_text: str = "",
    favorite_only: bool = False,
    collection: str = "all",
) -> list[LibraryObjectSummary]:
    collection_filter = normalized_library_collection_filter(collection)
    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        object_rows = connection.execute(
            """
            WITH imported_image_assets AS (
              SELECT
                id,
                provider,
                object_id,
                image_role,
                image_index,
                original_width,
                original_height
              FROM image_assets
              WHERE imported = 1 AND active = 1
            )
            SELECT
              imported_image_assets.provider,
              imported_image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name,
              COUNT(imported_image_assets.id) AS image_count,
              (
                SELECT cover.id
                FROM imported_image_assets AS cover
                WHERE
                  cover.provider = imported_image_assets.provider
                  AND cover.object_id = imported_image_assets.object_id
                ORDER BY
                  CASE WHEN cover.image_role = 'primary' THEN 0 ELSE 1 END,
                  COALESCE(cover.image_index, 0),
                  cover.id
                LIMIT 1
              ) AS cover_image_asset_id,
              (
                SELECT cover.original_width
                FROM imported_image_assets AS cover
                WHERE
                  cover.provider = imported_image_assets.provider
                  AND cover.object_id = imported_image_assets.object_id
                ORDER BY
                  CASE WHEN cover.image_role = 'primary' THEN 0 ELSE 1 END,
                  COALESCE(cover.image_index, 0),
                  cover.id
                LIMIT 1
              ) AS cover_original_width,
              (
                SELECT cover.original_height
                FROM imported_image_assets AS cover
                WHERE
                  cover.provider = imported_image_assets.provider
                  AND cover.object_id = imported_image_assets.object_id
                ORDER BY
                  CASE WHEN cover.image_role = 'primary' THEN 0 ELSE 1 END,
                  COALESCE(cover.image_index, 0),
                  cover.id
                LIMIT 1
              ) AS cover_original_height,
              EXISTS (
                SELECT 1
                FROM object_favorites
                WHERE
                  object_favorites.provider = imported_image_assets.provider
                  AND object_favorites.object_id = imported_image_assets.object_id
              ) AS is_favorite,
              MAX(imported_image_assets.id) AS latest_image_asset_id
            FROM imported_image_assets
            JOIN museum_objects
              ON museum_objects.provider = imported_image_assets.provider
              AND museum_objects.object_id = imported_image_assets.object_id
            WHERE museum_objects.active = 1
            GROUP BY
              imported_image_assets.provider,
              imported_image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name
            HAVING
              ? = 0
              OR is_favorite = 1
            ORDER BY latest_image_asset_id DESC
            """
            ,
            (1 if favorite_only else 0,),
        ).fetchall()
        collection_rows = connection.execute(
            """
            SELECT DISTINCT
              image_assets.provider,
              image_assets.object_id,
              search_sets.slug,
              search_sets.display_name
            FROM image_assets
            JOIN collection_image_asset_memberships
              ON collection_image_asset_memberships.provider = image_assets.provider
              AND collection_image_asset_memberships.object_id = image_assets.object_id
              AND collection_image_asset_memberships.source_image_url = image_assets.source_image_url
              AND collection_image_asset_memberships.active = 1
            JOIN collection_object_memberships
              ON collection_object_memberships.search_set_id = collection_image_asset_memberships.search_set_id
              AND collection_object_memberships.provider = image_assets.provider
              AND collection_object_memberships.object_id = image_assets.object_id
              AND collection_object_memberships.active = 1
            JOIN search_sets
              ON search_sets.id = collection_image_asset_memberships.search_set_id
            WHERE image_assets.imported = 1 AND image_assets.active = 1
            ORDER BY
              image_assets.provider,
              image_assets.object_id,
              search_sets.display_name
            """
        ).fetchall()

    collections_by_object: dict[tuple[str, ProviderObjectIdValue], list[LibraryImageAssetCollection]] = {}
    for row in collection_rows:
        key = (row[0], provider_object_id_value(provider=row[0], value=row[1]))
        collections_by_object.setdefault(key, []).append(
            LibraryImageAssetCollection(
                slug=row[2],
                display_name=row[3],
            )
        )

    library_objects = [
        LibraryObjectSummary(
            provider=row[0],
            object_id=provider_object_id_value(provider=row[0], value=row[1]),
            title=row[2],
            object_name=row[3],
            artist_display_name=row[4],
            image_count=int(row[5]),
            cover_image_asset_id=int(row[6]),
            cover_original_width=int(row[7]),
            cover_original_height=int(row[8]),
            is_favorite=bool(row[9]),
            collections=collections_by_object.get(
                (row[0], provider_object_id_value(provider=row[0], value=row[1])),
                [],
            ),
        )
        for row in object_rows
    ]

    return [
        library_object
        for library_object in library_objects
        if (
            collection_filter == "all"
            or (collection_filter == "none" and not library_object.collections)
        )
        if library_object_matches_filter(
            library_object=library_object,
            filter_text=filter_text,
        )
    ]


def library_image_asset_matches_filter(
    *,
    image_asset: LibraryImageAssetSummary,
    filter_text: str,
) -> bool:
    normalized_filter = filter_text.strip().lower()
    if normalized_filter == "":
        return True

    haystack = " ".join(
        [
            image_asset.provider,
            str(image_asset.object_id),
            image_asset.title,
            image_asset.object_name,
            image_asset.artist_display_name,
            image_asset.image_role,
            "No Collection" if not image_asset.collections else "",
            *(
                f"{collection.display_name} {collection.slug}"
                for collection in image_asset.collections
            ),
        ]
    ).lower()
    return normalized_filter in haystack


def library_object_matches_filter(
    *,
    library_object: LibraryObjectSummary,
    filter_text: str,
) -> bool:
    normalized_filter = filter_text.strip().lower()
    if normalized_filter == "":
        return True

    haystack = " ".join(
        [
            library_object.provider,
            str(library_object.object_id),
            library_object.title,
            library_object.object_name,
            library_object.artist_display_name,
            "No Collection" if not library_object.collections else "",
            *(
                f"{collection.display_name} {collection.slug}"
                for collection in library_object.collections
            ),
        ]
    ).lower()
    return normalized_filter in haystack


def get_collection_object_detail(
    *,
    database_path: Path,
    search_set_slug: str,
    provider: str,
    object_id: SourceObjectId | int,
) -> CollectionObjectDetail | None:
    source_object_id = normalize_source_object_id(object_id)
    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        object_row = connection.execute(
            """
            SELECT DISTINCT
              museum_objects.provider,
              museum_objects.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name,
              museum_objects.object_url,
              museum_objects.is_public_domain,
              museum_objects.rights_and_reproduction,
              museum_objects.metadata_date,
              museum_objects.raw_record_path,
              EXISTS (
                SELECT 1
                FROM object_favorites
                WHERE
                  object_favorites.provider = museum_objects.provider
                  AND object_favorites.object_id = museum_objects.object_id
              ) AS is_favorite
            FROM museum_objects
            JOIN search_sets
              ON search_sets.slug = ?
            JOIN collection_object_memberships
              ON collection_object_memberships.search_set_id = search_sets.id
              AND collection_object_memberships.provider = museum_objects.provider
              AND collection_object_memberships.object_id = museum_objects.object_id
              AND collection_object_memberships.active = 1
            JOIN image_assets
              ON image_assets.provider = museum_objects.provider
              AND image_assets.object_id = museum_objects.object_id
            JOIN collection_image_asset_memberships
              ON collection_image_asset_memberships.search_set_id = search_sets.id
              AND collection_image_asset_memberships.provider = image_assets.provider
              AND collection_image_asset_memberships.object_id = image_assets.object_id
              AND collection_image_asset_memberships.source_image_url = image_assets.source_image_url
              AND collection_image_asset_memberships.active = 1
            WHERE
              museum_objects.provider = ?
              AND museum_objects.object_id = ?
              AND museum_objects.active = 1
              AND image_assets.imported = 1
              AND image_assets.active = 1
            """,
            (search_set_slug, provider, source_object_id),
        ).fetchone()
        if object_row is None:
            return None
        raw_record = load_raw_record(str(object_row[9]))

        image_rows = connection.execute(
            """
            SELECT DISTINCT
              image_assets.id,
              image_assets.source_image_url,
              image_assets.image_role,
              image_assets.image_index,
              image_assets.original_width,
              image_assets.original_height,
              EXISTS (
                SELECT 1
                FROM image_asset_favorites
                WHERE
                  image_asset_favorites.provider = image_assets.provider
                  AND image_asset_favorites.object_id = image_assets.object_id
                  AND image_asset_favorites.source_image_url = image_assets.source_image_url
              ) AS is_favorite
            FROM image_assets
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
              image_assets.provider = ?
              AND image_assets.object_id = ?
              AND image_assets.imported = 1
              AND image_assets.active = 1
            ORDER BY
              CASE WHEN image_assets.image_role = 'primary' THEN 0 ELSE 1 END,
              COALESCE(image_assets.image_index, 0),
              image_assets.id
            """,
            (search_set_slug, provider, source_object_id),
        ).fetchall()

        match_rows = connection.execute(
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
            (search_set_slug, provider, source_object_id),
        ).fetchall()

        skipped_rows = connection.execute(
            """
            SELECT source_image_url, image_role, image_index, reason
            FROM skipped_image_references
            WHERE provider = ? AND object_id = ?
            ORDER BY
              CASE WHEN image_role = 'primary' THEN 0 ELSE 1 END,
              COALESCE(image_index, 0),
              source_image_url,
              reason
            """,
            (provider, source_object_id),
        ).fetchall()

    return CollectionObjectDetail(
        object=CollectionObjectMetadata(
            provider=object_row[0],
            object_id=provider_object_id_value(
                provider=object_row[0],
                value=object_row[1],
            ),
            title=object_row[2],
            object_name=object_row[3],
            artist_display_name=object_row[4],
            object_url=object_row[5],
            artist_display_bio=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="artistDisplayBio",
            ),
            artist_nationality=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="artistNationality",
            ),
            department=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="department",
            ),
            object_date=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="objectDate",
            ),
            medium=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="medium",
            ),
            dimensions=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="dimensions",
            ),
            classification=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="classification",
            ),
            credit_line=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="creditLine",
            ),
            accession_number=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="accessionNumber",
            ),
            repository=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="repository",
            ),
            tags=provider_raw_tags(provider=object_row[0], record=raw_record),
            is_public_domain=bool(object_row[6]),
            rights_and_reproduction=object_row[7],
            metadata_date=object_row[8],
            is_favorite=bool(object_row[10]),
        ),
        images=[
            CollectionObjectImage(
                image_asset_id=int(row[0]),
                source_image_url=row[1],
                image_role=row[2],
                image_index=row[3],
                original_width=int(row[4]),
                original_height=int(row[5]),
                is_favorite=bool(row[6]),
            )
            for row in image_rows
        ],
        matches=[
            CollectionObjectMatch(
                search_term=row[0],
                verified=bool(row[1]),
                matched_fields=json.loads(row[2]),
            )
            for row in match_rows
        ],
        skipped_image_references=[
            CollectionObjectSkippedImageReference(
                source_image_url=row[0],
                image_role=row[1],
                image_index=row[2],
                reason=row[3],
            )
            for row in skipped_rows
        ],
    )


def get_library_object_detail(
    *,
    database_path: Path,
    provider: str,
    object_id: SourceObjectId | int,
) -> CollectionObjectDetail | None:
    source_object_id = normalize_source_object_id(object_id)
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
        object_row = connection.execute(
            """
            SELECT DISTINCT
              museum_objects.provider,
              museum_objects.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name,
              museum_objects.object_url,
              museum_objects.is_public_domain,
              museum_objects.rights_and_reproduction,
              museum_objects.metadata_date,
              museum_objects.raw_record_path,
              EXISTS (
                SELECT 1
                FROM object_favorites
                WHERE
                  object_favorites.provider = museum_objects.provider
                  AND object_favorites.object_id = museum_objects.object_id
              ) AS is_favorite
            FROM museum_objects
            JOIN image_assets
              ON image_assets.provider = museum_objects.provider
              AND image_assets.object_id = museum_objects.object_id
            WHERE
              museum_objects.provider = ?
              AND museum_objects.object_id = ?
              AND museum_objects.active = 1
              AND image_assets.imported = 1
              AND image_assets.active = 1
            """,
            (provider, source_object_id),
        ).fetchone()
        if object_row is None:
            return None
        raw_record = load_raw_record(str(object_row[9]))

        image_rows = connection.execute(
            """
            SELECT DISTINCT
              image_assets.id,
              image_assets.source_image_url,
              image_assets.image_role,
              image_assets.image_index,
              image_assets.original_width,
              image_assets.original_height,
              EXISTS (
                SELECT 1
                FROM image_asset_favorites
                WHERE
                  image_asset_favorites.provider = image_assets.provider
                  AND image_asset_favorites.object_id = image_assets.object_id
                  AND image_asset_favorites.source_image_url = image_assets.source_image_url
              ) AS is_favorite
            FROM image_assets
            WHERE
              image_assets.provider = ?
              AND image_assets.object_id = ?
              AND image_assets.imported = 1
              AND image_assets.active = 1
            ORDER BY
              CASE WHEN image_assets.image_role = 'primary' THEN 0 ELSE 1 END,
              COALESCE(image_assets.image_index, 0),
              image_assets.id
            """,
            (provider, source_object_id),
        ).fetchall()

        match_rows = connection.execute(
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

        skipped_rows = connection.execute(
            """
            SELECT source_image_url, image_role, image_index, reason
            FROM skipped_image_references
            WHERE provider = ? AND object_id = ?
            ORDER BY
              CASE WHEN image_role = 'primary' THEN 0 ELSE 1 END,
              COALESCE(image_index, 0),
              source_image_url,
              reason
            """,
            (provider, source_object_id),
        ).fetchall()

    return CollectionObjectDetail(
        object=CollectionObjectMetadata(
            provider=object_row[0],
            object_id=provider_object_id_value(
                provider=object_row[0],
                value=object_row[1],
            ),
            title=object_row[2],
            object_name=object_row[3],
            artist_display_name=object_row[4],
            object_url=object_row[5],
            artist_display_bio=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="artistDisplayBio",
            ),
            artist_nationality=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="artistNationality",
            ),
            department=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="department",
            ),
            object_date=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="objectDate",
            ),
            medium=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="medium",
            ),
            dimensions=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="dimensions",
            ),
            classification=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="classification",
            ),
            credit_line=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="creditLine",
            ),
            accession_number=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="accessionNumber",
            ),
            repository=provider_raw_string(
                provider=object_row[0],
                record=raw_record,
                key="repository",
            ),
            tags=provider_raw_tags(provider=object_row[0], record=raw_record),
            is_public_domain=bool(object_row[6]),
            rights_and_reproduction=object_row[7],
            metadata_date=object_row[8],
            is_favorite=bool(object_row[10]),
        ),
        images=[
            CollectionObjectImage(
                image_asset_id=int(row[0]),
                source_image_url=row[1],
                image_role=row[2],
                image_index=row[3],
                original_width=int(row[4]),
                original_height=int(row[5]),
                is_favorite=bool(row[6]),
            )
            for row in image_rows
        ],
        matches=[
            CollectionObjectMatch(
                search_term=row[0],
                verified=bool(row[1]),
                matched_fields=json.loads(row[2]),
            )
            for row in match_rows
        ],
        skipped_image_references=[
            CollectionObjectSkippedImageReference(
                source_image_url=row[0],
                image_role=row[1],
                image_index=row[2],
                reason=row[3],
            )
            for row in skipped_rows
        ],
    )


def get_image_asset_derivative_path(
    *,
    database_path: Path,
    image_asset_id: int,
    derivative: str,
) -> Path | None:
    if derivative not in {"standard", "thumb"}:
        return None

    column = "standard_path" if derivative == "standard" else "thumb_path"
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        row = connection.execute(
            f"""
            SELECT {column}
            FROM image_assets
            WHERE id = ? AND imported = 1
            """,
            (image_asset_id,),
        ).fetchone()

    return None if row is None else Path(row[0])
