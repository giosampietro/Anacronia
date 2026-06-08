from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3

from anacronia.provider_identity import ProviderObjectIdValue, normalize_source_object_id
from anacronia.schema_migrations import ensure_object_id_text_column


@dataclass(frozen=True)
class LocalMuseumObject:
    provider: str
    object_id: ProviderObjectIdValue
    title: str
    object_name: str
    artist_display_name: str
    object_url: str
    is_public_domain: bool
    rights_and_reproduction: str
    metadata_date: str
    raw_record_path: Path | str


@dataclass(frozen=True)
class LocalImageAsset:
    provider: str
    object_id: ProviderObjectIdValue
    source_image_url: str
    source_image_id: str
    image_role: str
    image_index: int | None
    primary_image_small_url: str
    original_width: int
    original_height: int
    standard_path: Path
    thumb_path: Path
    imported: bool
    source_file_path: str = ""
    source_rights_statement: str = ""
    source_rights_uri: str = ""
    source_license_name: str = ""
    source_license_uri: str = ""
    source_iiif_service_url: str = ""
    source_metadata: dict[str, object] | None = None


@dataclass(frozen=True)
class LocalObjectMatch:
    run_id: int
    provider: str
    object_id: ProviderObjectIdValue
    search_term: str
    matched_fields: list[str]


@dataclass(frozen=True)
class LocalDescriptor:
    provider: str
    object_id: ProviderObjectIdValue
    descriptor_type: str
    value: str
    normalized_value: str
    source_field: str


@dataclass(frozen=True)
class LocalSkippedCandidate:
    run_id: int
    provider: str
    object_id: ProviderObjectIdValue
    reason: str


@dataclass(frozen=True)
class LocalSkippedImageReference:
    provider: str
    object_id: ProviderObjectIdValue
    source_image_url: str
    image_role: str
    image_index: int | None
    reason: str


def upsert_local_museum_object(
    *,
    connection: sqlite3.Connection,
    museum_object: LocalMuseumObject,
) -> None:
    connection.execute(
        """
        INSERT INTO museum_objects (
          provider,
          object_id,
          title,
          object_name,
          artist_display_name,
          object_url,
          is_public_domain,
          rights_and_reproduction,
          metadata_date,
          raw_record_path,
          active,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, object_id) DO UPDATE SET
          title = excluded.title,
          object_name = excluded.object_name,
          artist_display_name = excluded.artist_display_name,
          object_url = excluded.object_url,
          is_public_domain = excluded.is_public_domain,
          rights_and_reproduction = excluded.rights_and_reproduction,
          metadata_date = excluded.metadata_date,
          raw_record_path = excluded.raw_record_path,
          active = 1,
          deleted_at = NULL
        """,
        (
            museum_object.provider,
            normalize_source_object_id(museum_object.object_id),
            museum_object.title,
            museum_object.object_name,
            museum_object.artist_display_name,
            museum_object.object_url,
            int(museum_object.is_public_domain),
            museum_object.rights_and_reproduction,
            museum_object.metadata_date,
            str(museum_object.raw_record_path),
            1,
            None,
        ),
    )


def record_local_image_asset(
    *,
    connection: sqlite3.Connection,
    image_asset: LocalImageAsset,
) -> None:
    connection.execute(
        """
        INSERT INTO image_assets (
          provider,
          object_id,
          source_image_url,
          source_image_id,
          image_role,
          image_index,
          primary_image_small_url,
          original_width,
          original_height,
          standard_path,
          thumb_path,
          imported,
          source_file_path,
          source_rights_statement,
          source_rights_uri,
          source_license_name,
          source_license_uri,
          source_iiif_service_url,
          source_metadata_json,
          active,
          deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, object_id, source_image_url) DO UPDATE SET
          source_image_id = excluded.source_image_id,
          image_role = excluded.image_role,
          image_index = excluded.image_index,
          primary_image_small_url = excluded.primary_image_small_url,
          original_width = excluded.original_width,
          original_height = excluded.original_height,
          standard_path = excluded.standard_path,
          thumb_path = excluded.thumb_path,
          imported = excluded.imported,
          source_file_path = excluded.source_file_path,
          source_rights_statement = excluded.source_rights_statement,
          source_rights_uri = excluded.source_rights_uri,
          source_license_name = excluded.source_license_name,
          source_license_uri = excluded.source_license_uri,
          source_iiif_service_url = excluded.source_iiif_service_url,
          source_metadata_json = excluded.source_metadata_json,
          active = 1,
          deleted_at = NULL
        """,
        (
            image_asset.provider,
            normalize_source_object_id(image_asset.object_id),
            image_asset.source_image_url,
            image_asset.source_image_id,
            image_asset.image_role,
            image_asset.image_index,
            image_asset.primary_image_small_url,
            image_asset.original_width,
            image_asset.original_height,
            str(image_asset.standard_path),
            str(image_asset.thumb_path),
            int(image_asset.imported),
            image_asset.source_file_path,
            image_asset.source_rights_statement,
            image_asset.source_rights_uri,
            image_asset.source_license_name,
            image_asset.source_license_uri,
            image_asset.source_iiif_service_url,
            json.dumps(image_asset.source_metadata or {}, sort_keys=True),
            1,
            None,
        ),
    )


