from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
from typing import Protocol

from anacronia.search_sets import (
    ensure_provider_collection,
    ensure_provider_collection_schema,
    get_search_set,
)


MET_PROVIDER = "met"
DEFAULT_BATCH_TARGET = 100


class MetCandidateClient(Protocol):
    def search_object_ids(self, term: str) -> list[int]:
        pass


@dataclass(frozen=True)
class RunCandidate:
    object_id: int
    source_term: str
    source_term_index: int
    provider_position: int
    run_position: int


@dataclass(frozen=True)
class CandidateRun:
    run_id: int
    search_set_slug: str
    provider: str
    term_snapshot: list[str]
    candidate_offset: int
    candidate_limit: int
    candidate_progress_total: int
    batch_target: int
    status: str
    candidates: list[RunCandidate]


def discover_met_candidates(
    *,
    database_path: Path,
    search_set_slug: str,
    candidate_offset: int,
    candidate_limit: int,
    met_client: MetCandidateClient,
    batch_target: int = DEFAULT_BATCH_TARGET,
) -> CandidateRun:
    if candidate_offset < 0:
        raise ValueError("Candidate offset must be 0 or greater.")
    if candidate_limit < 1:
        raise ValueError("Candidate limit must be 1 or greater.")

    search_set = get_search_set(database_path=database_path, slug=search_set_slug)
    term_snapshot = [term.term for term in search_set.terms if term.active]
    merged_candidates = merge_met_candidate_object_ids(
        term_snapshot=term_snapshot,
        met_client=met_client,
    )
    selected_candidates = merged_candidates[candidate_offset : candidate_offset + candidate_limit]
    effective_candidate_limit = len(selected_candidates)

    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        search_set_id = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (search_set_slug,),
        ).fetchone()[0]
        provider_collection_id = ensure_provider_collection(
            connection=connection,
            search_set_id=search_set_id,
            provider=MET_PROVIDER,
        )
        cursor = connection.execute(
            """
            INSERT INTO collection_runs (
              provider_collection_id,
              provider,
              term_snapshot_json,
              candidate_offset,
              candidate_limit,
              batch_target,
              candidate_progress_total,
              candidate_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                provider_collection_id,
                MET_PROVIDER,
                json.dumps(term_snapshot),
                candidate_offset,
                effective_candidate_limit,
                batch_target,
                len(selected_candidates),
                len(merged_candidates),
            ),
        )
        run_id = int(cursor.lastrowid)

        for run_position, candidate in enumerate(selected_candidates):
            connection.execute(
                """
                INSERT INTO run_candidates (
                  run_id,
                  object_id,
                  source_term,
                  source_term_index,
                  provider_position,
                  run_position
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    candidate.object_id,
                    candidate.source_term,
                    candidate.source_term_index,
                    candidate.provider_position,
                    run_position,
                ),
            )

    return get_candidate_run(database_path=database_path, run_id=run_id)


def merge_met_candidate_object_ids(
    *,
    term_snapshot: list[str],
    met_client: MetCandidateClient,
) -> list[RunCandidate]:
    candidates: list[RunCandidate] = []
    seen_object_ids: set[int] = set()

    for term_index, term in enumerate(term_snapshot):
        for provider_position, object_id in enumerate(met_client.search_object_ids(term)):
            if object_id in seen_object_ids:
                continue

            seen_object_ids.add(object_id)
            candidates.append(
                RunCandidate(
                    object_id=object_id,
                    source_term=term,
                    source_term_index=term_index,
                    provider_position=provider_position,
                    run_position=len(candidates),
                )
            )

    return candidates


def get_candidate_run(*, database_path: Path, run_id: int) -> CandidateRun:
    with sqlite3.connect(database_path) as connection:
        ensure_collection_run_schema(connection)
        run_row = connection.execute(
            """
            SELECT
              collection_runs.provider,
              collection_runs.term_snapshot_json,
              collection_runs.candidate_offset,
              collection_runs.candidate_limit,
              collection_runs.batch_target,
              collection_runs.candidate_progress_total,
              collection_runs.status,
              search_sets.slug
            FROM collection_runs
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE collection_runs.id = ?
            """,
            (run_id,),
        ).fetchone()

        if run_row is None:
            raise LookupError(f"Run not found: {run_id}")

        candidate_rows = connection.execute(
            """
            SELECT object_id, source_term, source_term_index, provider_position, run_position
            FROM run_candidates
            WHERE run_id = ?
            ORDER BY run_position
            """,
            (run_id,),
        ).fetchall()

    return CandidateRun(
        run_id=run_id,
        search_set_slug=run_row[7],
        provider=run_row[0],
        term_snapshot=json.loads(run_row[1]),
        candidate_offset=run_row[2],
        candidate_limit=run_row[3],
        batch_target=run_row[4],
        candidate_progress_total=run_row[5],
        status=run_row[6],
        candidates=[
            RunCandidate(
                object_id=row[0],
                source_term=row[1],
                source_term_index=row[2],
                provider_position=row[3],
                run_position=row[4],
            )
            for row in candidate_rows
        ],
    )


def ensure_collection_run_schema(connection: sqlite3.Connection) -> None:
    ensure_provider_collection_schema(connection)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS collection_runs (
          id INTEGER PRIMARY KEY,
          provider_collection_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          term_snapshot_json TEXT NOT NULL,
          candidate_offset INTEGER NOT NULL,
          candidate_limit INTEGER NOT NULL,
          batch_target INTEGER NOT NULL DEFAULT 100,
          candidate_progress_total INTEGER NOT NULL,
          candidate_total INTEGER NOT NULL,
          processed_candidates INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'discovered',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_collection_id) REFERENCES provider_collections(id)
        )
        """
    )
    columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(collection_runs)").fetchall()
    }
    if "batch_target" not in columns:
        connection.execute(
            """
            ALTER TABLE collection_runs
            ADD COLUMN batch_target INTEGER NOT NULL DEFAULT 100
            """
        )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS run_candidates (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL,
          object_id INTEGER NOT NULL,
          source_term TEXT NOT NULL,
          source_term_index INTEGER NOT NULL,
          provider_position INTEGER NOT NULL,
          run_position INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES collection_runs(id),
          UNIQUE (run_id, object_id)
        )
        """
    )
