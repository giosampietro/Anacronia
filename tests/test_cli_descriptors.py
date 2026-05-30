import json
import os
import sqlite3
import subprocess
import sys

from anacronia.collection_runs import discover_met_candidates
from anacronia.met_ingest import (
    get_met_descriptors,
    ingest_met_run,
)
from anacronia.search_sets import create_or_continue_search_set

from tests.test_met_ingest import (
    FakeMetCandidateClient,
    FakeMetRecordClient,
    ppm_image_bytes,
)


def test_cli_rebuilds_descriptors_from_retained_raw_records(tmp_path):
    data_root = tmp_path / "data"
    data_root.mkdir()
    database_path = data_root / "anacronia.sqlite"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=1,
        met_client=FakeMetCandidateClient(),
    )
    ingest_met_run(
        database_path=database_path,
        data_root=data_root,
        run_id=run.run_id,
        met_client=FakeMetRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    with sqlite3.connect(database_path) as connection:
        connection.execute("DELETE FROM descriptors")

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "anacronia.cli",
            "rebuild-descriptors",
        ],
        check=False,
        env={**os.environ, "ANACRONIA_DATA_ROOT": str(data_root)},
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0
    assert json.loads(result.stdout) == {
        "provider": "met",
        "rebuilt_object_count": 1,
        "descriptor_count": 6,
        "missing_raw_record_count": 0,
    }
    assert [
        descriptor.value
        for descriptor in get_met_descriptors(database_path=database_path, object_id=10)
    ] == [
        "Ceramics",
        "Terracotta",
        "Vessel",
        "Animals",
        "Snakes",
        "Coiled Snake Vessel",
    ]
