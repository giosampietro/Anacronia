from dataclasses import dataclass
import sqlite3
from typing import Callable

from anacronia.provider_identity import ProviderObjectIdValue


@dataclass(frozen=True)
class ProviderRunCandidate:
    object_id: ProviderObjectIdValue
    source_term: str
    run_position: int


@dataclass(frozen=True)
class ProviderImportRunContext:
    search_set_id: int
    candidates: list[ProviderRunCandidate]


def load_provider_import_run_context(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    start_run_position: int = 0,
) -> ProviderImportRunContext:
    return ProviderImportRunContext(
        search_set_id=get_provider_search_set_id_for_run(
            connection=connection,
            run_id=run_id,
        ),
        candidates=list_provider_run_candidates(
            connection=connection,
            run_id=run_id,
            start_run_position=start_run_position,
        ),
    )


def list_provider_run_candidates(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    start_run_position: int = 0,
) -> list[ProviderRunCandidate]:
    rows = connection.execute(
        """
        SELECT object_id, source_term, run_position
        FROM run_candidates
        WHERE run_id = ? AND run_position >= ?
        ORDER BY run_position
        """,
        (run_id, start_run_position),
    ).fetchall()

    return [
        ProviderRunCandidate(
            object_id=row[0],
            source_term=row[1],
            run_position=int(row[2]),
        )
        for row in rows
    ]


def get_provider_search_set_id_for_run(
    *,
    connection: sqlite3.Connection,
    run_id: int,
) -> int:
    row = connection.execute(
        """
        SELECT provider_collections.search_set_id
        FROM collection_runs
        JOIN provider_collections
          ON provider_collections.id = collection_runs.provider_collection_id
        WHERE collection_runs.id = ?
        """,
        (run_id,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Unknown Run: {run_id}")
    return int(row[0])


def finish_provider_import_candidate(
    *,
    run_position: int,
    on_candidate_processed: Callable[[int], None] | None,
    should_stop: Callable[[], bool] | None,
) -> bool:
    if on_candidate_processed is not None:
        on_candidate_processed(run_position)
    return should_stop() if should_stop is not None else False
