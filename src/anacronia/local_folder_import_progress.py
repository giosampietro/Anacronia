from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import sqlite3


@dataclass(frozen=True)
class LocalFolderImportProgress:
    progress_id: int
    status: str
    display_name: str
    search_set_slug: str
    folder_path: Path
    phase: str
    discovered_file_count: int
    processed_file_count: int
    imported_image_count: int
    skipped_file_count: int
    error: str


def ensure_local_folder_import_progress_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS local_folder_import_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          status TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          search_set_slug TEXT NOT NULL DEFAULT '',
          folder_path TEXT NOT NULL,
          phase TEXT NOT NULL,
          discovered_file_count INTEGER NOT NULL DEFAULT 0,
          processed_file_count INTEGER NOT NULL DEFAULT 0,
          imported_image_count INTEGER NOT NULL DEFAULT 0,
          skipped_file_count INTEGER NOT NULL DEFAULT 0,
          error TEXT NOT NULL DEFAULT '',
          started_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          finished_at TEXT
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_local_folder_import_progress_status_updated
        ON local_folder_import_progress (status, updated_at DESC, id DESC)
        """
    )


def start_local_folder_import_progress(
    *,
    database_path: Path,
    display_name: str,
    folder_path: Path,
    search_set_slug: str = "",
) -> LocalFolderImportProgress:
    now = _timestamp()
    with sqlite3.connect(database_path) as connection:
        ensure_local_folder_import_progress_schema(connection)
        cursor = connection.execute(
            """
            INSERT INTO local_folder_import_progress (
              status,
              display_name,
              search_set_slug,
              folder_path,
              phase,
              started_at,
              updated_at
            )
            VALUES ('running', ?, ?, ?, 'starting', ?, ?)
            """,
            (
                display_name.strip(),
                search_set_slug.strip(),
                str(folder_path),
                now,
                now,
            ),
        )
        progress_id = int(cursor.lastrowid)
        row = connection.execute(
            """
            SELECT
              id,
              status,
              display_name,
              search_set_slug,
              folder_path,
              phase,
              discovered_file_count,
              processed_file_count,
              imported_image_count,
              skipped_file_count,
              error
            FROM local_folder_import_progress
            WHERE id = ?
            """,
            (progress_id,),
        ).fetchone()

    if row is None:
        raise RuntimeError("Local folder import progress was not created.")
    return _progress_from_row(row)


def get_active_local_folder_import_progress(
    *,
    database_path: Path,
) -> LocalFolderImportProgress | None:
    with sqlite3.connect(database_path) as connection:
        ensure_local_folder_import_progress_schema(connection)
        row = connection.execute(
            """
            SELECT
              id,
              status,
              display_name,
              search_set_slug,
              folder_path,
              phase,
              discovered_file_count,
              processed_file_count,
              imported_image_count,
              skipped_file_count,
              error
            FROM local_folder_import_progress
            WHERE status = 'running'
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        ).fetchone()

    if row is None:
        return None
    return _progress_from_row(row)


def get_latest_local_folder_import_progress(
    *,
    database_path: Path,
) -> LocalFolderImportProgress | None:
    with sqlite3.connect(database_path) as connection:
        ensure_local_folder_import_progress_schema(connection)
        row = connection.execute(
            """
            SELECT
              id,
              status,
              display_name,
              search_set_slug,
              folder_path,
              phase,
              discovered_file_count,
              processed_file_count,
              imported_image_count,
              skipped_file_count,
              error
            FROM local_folder_import_progress
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        ).fetchone()

    if row is None:
        return None
    return _progress_from_row(row)


def update_local_folder_import_progress(
    *,
    database_path: Path,
    progress_id: int,
    phase: str,
    discovered_file_count: int,
    processed_file_count: int,
    imported_image_count: int,
    skipped_file_count: int,
) -> None:
    with sqlite3.connect(database_path) as connection:
        ensure_local_folder_import_progress_schema(connection)
        connection.execute(
            """
            UPDATE local_folder_import_progress
            SET
              phase = ?,
              discovered_file_count = ?,
              processed_file_count = ?,
              imported_image_count = ?,
              skipped_file_count = ?,
              updated_at = ?
            WHERE id = ?
            """,
            (
                phase,
                discovered_file_count,
                processed_file_count,
                imported_image_count,
                skipped_file_count,
                _timestamp(),
                progress_id,
            ),
        )


def complete_local_folder_import_progress(
    *,
    database_path: Path,
    progress_id: int,
    discovered_file_count: int,
    processed_file_count: int,
    imported_image_count: int,
    skipped_file_count: int,
) -> None:
    _finish_local_folder_import_progress(
        database_path=database_path,
        progress_id=progress_id,
        status="completed",
        phase="completed",
        discovered_file_count=discovered_file_count,
        processed_file_count=processed_file_count,
        imported_image_count=imported_image_count,
        skipped_file_count=skipped_file_count,
        error="",
    )


def fail_local_folder_import_progress(
    *,
    database_path: Path,
    progress_id: int,
    discovered_file_count: int,
    processed_file_count: int,
    imported_image_count: int,
    skipped_file_count: int,
    error: str,
) -> None:
    _finish_local_folder_import_progress(
        database_path=database_path,
        progress_id=progress_id,
        status="failed",
        phase="failed",
        discovered_file_count=discovered_file_count,
        processed_file_count=processed_file_count,
        imported_image_count=imported_image_count,
        skipped_file_count=skipped_file_count,
        error=error,
    )


def _finish_local_folder_import_progress(
    *,
    database_path: Path,
    progress_id: int,
    status: str,
    phase: str,
    discovered_file_count: int,
    processed_file_count: int,
    imported_image_count: int,
    skipped_file_count: int,
    error: str,
) -> None:
    now = _timestamp()
    with sqlite3.connect(database_path) as connection:
        ensure_local_folder_import_progress_schema(connection)
        connection.execute(
            """
            UPDATE local_folder_import_progress
            SET
              status = ?,
              phase = ?,
              discovered_file_count = ?,
              processed_file_count = ?,
              imported_image_count = ?,
              skipped_file_count = ?,
              error = ?,
              updated_at = ?,
              finished_at = ?
            WHERE id = ?
            """,
            (
                status,
                phase,
                discovered_file_count,
                processed_file_count,
                imported_image_count,
                skipped_file_count,
                error,
                now,
                now,
                progress_id,
            ),
        )


def _progress_from_row(row) -> LocalFolderImportProgress:
    return LocalFolderImportProgress(
        progress_id=int(row[0]),
        status=str(row[1]),
        display_name=str(row[2]),
        search_set_slug=str(row[3]),
        folder_path=Path(str(row[4])),
        phase=str(row[5]),
        discovered_file_count=int(row[6]),
        processed_file_count=int(row[7]),
        imported_image_count=int(row[8]),
        skipped_file_count=int(row[9]),
        error=str(row[10]),
    )


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
