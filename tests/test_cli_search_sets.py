import json
import os
import subprocess
import sys

from anacronia.search_sets import get_search_set


def test_cli_creates_search_set_from_name_and_comma_separated_terms(tmp_path):
    data_root = tmp_path / "data"
    environment = {
        **os.environ,
        "ANACRONIA_DATA_ROOT": str(data_root),
    }

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "anacronia.cli",
            "search-set",
            "create",
            "--name",
            "Snake Studies",
            "--terms",
            "snake, anaconda, serpet",
        ],
        check=False,
        env=environment,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0
    assert json.loads(result.stdout) == {
        "display_name": "Snake Studies",
        "slug": "snake-studies",
        "terms": [
            {"term": "snake", "active": True},
            {"term": "anaconda", "active": True},
            {"term": "serpet", "active": True},
        ],
    }

    search_set = get_search_set(database_path=data_root / "anacronia.sqlite", slug="snake-studies")
    assert [term.term for term in search_set.terms] == ["snake", "anaconda", "serpet"]


def test_cli_deactivates_search_set_term(tmp_path):
    data_root = tmp_path / "data"
    environment = {
        **os.environ,
        "ANACRONIA_DATA_ROOT": str(data_root),
    }
    subprocess.run(
        [
            sys.executable,
            "-m",
            "anacronia.cli",
            "search-set",
            "create",
            "--name",
            "Snake Studies",
            "--terms",
            "snake, anaconda",
        ],
        check=True,
        env=environment,
        text=True,
        capture_output=True,
    )

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "anacronia.cli",
            "search-set",
            "deactivate-term",
            "--slug",
            "snake-studies",
            "--term",
            "SNAKE",
        ],
        check=False,
        env=environment,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0
    assert json.loads(result.stdout)["terms"] == [
        {"term": "snake", "active": False},
        {"term": "anaconda", "active": True},
    ]
