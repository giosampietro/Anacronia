import subprocess


def test_generated_met_data_paths_are_ignored_by_git():
    result = subprocess.run(
        [
            "git",
            "check-ignore",
            "--quiet",
            "data/met/raw-api/objects/436000-436999/436535.json",
        ],
        check=False,
    )

    assert result.returncode == 0
