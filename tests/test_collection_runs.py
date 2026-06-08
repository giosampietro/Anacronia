from anacronia.collection_runs import (
    discover_met_candidates,
    discover_provider_candidates,
    get_candidate_run,
)
from anacronia.search_sets import create_or_continue_search_set, deactivate_search_set_term


class FakeMetCandidateClient:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def search_object_ids(self, term: str) -> list[int]:
        self.queries.append(term)
        return {
            "snake": [10, 20, 30],
            "anaconda": [20, 40],
        }[term]


class FakeVamCandidateClient:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def search_object_ids(self, term: str) -> list[str]:
        self.queries.append(term)
        return {
            "snake": ["O:10", "O:20"],
            "anaconda": ["O:20", "O:30"],
        }[term]


def test_discovers_met_candidates_from_active_search_set_terms(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake, anaconda, cobra",
    )
    deactivate_search_set_term(
        database_path=database_path,
        slug="snake-studies",
        term="cobra",
    )
    met_client = FakeMetCandidateClient()

    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        candidate_offset=1,
        candidate_limit=2,
        met_client=met_client,
    )

    assert met_client.queries == ["snake", "anaconda"]
    assert run.search_set_slug == "snake-studies"
    assert run.provider == "met"
    assert run.term_snapshot == ["snake", "anaconda"]
    assert run.candidate_offset == 1
    assert run.candidate_limit == 2
    assert run.candidate_progress_total == 2
    assert [(candidate.object_id, candidate.source_term) for candidate in run.candidates] == [
        ("20", "snake"),
        ("30", "snake"),
    ]

    persisted_run = get_candidate_run(database_path=database_path, run_id=run.run_id)

    assert persisted_run == run


def test_discovers_provider_candidates_with_string_source_object_ids(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake, anaconda",
    )
    vam_client = FakeVamCandidateClient()

    run = discover_provider_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        provider="vam",
        candidate_offset=1,
        candidate_limit=2,
        candidate_client=vam_client,
    )

    assert vam_client.queries == ["snake", "anaconda"]
    assert run.provider == "vam"
    assert [(candidate.object_id, candidate.source_term) for candidate in run.candidates] == [
        ("O:20", "snake"),
        ("O:30", "anaconda"),
    ]

    persisted_run = get_candidate_run(database_path=database_path, run_id=run.run_id)

    assert persisted_run == run
