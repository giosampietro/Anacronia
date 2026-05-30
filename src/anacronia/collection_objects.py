from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.met_ingest import ensure_met_ingest_schema


@dataclass(frozen=True)
class CollectionObjectSummary:
    provider: str
    object_id: int
    title: str
    object_name: str
    artist_display_name: str
    image_count: int
    cover_image_asset_id: int


@dataclass(frozen=True)
class CollectionObjectMetadata:
    provider: str
    object_id: int
    title: str
    object_name: str
    artist_display_name: str
    object_url: str
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
class CollectionObjectDetail:
    object: CollectionObjectMetadata
    images: list[CollectionObjectImage]
    matches: list[CollectionObjectMatch]
    skipped_image_references: list[CollectionObjectSkippedImageReference]


def list_collection_objects(
    *,
    database_path: Path,
    search_set_slug: str,
) -> list[CollectionObjectSummary]:
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
                image_assets.image_index
              FROM image_assets
              JOIN run_candidates
                ON run_candidates.object_id = image_assets.object_id
              JOIN collection_runs
                ON collection_runs.id = run_candidates.run_id
              JOIN provider_collections
                ON provider_collections.id = collection_runs.provider_collection_id
              JOIN search_sets
                ON search_sets.id = provider_collections.search_set_id
              WHERE
                search_sets.slug = ?
                AND image_assets.provider = provider_collections.provider
                AND image_assets.imported = 1
            )
            SELECT
              collection_image_assets.provider,
              collection_image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name,
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
              MAX(collection_image_assets.id) AS latest_image_asset_id
            FROM collection_image_assets
            JOIN museum_objects
              ON museum_objects.provider = collection_image_assets.provider
              AND museum_objects.object_id = collection_image_assets.object_id
            GROUP BY
              collection_image_assets.provider,
              collection_image_assets.object_id,
              museum_objects.title,
              museum_objects.object_name,
              museum_objects.artist_display_name
            ORDER BY latest_image_asset_id DESC
            """,
            (search_set_slug,),
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
        )
        for row in rows
    ]


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
              museum_objects.rights_and_reproduction,
              museum_objects.metadata_date
            FROM museum_objects
            JOIN image_assets
              ON image_assets.provider = museum_objects.provider
              AND image_assets.object_id = museum_objects.object_id
            JOIN run_candidates
              ON run_candidates.object_id = museum_objects.object_id
            JOIN collection_runs
              ON collection_runs.id = run_candidates.run_id
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
            JOIN run_candidates
              ON run_candidates.object_id = image_assets.object_id
            JOIN collection_runs
              ON collection_runs.id = run_candidates.run_id
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
            rights_and_reproduction=object_row[6],
            metadata_date=object_row[7],
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
