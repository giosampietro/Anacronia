from anacronia.search_sets import (
    create_or_continue_search_set,
    deactivate_search_set_term,
    parse_search_terms,
)
from anacronia.storage import initialize_storage


def test_parses_search_set_terms_from_commas_and_lines():
    terms = parse_search_terms("snake, anaconda, serpet\ngarden snake")

    assert terms == ["snake", "anaconda", "serpet", "garden snake"]


def test_deduplicates_search_set_terms_case_insensitively():
    terms = parse_search_terms(" snake, Snake\nSNAKE, anaconda ")

    assert terms == ["snake", "anaconda"]


def test_creates_search_set_with_display_name_slug_and_terms(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake, anaconda, serpet",
    )

    assert search_set.display_name == "Snake Studies"
    assert search_set.slug == "snake-studies"
    assert [term.term for term in search_set.terms] == ["snake", "anaconda", "serpet"]
    assert [term.active for term in search_set.terms] == [True, True, True]


def test_continues_existing_search_set_and_appends_new_terms(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake, anaconda",
    )
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="snake studies",
        terms_text="Snake, cobra",
    )

    assert search_set.display_name == "Snake Studies"
    assert search_set.slug == "snake-studies"
    assert [term.term for term in search_set.terms] == ["snake", "anaconda", "cobra"]


def test_deactivates_search_set_term_without_deleting_it(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Studies",
        terms_text="snake, anaconda",
    )

    search_set = deactivate_search_set_term(
        database_path=storage.database_path,
        slug="snake-studies",
        term="SNAKE",
    )

    assert [(term.term, term.active) for term in search_set.terms] == [
        ("snake", False),
        ("anaconda", True),
    ]
