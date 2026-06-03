from dataclasses import dataclass
from pathlib import Path
import sqlite3


@dataclass(frozen=True)
class CollectionMembershipBackfillSummary:
    object_memberships_created: int
    image_asset_memberships_created: int


@dataclass(frozen=True)
class CollectionObjectMembership:
    search_set_slug: str
    provider: str
    object_id: int


@dataclass(frozen=True)
class CollectionImageAssetMembership:
    search_set_slug: str
    provider: str
    object_id: int
    source_image_url: str


@dataclass(frozen=True)
class CollectionImportExclusions:
    object_excluded: bool
    image_source_urls: frozenset[str]


class CollectionCurationBusyError(RuntimeError):
    pass


class CollectionFileCleanupError(RuntimeError):
    def __init__(self, *, path: Path, original_error: OSError) -> None:
        self.path = path
        super().__init__(f"Could not delete local file {path}: {original_error}")


def ensure_curation_schema(connection: sqlite3.Connection) -> None:
    # Lazy import keeps provider ingest modules able to depend on curation.
    from anacronia.met_ingest import ensure_met_ingest_schema
    from anacronia.worker import ensure_worker_schema

    ensure_met_ingest_schema(connection)
    ensure_worker_schema(connection)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS object_favorites (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (provider, object_id)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS image_asset_favorites (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          source_image_url TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (provider, object_id, source_image_url)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS collection_object_memberships (
          id INTEGER PRIMARY KEY,
          search_set_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (search_set_id) REFERENCES search_sets(id),
          UNIQUE (search_set_id, provider, object_id)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS collection_image_asset_memberships (
          id INTEGER PRIMARY KEY,
          search_set_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          source_image_url TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (search_set_id) REFERENCES search_sets(id),
          UNIQUE (search_set_id, provider, object_id, source_image_url)
        )
        """
    )


def set_object_favorite(
    *,
    database_path: Path,
    provider: str,
    object_id: int,
    is_favorite: bool,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        if is_favorite:
            connection.execute(
                """
                INSERT OR IGNORE INTO object_favorites (provider, object_id)
                VALUES (?, ?)
                """,
                (provider, object_id),
            )
        else:
            connection.execute(
                """
                DELETE FROM object_favorites
                WHERE provider = ? AND object_id = ?
                """,
                (provider, object_id),
            )

    return is_favorite


def add_collection_object_exclusion(
    *,
    database_path: Path,
    search_set_slug: str,
    provider: str,
    object_id: int,
    reason: str,
) -> None:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        connection.execute(
            """
            INSERT OR REPLACE INTO collection_object_exclusions (
              search_set_id,
              provider,
              object_id,
              reason
            )
            SELECT id, ?, ?, ?
            FROM search_sets
            WHERE slug = ?
            """,
            (provider, object_id, reason, search_set_slug),
        )


def add_collection_image_asset_exclusion(
    *,
    database_path: Path,
    search_set_slug: str,
    provider: str,
    object_id: int,
    source_image_url: str,
    reason: str,
) -> None:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        connection.execute(
            """
            INSERT OR REPLACE INTO collection_image_asset_exclusions (
              search_set_id,
              provider,
              object_id,
              source_image_url,
              reason
            )
            SELECT id, ?, ?, ?, ?
            FROM search_sets
            WHERE slug = ?
            """,
            (provider, object_id, source_image_url, reason, search_set_slug),
        )


def get_collection_import_exclusions(
    *,
    connection: sqlite3.Connection,
    search_set_id: int,
    provider: str,
    object_id: int,
) -> CollectionImportExclusions:
    ensure_curation_schema(connection)
    object_excluded = connection.execute(
        """
        SELECT 1
        FROM collection_object_exclusions
        WHERE search_set_id = ? AND provider = ? AND object_id = ?
        """,
        (search_set_id, provider, object_id),
    ).fetchone() is not None
    image_rows = connection.execute(
        """
        SELECT source_image_url
        FROM collection_image_asset_exclusions
        WHERE search_set_id = ? AND provider = ? AND object_id = ?
        """,
        (search_set_id, provider, object_id),
    ).fetchall()
    return CollectionImportExclusions(
        object_excluded=object_excluded,
        image_source_urls=frozenset(row[0] for row in image_rows),
    )


def remove_object_from_collection(
    *,
    database_path: Path,
    search_set_slug: str,
    provider: str,
    object_id: int,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        search_set_row = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (search_set_slug,),
        ).fetchone()
        if search_set_row is None:
            return False
        search_set_id = int(search_set_row[0])
        ensure_collection_not_busy(
            connection=connection,
            search_set_id=search_set_id,
            provider=provider,
        )
        object_cursor = connection.execute(
            """
            UPDATE collection_object_memberships
            SET active = 0
            WHERE
              search_set_id = ?
              AND provider = ?
              AND object_id = ?
              AND active = 1
            """,
            (search_set_id, provider, object_id),
        )
        image_cursor = connection.execute(
            """
            UPDATE collection_image_asset_memberships
            SET active = 0
            WHERE
              search_set_id = ?
              AND provider = ?
              AND object_id = ?
              AND active = 1
            """,
            (search_set_id, provider, object_id),
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO collection_object_exclusions (
              search_set_id,
              provider,
              object_id,
              reason
            )
            VALUES (?, ?, ?, ?)
            """,
            (search_set_id, provider, object_id, "removed_from_collection"),
        )

    return object_cursor.rowcount > 0 or image_cursor.rowcount > 0


def remove_image_asset_from_collection(
    *,
    database_path: Path,
    search_set_slug: str,
    image_asset_id: int,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_memberships(connection)
        search_set_row = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (search_set_slug,),
        ).fetchone()
        image_asset_row = connection.execute(
            """
            SELECT provider, object_id, source_image_url
            FROM image_assets
            WHERE id = ? AND imported = 1 AND active = 1
            """,
            (image_asset_id,),
        ).fetchone()
        if search_set_row is None or image_asset_row is None:
            return False
        search_set_id = int(search_set_row[0])
        provider = image_asset_row[0]
        object_id = int(image_asset_row[1])
        source_image_url = image_asset_row[2]
        ensure_collection_not_busy(
            connection=connection,
            search_set_id=search_set_id,
            provider=provider,
        )
        image_cursor = connection.execute(
            """
            UPDATE collection_image_asset_memberships
            SET active = 0
            WHERE
              search_set_id = ?
              AND provider = ?
              AND object_id = ?
              AND source_image_url = ?
              AND active = 1
            """,
            (search_set_id, provider, object_id, source_image_url),
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO collection_image_asset_exclusions (
              search_set_id,
              provider,
              object_id,
              source_image_url,
              reason
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                search_set_id,
                provider,
                object_id,
                source_image_url,
                "removed_from_collection",
            ),
        )
        remaining_image_count = int(
            connection.execute(
                """
                SELECT COUNT(*)
                FROM collection_image_asset_memberships
                WHERE
                  search_set_id = ?
                  AND provider = ?
                  AND object_id = ?
                  AND active = 1
                """,
                (search_set_id, provider, object_id),
            ).fetchone()[0]
        )
        if remaining_image_count == 0:
            connection.execute(
                """
                UPDATE collection_object_memberships
                SET active = 0
                WHERE
                  search_set_id = ?
                  AND provider = ?
                  AND object_id = ?
                  AND active = 1
                """,
                (search_set_id, provider, object_id),
            )
            connection.execute(
                """
                INSERT OR REPLACE INTO collection_object_exclusions (
                  search_set_id,
                  provider,
                  object_id,
                  reason
                )
                VALUES (?, ?, ?, ?)
                """,
                (search_set_id, provider, object_id, "removed_from_collection"),
            )

    return image_cursor.rowcount > 0


def ensure_collection_not_busy(
    *,
    connection: sqlite3.Connection,
    search_set_id: int,
    provider: str,
) -> None:
    row = connection.execute(
        """
        SELECT 1
        FROM provider_collections
        JOIN collection_runs
          ON collection_runs.provider_collection_id = provider_collections.id
        JOIN collect_jobs
          ON collect_jobs.run_id = collection_runs.id
        WHERE
          provider_collections.search_set_id = ?
          AND provider_collections.provider = ?
          AND collect_jobs.status IN ('running', 'stopping')
        LIMIT 1
        """,
        (search_set_id, provider),
    ).fetchone()
    if row is not None:
        raise CollectionCurationBusyError(
            "Provider Search is running for this Collection."
        )


def ensure_no_provider_search_running(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        """
        SELECT 1
        FROM collect_jobs
        WHERE status IN ('running', 'stopping')
        LIMIT 1
        """
    ).fetchone()
    if row is not None:
        raise CollectionCurationBusyError("Provider Search is running.")


def set_image_asset_favorite(
    *,
    database_path: Path,
    image_asset_id: int,
    is_favorite: bool,
) -> bool | None:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        row = connection.execute(
            """
            SELECT provider, object_id, source_image_url
            FROM image_assets
            WHERE id = ? AND imported = 1
            """,
            (image_asset_id,),
        ).fetchone()
        if row is None:
            return None

        if is_favorite:
            connection.execute(
                """
                INSERT OR IGNORE INTO image_asset_favorites (
                  provider,
                  object_id,
                  source_image_url
                )
                VALUES (?, ?, ?)
                """,
                (row[0], int(row[1]), row[2]),
            )
        else:
            connection.execute(
                """
                DELETE FROM image_asset_favorites
                WHERE provider = ? AND object_id = ? AND source_image_url = ?
                """,
                (row[0], int(row[1]), row[2]),
            )

    return is_favorite


def mark_image_asset_deleted(
    *,
    database_path: Path,
    image_asset_id: int,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        cursor = connection.execute(
            """
            UPDATE image_assets
            SET active = 0, deleted_at = CURRENT_TIMESTAMP
            WHERE id = ? AND imported = 1 AND active = 1
            """,
            (image_asset_id,),
        )

    return cursor.rowcount > 0


def mark_object_deleted(
    *,
    database_path: Path,
    provider: str,
    object_id: int,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        cursor = connection.execute(
            """
            UPDATE museum_objects
            SET active = 0, deleted_at = CURRENT_TIMESTAMP
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (provider, object_id),
        )
        if cursor.rowcount > 0:
            connection.execute(
                """
                UPDATE image_assets
                SET active = 0, deleted_at = CURRENT_TIMESTAMP
                WHERE provider = ? AND object_id = ? AND active = 1
                """,
                (provider, object_id),
            )

    return cursor.rowcount > 0


def delete_local_file(path_text: str) -> None:
    path = Path(path_text)
    try:
        path.unlink(missing_ok=True)
    except OSError as error:
        raise CollectionFileCleanupError(
            path=path,
            original_error=error,
        ) from error


def delete_image_asset_from_anacronia(
    *,
    database_path: Path,
    image_asset_id: int,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        ensure_no_provider_search_running(connection)
        row = connection.execute(
            """
            SELECT
              provider,
              object_id,
              source_image_url,
              standard_path,
              thumb_path
            FROM image_assets
            WHERE id = ? AND imported = 1 AND active = 1
            """,
            (image_asset_id,),
        ).fetchone()
    if row is None:
        return False

    provider = row[0]
    object_id = int(row[1])
    source_image_url = row[2]
    for path_text in (row[3], row[4]):
        delete_local_file(path_text)

    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        connection.execute(
            """
            UPDATE collection_image_asset_memberships
            SET active = 0
            WHERE
              provider = ?
              AND object_id = ?
              AND source_image_url = ?
              AND active = 1
            """,
            (provider, object_id, source_image_url),
        )
        connection.execute(
            """
            UPDATE image_assets
            SET active = 0, deleted_at = CURRENT_TIMESTAMP
            WHERE id = ? AND active = 1
            """,
            (image_asset_id,),
        )
        connection.execute(
            """
            DELETE FROM image_asset_favorites
            WHERE provider = ? AND object_id = ? AND source_image_url = ?
            """,
            (provider, object_id, source_image_url),
        )
        remaining_image_count = int(
            connection.execute(
                """
                SELECT COUNT(*)
                FROM image_assets
                WHERE provider = ? AND object_id = ? AND imported = 1 AND active = 1
                """,
                (provider, object_id),
            ).fetchone()[0]
        )
        if remaining_image_count == 0:
            connection.execute(
                """
                UPDATE museum_objects
                SET active = 0, deleted_at = CURRENT_TIMESTAMP
                WHERE provider = ? AND object_id = ? AND active = 1
                """,
                (provider, object_id),
            )
            connection.execute(
                """
                UPDATE collection_object_memberships
                SET active = 0
                WHERE provider = ? AND object_id = ? AND active = 1
                """,
                (provider, object_id),
            )
            connection.execute(
                """
                DELETE FROM object_favorites
                WHERE provider = ? AND object_id = ?
                """,
                (provider, object_id),
            )

    return True


def delete_object_from_anacronia(
    *,
    database_path: Path,
    provider: str,
    object_id: int,
) -> bool:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        ensure_no_provider_search_running(connection)
        object_row = connection.execute(
            """
            SELECT 1
            FROM museum_objects
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (provider, object_id),
        ).fetchone()
        image_rows = connection.execute(
            """
            SELECT standard_path, thumb_path
            FROM image_assets
            WHERE provider = ? AND object_id = ? AND imported = 1 AND active = 1
            """,
            (provider, object_id),
        ).fetchall()
    if object_row is None and not image_rows:
        return False

    for row in image_rows:
        for path_text in row:
            delete_local_file(path_text)

    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        connection.execute(
            """
            UPDATE collection_image_asset_memberships
            SET active = 0
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (provider, object_id),
        )
        connection.execute(
            """
            UPDATE collection_object_memberships
            SET active = 0
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (provider, object_id),
        )
        connection.execute(
            """
            UPDATE image_assets
            SET active = 0, deleted_at = CURRENT_TIMESTAMP
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (provider, object_id),
        )
        connection.execute(
            """
            UPDATE museum_objects
            SET active = 0, deleted_at = CURRENT_TIMESTAMP
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (provider, object_id),
        )
        connection.execute(
            """
            DELETE FROM image_asset_favorites
            WHERE provider = ? AND object_id = ?
            """,
            (provider, object_id),
        )
        connection.execute(
            """
            DELETE FROM object_favorites
            WHERE provider = ? AND object_id = ?
            """,
            (provider, object_id),
        )

    return True


def backfill_collection_memberships(*, database_path: Path) -> CollectionMembershipBackfillSummary:
    with sqlite3.connect(database_path) as connection:
        return ensure_collection_memberships(connection)


def ensure_collection_memberships(
    connection: sqlite3.Connection,
) -> CollectionMembershipBackfillSummary:
    ensure_curation_schema(connection)
    before_object_count = collection_object_membership_count(connection)
    before_image_asset_count = collection_image_asset_membership_count(connection)
    connection.execute(
        """
        INSERT OR IGNORE INTO collection_object_memberships (
          search_set_id,
          provider,
          object_id,
          active
        )
        SELECT DISTINCT
          search_sets.id,
          image_assets.provider,
          image_assets.object_id,
          1
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
        WHERE
          image_assets.imported = 1
          AND image_assets.active = 1
          AND NOT EXISTS (
            SELECT 1
            FROM collection_object_exclusions
            WHERE
              collection_object_exclusions.search_set_id = search_sets.id
              AND collection_object_exclusions.provider = image_assets.provider
              AND collection_object_exclusions.object_id = image_assets.object_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM collection_image_asset_exclusions
            WHERE
              collection_image_asset_exclusions.search_set_id = search_sets.id
              AND collection_image_asset_exclusions.provider = image_assets.provider
              AND collection_image_asset_exclusions.object_id = image_assets.object_id
              AND collection_image_asset_exclusions.source_image_url = image_assets.source_image_url
          )
        """
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO collection_image_asset_memberships (
          search_set_id,
          provider,
          object_id,
          source_image_url,
          active
        )
        SELECT DISTINCT
          search_sets.id,
          image_assets.provider,
          image_assets.object_id,
          image_assets.source_image_url,
          1
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
        WHERE
          image_assets.imported = 1
          AND image_assets.active = 1
          AND NOT EXISTS (
            SELECT 1
            FROM collection_object_exclusions
            WHERE
              collection_object_exclusions.search_set_id = search_sets.id
              AND collection_object_exclusions.provider = image_assets.provider
              AND collection_object_exclusions.object_id = image_assets.object_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM collection_image_asset_exclusions
            WHERE
              collection_image_asset_exclusions.search_set_id = search_sets.id
              AND collection_image_asset_exclusions.provider = image_assets.provider
              AND collection_image_asset_exclusions.object_id = image_assets.object_id
              AND collection_image_asset_exclusions.source_image_url = image_assets.source_image_url
          )
        """
    )
    after_object_count = collection_object_membership_count(connection)
    after_image_asset_count = collection_image_asset_membership_count(connection)

    return CollectionMembershipBackfillSummary(
        object_memberships_created=after_object_count - before_object_count,
        image_asset_memberships_created=after_image_asset_count
        - before_image_asset_count,
    )


def collection_object_membership_count(connection: sqlite3.Connection) -> int:
    return int(
        connection.execute(
            "SELECT COUNT(*) FROM collection_object_memberships"
        ).fetchone()[0]
    )


def collection_image_asset_membership_count(connection: sqlite3.Connection) -> int:
    return int(
        connection.execute(
            "SELECT COUNT(*) FROM collection_image_asset_memberships"
        ).fetchone()[0]
    )


def list_collection_object_memberships(
    *,
    database_path: Path,
) -> list[CollectionObjectMembership]:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        rows = connection.execute(
            """
            SELECT
              search_sets.slug,
              collection_object_memberships.provider,
              collection_object_memberships.object_id
            FROM collection_object_memberships
            JOIN search_sets
              ON search_sets.id = collection_object_memberships.search_set_id
            WHERE collection_object_memberships.active = 1
            ORDER BY
              search_sets.slug,
              collection_object_memberships.provider,
              collection_object_memberships.object_id
            """
        ).fetchall()

    return [
        CollectionObjectMembership(
            search_set_slug=row[0],
            provider=row[1],
            object_id=int(row[2]),
        )
        for row in rows
    ]


def list_collection_image_asset_memberships(
    *,
    database_path: Path,
) -> list[CollectionImageAssetMembership]:
    with sqlite3.connect(database_path) as connection:
        ensure_curation_schema(connection)
        rows = connection.execute(
            """
            SELECT
              search_sets.slug,
              collection_image_asset_memberships.provider,
              collection_image_asset_memberships.object_id,
              collection_image_asset_memberships.source_image_url
            FROM collection_image_asset_memberships
            JOIN search_sets
              ON search_sets.id = collection_image_asset_memberships.search_set_id
            WHERE collection_image_asset_memberships.active = 1
            ORDER BY
              search_sets.slug,
              collection_image_asset_memberships.provider,
              collection_image_asset_memberships.object_id,
              collection_image_asset_memberships.source_image_url
            """
        ).fetchall()

    return [
        CollectionImageAssetMembership(
            search_set_slug=row[0],
            provider=row[1],
            object_id=int(row[2]),
            source_image_url=row[3],
        )
        for row in rows
    ]
