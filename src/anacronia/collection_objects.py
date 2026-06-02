from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.met_ingest import ensure_met_ingest_schema
from anacronia.search_sets import normalize_search_term


@dataclass(frozen=True)
class CollectionObjectSummary:
    provider: str
    object_id: int
    title: str
    object_name: str
    artist_display_name: str
    image_count: int
    cover_image_asset_id: int
    cover_original_width: int
    cover_original_height: int


@dataclass(frozen=True)
class CollectionObjectMetadata:
    provider: str
    object_id: int
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


@dataclass(frozen=True)
class CollectionObjectImage:
    image_asset_id: int
    source_image_url: str
    image_role: str
    image_index: int | None
    original_width: int
    original_height: int


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
    object_id: int
    title: str
    object_name: str
    artist_display_name: str
    image_count: int
    cover_image_asset_id: int
    cover_original_width: int
    cover_original_height: int
    collections: list[LibraryImageAssetCollection]


@dataclass(frozen=True)
class LibraryImageAssetSummary:
    image_asset_id: int
    provider: str
    object_id: int
    title: str
    object_name: str
    artist_display_name: str
    image_role: str
    image_index: int | None
    original_width: int
    original_height: int
    image_count: int
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


def list_collection_objects(
    *,
    database_path: Path,
    search_set_slug: str,
    query_text: str = "",
    provider: str = "",
) -> list[CollectionObjectSummary]:
    normalized_query = normalized_local_query(query_text)
    query_pattern = local_query_like_pattern(query_text)
    provider_filter = normalized_provider_filter(provider)

    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
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
              MAX(collection_image_assets.id) AS latest_image_asset_id
            FROM collection_image_assets
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
            ),
        ).fetchall()

    return [
        CollectionObjectSummary(
            provider=row[0],
            object_id=int(row[1]),
            title=row[2],
            object_name=row[3],
            artist_display_name=row[4],
            image_count=int(row[5]),
            cover_image_asset_id=int(row[6]),
            cover_original_width=int(row[7]),
            cover_original_height=int(row[8]),
        )
        for row in rows
    ]