def record_local_object_match(
    *,
    connection: sqlite3.Connection,
    match: LocalObjectMatch,
) -> None:
    connection.execute(
        """
        INSERT OR REPLACE INTO object_matches (
          run_id,
          provider,
          object_id,
          search_term,
          verified,
          matched_fields_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            match.run_id,
            match.provider,
            normalize_source_object_id(match.object_id),
            match.search_term,
            int(bool(match.matched_fields)),
            json.dumps(match.matched_fields),
        ),
    )


def replace_local_descriptors(
    *,
    connection: sqlite3.Connection,
    provider: str,
    object_id: ProviderObjectIdValue,
    descriptors: list[LocalDescriptor],
) -> None:
    source_object_id = normalize_source_object_id(object_id)
    connection.execute(
        "DELETE FROM descriptors WHERE provider = ? AND object_id = ?",
        (provider, source_object_id),
    )

    for descriptor in descriptors:
        connection.execute(
            """
            INSERT OR IGNORE INTO descriptors (
              provider,
              object_id,
              descriptor_type,
              value,
              normalized_value,
              source_field
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                descriptor.provider,
                normalize_source_object_id(descriptor.object_id),
                descriptor.descriptor_type,
                descriptor.value,
                descriptor.normalized_value,
                descriptor.source_field,
            ),
        )


def record_local_skipped_candidate(
    *,
    connection: sqlite3.Connection,
    candidate: LocalSkippedCandidate,
) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO skipped_candidates (
          run_id,
          provider,
          object_id,
          reason
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            candidate.run_id,
            candidate.provider,
            normalize_source_object_id(candidate.object_id),
            candidate.reason,
        ),
    )


