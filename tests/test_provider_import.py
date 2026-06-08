import sqlite3

from anacronia.collection_runs import discover_provider_candidates
from anacronia.provider_import import (
    finish_provider_import_candidate,
    load_provider_import_run_context,
)
from anacronia.search_sets import create_or_continue_search_set
from anacronia.storage import initialize_storage


class FakeProviderCandidateClient:
    def search_object_ids(self, term: str) -> list[str]:
        assert term == "bed"
        return ["O1", "O2", "O3"]


def test_load_provider_import_run_context_returns_search_set_and_ordered_candidates(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bed Studies",
        terms_text="bed",
        provider="vam",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        candidate_offset=0,
        candidate_limit=3,
        candidate_client=FakeProviderCandidateClient(),
        batch_target=2,
    )

    with sqlite3.connect(storage.database_path) as connection:
        expected_search_set_id = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            ("bed-studies",),
        ).fetchone()[0]
        context = load_provider_import_run_context(
            connection=connection,
            run_id=run.run_id,
            start_run_position=1,
        )

    assert context.search_set_id == expected_search_set_id
    assert [
        (candidate.object_id, candidate.source_term, candidate.run_position)
        for candidate in context.candidates
    ] == [
        ("O2", "bed", 1),
        ("O3", "bed", 2),
    ]


def test_finish_provider_import_candidate_marks_progress_before_stop_check():
    calls: list[object] = []

    should_stop = finish_provider_import_candidate(
        run_position=4,
        on_candidate_processed=lambda run_position: calls.append(
            ("processed", run_position)
        ),
        should_stop=lambda: calls.append("stop-check") is None,
    )

    assert should_stop is True
    assert calls == [("processed", 4), "stop-check"]


def test_finish_provider_import_candidate_without_callbacks_keeps_running():
    assert (
        finish_provider_import_candidate(
            run_position=0,
            on_candidate_processed=None,
            should_stop=None,
        )
        is False
    )
