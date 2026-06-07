from anacronia.collection_runs import discover_met_candidates, get_candidate_run
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
