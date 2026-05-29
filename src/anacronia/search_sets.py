from dataclasses import dataclass
from pathlib import Path
import re
import sqlite3


@dataclass(frozen=True)
class SearchSetTerm:
    term: str
    active: bool


@dataclass(frozen=True)
class SearchSet:
    display_name: str
    slug: str
    terms: list[SearchSetTerm]


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

    with sqlite3.connect(database_path) as connection:
        ensure_search_set_schema(connection)
        connection.execute(
            "INSERT OR IGNORE INTO search_sets (display_name, slug) VALUES (?, ?)",
            (display_name.strip(), slug),
        )
        search_set_id = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (slug,),
        ).fetchone()[0]

        for term in terms:
            connection.execute(
                """
                INSERT OR IGNORE INTO search_set_terms
                  (search_set_id, term, normalized_term, active)
                VALUES (?, ?, ?, 1)
                """,
                (search_set_id, term, normalize_search_term(term)),
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


def slugify_search_set_name(display_name: str) -> str:
    normalized_name = re.sub(r"[^a-z0-9]+", "-", display_name.casefold())
    return normalized_name.strip("-")