def list_library_image_assets(
    *,
    database_path: Path,
    filter_text: str = "",
) -> list[LibraryImageAssetSummary]:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
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
              ) AS image_count,
              search_sets.id AS search_set_id,
              search_sets.slug,
              search_sets.display_name
            FROM image_assets
            JOIN museum_objects
              ON museum_objects.provider = image_assets.provider
              AND museum_objects.object_id = image_assets.object_id
            LEFT JOIN object_matches
              ON object_matches.provider = image_assets.provider
              AND object_matches.object_id = image_assets.object_id
            LEFT JOIN collection_runs
              ON collection_runs.id = object_matches.run_id
            LEFT JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
              AND provider_collections.provider = image_assets.provider
            LEFT JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE image_assets.imported = 1
            ORDER BY image_assets.id DESC, search_set_id
            """
        ).fetchall()

    image_assets: dict[int, LibraryImageAssetSummary] = {}
    seen_collections: dict[int, set[str]] = {}
    for row in rows:
        image_asset_id = int(row[0])
        if image_asset_id not in image_assets:
            image_assets[image_asset_id] = LibraryImageAssetSummary(
                image_asset_id=image_asset_id,
                provider=row[1],
                object_id=int(row[2]),
                title=row[3],
                object_name=row[4],
                artist_display_name=row[5],
                image_role=row[6],
                image_index=row[7],
                original_width=int(row[8]),
                original_height=int(row[9]),
                image_count=int(row[10]),
                collections=[],
            )
            seen_collections[image_asset_id] = set()

        collection_slug = row[12]
        if collection_slug is None or collection_slug in seen_collections[image_asset_id]:
            continue

        image_assets[image_asset_id].collections.append(
            LibraryImageAssetCollection(
                slug=collection_slug,
                display_name=row[13],
            )
        )
        seen_collections[image_asset_id].add(collection_slug)

    return [
        image_asset
        for image_asset in image_assets.values()
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
) -> list[LibraryImageAssetSummary]:
    normalized_query = normalized_local_query(query_text)
    query_pattern = local_query_like_pattern(query_text)
    provider_filter = normalized_provider_filter(provider)

    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
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
              ) AS image_count,
              search_sets.slug,
              search_sets.display_name
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
              AND provider_collections.provider = image_assets.provider
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE
              search_sets.slug = ?
              AND image_assets.imported = 1
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
            ORDER BY image_assets.id DESC
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
            ),
        ).fetchall()

    return [
        LibraryImageAssetSummary(
            image_asset_id=int(row[0]),
            provider=row[1],
            object_id=int(row[2]),
            title=row[3],
            object_name=row[4],
            artist_display_name=row[5],
            image_role=row[6],
            image_index=row[7],
            original_width=int(row[8]),
            original_height=int(row[9]),
            image_count=int(row[10]),
            collections=[
                LibraryImageAssetCollection(
                    slug=row[11],
                    display_name=row[12],
                )
            ],
        )
        for row in rows
    ]


def create_collection_provider_facets(
    image_assets: list[LibraryImageAssetSummary],
) -> list[CollectionProviderFacet]:
    image_counts_by_provider: dict[str, int] = {}
    object_keys_by_provider: dict[str, set[tuple[str, int]]] = {}

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
) -> CollectionLocalResultSet:
    query = normalized_local_query(query_text)
    provider_filter = normalized_provider_filter(provider)
    selected_provider = provider_filter or "all"
    all_query_objects = list_collection_objects(
        database_path=database_path,
        search_set_slug=search_set_slug,
        query_text=query,
    )
    all_query_image_assets = list_collection_image_assets(
        database_path=database_path,
        search_set_slug=search_set_slug,
        query_text=query,
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
) -> LibraryLocalResultSet:
    query = normalized_local_query(query_text)
    provider_filter = normalized_provider_filter(provider)
    selected_provider = provider_filter or "all"
    all_query_objects = list_library_objects(
        database_path=database_path,
        filter_text=query,
    )
    all_query_image_assets = list_library_image_assets(
        database_path=database_path,
        filter_text=query,
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
) -> list[LibraryObjectSummary]:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        ensure_met_ingest_schema(connection)
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
              WHERE imported = 1
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
              MAX(imported_image_assets.id) AS latest_image_asset_id
            FROM imported_image_assets
            JOIN museum_objects
              ON museum_objects.provider = imported_image_assets.provider
              AND museum_objects.object_id = imported_image_assets.object_id
            GROUP BY
              imported_image_assets.provider,
              imported_image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name
            ORDER BY latest_image_asset_id DESC
            """
        ).fetchall()
        collection_rows = connection.execute(
            """
            SELECT DISTINCT
              image_assets.provider,
              image_assets.object_id,
              search_sets.slug,
              search_sets.display_name
            FROM image_assets
            JOIN object_matches
              ON object_matches.provider = image_assets.provider
              AND object_matches.object_id = image_assets.object_id
            JOIN collection_runs
              ON collection_runs.id = object_matches.run_id
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
              AND provider_collections.provider = image_assets.provider
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE image_assets.imported = 1
            ORDER BY
              image_assets.provider,
              image_assets.object_id,
              search_sets.display_name
            """
        ).fetchall()

    collections_by_object: dict[tuple[str, int], list[LibraryImageAssetCollection]] = {}
    for row in collection_rows:
        key = (row[0], int(row[1]))
        collections_by_object.setdefault(key, []).append(
            LibraryImageAssetCollection(
                slug=row[2],
                display_name=row[3],
            )
        )

    library_objects = [
        LibraryObjectSummary(
            provider=row[0],
            object_id=int(row[1]),
            title=row[2],
            object_name=row[3],
            artist_display_name=row[4],
            image_count=int(row[5]),
            cover_image_asset_id=int(row[6]),
            cover_original_width=int(row[7]),
            cover_original_height=int(row[8]),
            collections=collections_by_object.get((row[0], int(row[1])), []),
        )
        for row in object_rows
    ]

    return [
        library_object
        for library_object in library_objects
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
    object_id: int,
) -> CollectionObjectDetail | None:
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
              museum_objects.raw_record_path
            FROM museum_objects
            JOIN image_assets
              ON image_assets.provider = museum_objects.provider
              AND image_assets.object_id = museum_objects.object_id
            JOIN object_matches
              ON object_matches.provider = museum_objects.provider
              AND object_matches.object_id = museum_objects.object_id
            JOIN collection_runs
              ON collection_runs.id = object_matches.run_id
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE
              search_sets.slug = ?
              AND museum_objects.provider = ?
              AND museum_objects.object_id = ?
              AND image_assets.provider = provider_collections.provider
              AND image_assets.imported = 1
            """,
            (search_set_slug, provider, object_id),
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
              image_assets.original_height
            FROM image_assets
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
              AND image_assets.provider = ?
              AND image_assets.object_id = ?
              AND image_assets.provider = provider_collections.provider
              AND image_assets.imported = 1
            ORDER BY
              CASE WHEN image_assets.image_role = 'primary' THEN 0 ELSE 1 END,
              COALESCE(image_assets.image_index, 0),
              image_assets.id
            """,
            (search_set_slug, provider, object_id),
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
            (search_set_slug, provider, object_id),
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
            (provider, object_id),
        ).fetchall()

    return CollectionObjectDetail(
        object=CollectionObjectMetadata(
            provider=object_row[0],
            object_id=int(object_row[1]),
            title=object_row[2],
            object_name=object_row[3],
            artist_display_name=object_row[4],
            object_url=object_row[5],
            artist_display_bio=raw_string(raw_record, "artistDisplayBio"),
            artist_nationality=raw_string(raw_record, "artistNationality"),
            department=raw_string(raw_record, "department"),
            object_date=raw_string(raw_record, "objectDate"),
            medium=raw_string(raw_record, "medium"),
            dimensions=raw_string(raw_record, "dimensions"),
            classification=raw_string(raw_record, "classification"),
            credit_line=raw_string(raw_record, "creditLine"),
            accession_number=raw_string(raw_record, "accessionNumber"),
            repository=raw_string(raw_record, "repository"),
            tags=raw_tags(raw_record),
            is_public_domain=bool(object_row[6]),
            rights_and_reproduction=object_row[7],
            metadata_date=object_row[8],
        ),
        images=[
            CollectionObjectImage(
                image_asset_id=int(row[0]),
                source_image_url=row[1],
                image_role=row[2],
                image_index=row[3],
                original_width=int(row[4]),
                original_height=int(row[5]),
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
    object_id: int,
) -> CollectionObjectDetail | None:
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
              museum_objects.raw_record_path
            FROM museum_objects
            JOIN image_assets
              ON image_assets.provider = museum_objects.provider
              AND image_assets.object_id = museum_objects.object_id
            WHERE
              museum_objects.provider = ?
              AND museum_objects.object_id = ?
              AND image_assets.imported = 1
            """,
            (provider, object_id),
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
              image_assets.original_height
            FROM image_assets
            WHERE
              image_assets.provider = ?
              AND image_assets.object_id = ?
              AND image_assets.imported = 1
            ORDER BY
              CASE WHEN image_assets.image_role = 'primary' THEN 0 ELSE 1 END,
              COALESCE(image_assets.image_index, 0),
              image_assets.id
            """,
            (provider, object_id),
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
            (provider, object_id),
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
            (provider, object_id),
        ).fetchall()

    return CollectionObjectDetail(
        object=CollectionObjectMetadata(
            provider=object_row[0],
            object_id=int(object_row[1]),
            title=object_row[2],
            object_name=object_row[3],
            artist_display_name=object_row[4],
            object_url=object_row[5],
            artist_display_bio=raw_string(raw_record, "artistDisplayBio"),
            artist_nationality=raw_string(raw_record, "artistNationality"),
            department=raw_string(raw_record, "department"),
            object_date=raw_string(raw_record, "objectDate"),
            medium=raw_string(raw_record, "medium"),
            dimensions=raw_string(raw_record, "dimensions"),
            classification=raw_string(raw_record, "classification"),
            credit_line=raw_string(raw_record, "creditLine"),
            accession_number=raw_string(raw_record, "accessionNumber"),
            repository=raw_string(raw_record, "repository"),
            tags=raw_tags(raw_record),
            is_public_domain=bool(object_row[6]),
            rights_and_reproduction=object_row[7],
            metadata_date=object_row[8],
        ),
        images=[
            CollectionObjectImage(
                image_asset_id=int(row[0]),
                source_image_url=row[1],
                image_role=row[2],
                image_index=row[3],
                original_width=int(row[4]),
                original_height=int(row[5]),
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
