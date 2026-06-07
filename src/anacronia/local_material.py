from __future__ import annotations

import sqlite3

from anacronia.schema_migrations import ensure_object_id_text_column


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
          image_role TEXT NOT NULL,
          image_index INTEGER,
          primary_image_small_url TEXT NOT NULL,
          original_width INTEGER NOT NULL,
          original_height INTEGER NOT NULL,
          standard_path TEXT NOT NULL,
          thumb_path TEXT NOT NULL,
          imported INTEGER NOT NULL,
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
        },
    )
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