def record_local_skipped_image_reference(
    *,
    connection: sqlite3.Connection,
    reference: LocalSkippedImageReference,
) -> None:
    connection.execute(
        """
        INSERT OR REPLACE INTO skipped_image_references (
          provider,
          object_id,
          source_image_url,
          image_role,
          image_index,
          reason
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            reference.provider,
            normalize_source_object_id(reference.object_id),
            reference.source_image_url,
            reference.image_role,
            reference.image_index,
            reference.reason,
        ),
    )


def ensure_local_material_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS museum_objects (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          title TEXT NOT NULL,
          object_name TEXT NOT NULL,
          artist_display_name TEXT NOT NULL,
          object_url TEXT NOT NULL,
          is_public_domain INTEGER NOT NULL,
          rights_and_reproduction TEXT NOT NULL,
          metadata_date TEXT NOT NULL,
          raw_record_path TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT,
          UNIQUE (provider, object_id)
        )
        """
    )
    ensure_object_id_text_column(connection=connection, table_name="museum_objects")
    ensure_table_columns(
        connection=connection,
        table_name="museum_objects",
        columns={
            "active": "INTEGER NOT NULL DEFAULT 1",
            "deleted_at": "TEXT",
        },
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS object_matches (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          search_term TEXT NOT NULL,
          verified INTEGER NOT NULL,
          matched_fields_json TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES collection_runs(id),
          UNIQUE (run_id, provider, object_id, search_term)
        )
        """
    )
    ensure_object_id_text_column(connection=connection, table_name="object_matches")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS skipped_candidates (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES collection_runs(id),
          UNIQUE (run_id, provider, object_id, reason)
        )
        """
    )
    ensure_object_id_text_column(connection=connection, table_name="skipped_candidates")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS collection_object_exclusions (
          id INTEGER PRIMARY KEY,
          search_set_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (search_set_id) REFERENCES search_sets(id),
          UNIQUE (search_set_id, provider, object_id)
        )
        """
    )
    ensure_object_id_text_column(
        connection=connection,
        table_name="collection_object_exclusions",
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS collection_image_asset_exclusions (
          id INTEGER PRIMARY KEY,
          search_set_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          source_image_url TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (search_set_id) REFERENCES search_sets(id),
          UNIQUE (search_set_id, provider, object_id, source_image_url)
        )
        """
    )
    ensure_object_id_text_column(
        connection=connection,
        table_name="collection_image_asset_exclusions",
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS image_assets (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          source_image_url TEXT NOT NULL,
          source_image_id TEXT NOT NULL DEFAULT '',
          image_role TEXT NOT NULL,
          image_index INTEGER,
          primary_image_small_url TEXT NOT NULL,
          original_width INTEGER NOT NULL,
          original_height INTEGER NOT NULL,
          standard_path TEXT NOT NULL,
          thumb_path TEXT NOT NULL,
          imported INTEGER NOT NULL,
          source_file_path TEXT NOT NULL DEFAULT '',
          source_rights_statement TEXT NOT NULL DEFAULT '',
          source_rights_uri TEXT NOT NULL DEFAULT '',
          source_license_name TEXT NOT NULL DEFAULT '',
          source_license_uri TEXT NOT NULL DEFAULT '',
          source_iiif_service_url TEXT NOT NULL DEFAULT '',
          source_metadata_json TEXT NOT NULL DEFAULT '{}',
          active INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT,
          UNIQUE (provider, object_id, source_image_url)
        )
        """
    )
    ensure_object_id_text_column(connection=connection, table_name="image_assets")
    ensure_table_columns(
        connection=connection,
        table_name="image_assets",
        columns={
            "active": "INTEGER NOT NULL DEFAULT 1",
            "deleted_at": "TEXT",
            "source_image_id": "TEXT NOT NULL DEFAULT ''",
            "source_file_path": "TEXT NOT NULL DEFAULT ''",
            "source_rights_statement": "TEXT NOT NULL DEFAULT ''",
            "source_rights_uri": "TEXT NOT NULL DEFAULT ''",
            "source_license_name": "TEXT NOT NULL DEFAULT ''",
            "source_license_uri": "TEXT NOT NULL DEFAULT ''",
            "source_iiif_service_url": "TEXT NOT NULL DEFAULT ''",
            "source_metadata_json": "TEXT NOT NULL DEFAULT '{}'",
        },
    )
    backfill_image_asset_provenance(connection)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS skipped_image_references (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          source_image_url TEXT NOT NULL,
          image_role TEXT NOT NULL,
          image_index INTEGER,
          reason TEXT NOT NULL,
          UNIQUE (provider, object_id, source_image_url, reason)
        )
        """
    )
    ensure_object_id_text_column(
        connection=connection,
        table_name="skipped_image_references",
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS descriptors (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id TEXT NOT NULL,
          descriptor_type TEXT NOT NULL,
          value TEXT NOT NULL,
          normalized_value TEXT NOT NULL,
          source_field TEXT NOT NULL,
          UNIQUE (
            provider,
            object_id,
            descriptor_type,
            normalized_value,
            source_field
          )
        )
        """
    )
    ensure_object_id_text_column(connection=connection, table_name="descriptors")


def backfill_image_asset_provenance(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        UPDATE image_assets
        SET source_rights_statement = (
          SELECT museum_objects.rights_and_reproduction
          FROM museum_objects
          WHERE
            museum_objects.provider = image_assets.provider
            AND museum_objects.object_id = image_assets.object_id
            AND TRIM(museum_objects.rights_and_reproduction) != ''
        )
        WHERE
          provider = 'vam'
          AND TRIM(source_rights_statement) = ''
          AND EXISTS (
            SELECT 1
            FROM museum_objects
            WHERE
              museum_objects.provider = image_assets.provider
              AND museum_objects.object_id = image_assets.object_id
              AND TRIM(museum_objects.rights_and_reproduction) != ''
          )
        """
    )

    rows = connection.execute(
        """
        SELECT id, source_image_url
        FROM image_assets
        WHERE
          provider = 'vam'
          AND (
            TRIM(source_image_id) = ''
            OR TRIM(source_iiif_service_url) = ''
          )
        """
    ).fetchall()

    for row in rows:
        asset_ref = vam_asset_ref_from_source_image_url(row[1])
        if not asset_ref:
            continue
        connection.execute(
            """
            UPDATE image_assets
            SET
              source_image_id = CASE
                WHEN TRIM(source_image_id) = '' THEN ?
                ELSE source_image_id
              END,
              source_iiif_service_url = CASE
                WHEN TRIM(source_iiif_service_url) = '' THEN ?
                ELSE source_iiif_service_url
              END
            WHERE id = ?
            """,
            (
                asset_ref,
                vam_iiif_service_url_from_asset_ref(asset_ref),
                row[0],
            ),
        )

    connection.execute(
        """
        UPDATE image_assets
        SET source_image_id = source_image_url
        WHERE TRIM(source_image_id) = ''
        """
    )


def vam_asset_ref_from_source_image_url(source_image_url: str) -> str:
    marker = "/collections/"
    if marker not in source_image_url:
        return ""
    tail = source_image_url.split(marker, 1)[1]
    return tail.split("/", 1)[0].strip()


def vam_iiif_service_url_from_asset_ref(asset_ref: str) -> str:
    return f"https://framemark.vam.ac.uk/collections/{asset_ref}"


def ensure_table_columns(
    *,
    connection: sqlite3.Connection,
    table_name: str,
    columns: dict[str, str],
) -> None:
    existing_columns = {
        row[1]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    for column_name, definition in columns.items():
        if column_name not in existing_columns:
            connection.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
            )
