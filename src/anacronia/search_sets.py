from dataclasses import dataclass
from pathlib import Path
import re
import sqlite3

MET_PROVIDER = "met"


@dataclass(frozen=True)
class SearchSetTerm:
    term: str
    active: bool


@dataclass(frozen=True)
class SearchSet:
    display_name: str
    slug: str
    terms: list[SearchSetTerm]


class DuplicateSearchSetNameError(ValueError):
    pass


def normalize_search_set_display_name(display_name: str) -> str:
    return " ".join(display_name.casefold().split())


def parse_search_terms(terms_text: str) -> list[str]:
    terms: list[str] = []
    seen_normalized_terms: set[str] = set()

    for raw_term in re.split(r"[\n,]+", terms_text):
        term = raw_term.strip()
        normalized_term = normalize_search_term(term)

        if not normalized_term or normalized_term in seen_normalized_terms:
            continue

        terms.append(term)
        seen_normalized_terms.add(normalized_term)

    return terms


def normalize_search_term(term: str) -> str:
    return " ".join(term.casefold().split())


def create_or_continue_search_set(
    *,
    database_path: Path,
    display_name: str,
    terms_text: str,
) -> SearchSet:
    slug = slugify_search_set_name(display_name)
    terms = parse_search_terms(terms_text)

    if not slug:
        raise ValueError("Collection title is required.")
    if not terms:
        raise ValueError("At least one Collection term is required.")

    with sqlite3.connect(database_path) as connection:
        ensure_search_set_schema(connection)
        ensure_provider_collection_schema(connection)
        search_set_row = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (slug,),
        ).fetchone()

        if search_set_row is None:
            cursor = connection.execute(
                "INSERT INTO search_sets (display_name, slug) VALUES (?, ?)",
                (display_name.strip(), slug),
            )
            search_set_id = int(cursor.lastrowid)

            for term in terms:
                connection.execute(
                    """
                    INSERT INTO search_set_terms
                      (search_set_id, term, normalized_term, active)
                    VALUES (?, ?, ?, 1)
                    """,
                    (search_set_id, term, normalize_search_term(term)),
                )
        else:
            search_set_id = int(search_set_row[0])

        ensure_provider_collection(
            connection=connection,
            search_set_id=search_set_id,
            provider=MET_PROVIDER,
        )

    return get_search_set(database_path=database_path, slug=slug)


def get_search_set(*, database_path: Path, slug: str) -> SearchSet:
    with sqlite3.connect(database_path) as connection:
        ensure_search_set_schema(connection)
        search_set_row = connection.execute(
            "SELECT id, display_name, slug FROM search_sets WHERE slug = ?",
            (slug,),
        ).fetchone()
        if search_set_row is None:
            raise LookupError(f"Collection not found: {slug}")

        term_rows = connection.execute(
            """
            SELECT term, active
            FROM search_set_terms
            WHERE search_set_id = ?
            ORDER BY id
            """,
            (search_set_row[0],),
        ).fetchall()

    return SearchSet(
        display_name=search_set_row[1],
        slug=search_set_row[2],
        terms=[SearchSetTerm(term=row[0], active=bool(row[1])) for row in term_rows],
    )


def list_search_sets(*, database_path: Path) -> list[SearchSet]:
    with sqlite3.connect(database_path) as connection:
        ensure_search_set_schema(connection)
        rows = connection.execute(
            "SELECT slug FROM search_sets ORDER BY id",
        ).fetchall()

    return [get_search_set(database_path=database_path, slug=row[0]) for row in rows]


def rename_search_set(
    *,
    database_path: Path,
    slug: str,
    display_name: str,
) -> SearchSet:
    next_display_name = display_name.strip()
    if not next_display_name:
        raise ValueError("Collection title is required.")
    next_slug = slugify_search_set_name(next_display_name)
    normalized_next_display_name = normalize_search_set_display_name(
        next_display_name
    )

    with sqlite3.connect(database_path) as connection:
        ensure_search_set_schema(connection)
        existing_rows = connection.execute(
            """
            SELECT slug, display_name
            FROM search_sets
            WHERE slug <> ?
            """,
            (slug,),
        ).fetchall()
        duplicate_row = next(
            (
                row
                for row in existing_rows
                if row[0] == next_slug
                or normalize_search_set_display_name(row[1])
                == normalized_next_display_name
            ),
            None,
        )
        if duplicate_row is not None:
            raise DuplicateSearchSetNameError(
                "A Collection with this name already exists."
            )

        cursor = connection.execute(
            """
            UPDATE search_sets
            SET display_name = ?
            WHERE slug = ?
            """,
            (next_display_name, slug),
        )
        if cursor.rowcount == 0:
            raise LookupError(f"Collection not found: {slug}")

    return get_search_set(database_path=database_path, slug=slug)


def deactivate_search_set_term(
    *,
    database_path: Path,
    slug: str,
    term: str,
) -> SearchSet:
    with sqlite3.connect(database_path) as connection:
        ensure_search_set_schema(connection)
        search_set_row = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (slug,),
        ).fetchone()
        if search_set_row is None:
            raise LookupError(f"Collection not found: {slug}")

        connection.execute(
            """
            UPDATE search_set_terms
            SET active = 0
            WHERE search_set_id = ? AND normalized_term = ?
            """,
            (search_set_row[0], normalize_search_term(term)),
        )

    return get_search_set(database_path=database_path, slug=slug)


def ensure_search_set_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS search_sets (
          id INTEGER PRIMARY KEY,
          display_name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS search_set_terms (
          id INTEGER PRIMARY KEY,
          search_set_id INTEGER NOT NULL,
          term TEXT NOT NULL,
          normalized_term TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (search_set_id) REFERENCES search_sets(id),
          UNIQUE (search_set_id, normalized_term)
        )
        """
    )


def ensure_provider_collection_schema(connection: sqlite3.Connection) -> None:
    ensure_search_set_schema(connection)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS provider_collections (
          id INTEGER PRIMARY KEY,
          search_set_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          FOREIGN KEY (search_set_id) REFERENCES search_sets(id),
          UNIQUE (search_set_id, provider)
        )
        """
    )


def ensure_provider_collection(
    *,
    connection: sqlite3.Connection,
    search_set_id: int,
    provider: str,
) -> int:
    ensure_provider_collection_schema(connection)
    connection.execute(
        """
        INSERT OR IGNORE INTO provider_collections (search_set_id, provider)
        VALUES (?, ?)
        """,
        (search_set_id, provider),
    )

    return connection.execute(
        """
        SELECT id
        FROM provider_collections
        WHERE search_set_id = ? AND provider = ?
        """,
        (search_set_id, provider),
    ).fetchone()[0]


def slugify_search_set_name(display_name: str) -> str:
    normalized_name = re.sub(r"[^a-z0-9]+", "-", display_name.casefold())
    return normalized_name.strip("-")
