import sqlite3

from anacronia.storage import (
    initialize_storage,
    met_image_derivative_path,
    met_raw_object_path,
    resolve_data_root,
)


def test_initializes_default_data_root_and_sqlite_database(tmp_path):
    storage = initialize_storage(project_root=tmp_path)

    assert storage.data_root == tmp_path / "data"
    assert storage.database_path == tmp_path / "data" / "anacronia.sqlite"
    assert storage.data_root.is_dir()
    assert storage.database_path.is_file()

    with sqlite3.connect(storage.database_path) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)


def test_resolves_configured_data_root_from_environment(tmp_path):
    configured_data_root = tmp_path / "external-anacronia-data"

    data_root = resolve_data_root(
        project_root=tmp_path / "project",
        environment={"ANACRONIA_DATA_ROOT": str(configured_data_root)},
    )

    assert data_root == configured_data_root


def test_initializes_sqlite_database_in_configured_data_root(tmp_path):
    configured_data_root = tmp_path / "external-anacronia-data"

    storage = initialize_storage(
        project_root=tmp_path / "project",
        environment={"ANACRONIA_DATA_ROOT": str(configured_data_root)},
    )

    assert storage.data_root == configured_data_root
    assert storage.database_path == configured_data_root / "anacronia.sqlite"
    assert storage.database_path.is_file()


def test_builds_met_raw_object_path_with_numeric_range_folder(tmp_path):
    path = met_raw_object_path(data_root=tmp_path / "data", object_id=436535)

    assert path == tmp_path / "data" / "met" / "raw-api" / "objects" / "436000-436999" / "436535.json"


def test_builds_met_image_derivative_path_with_standard_filename(tmp_path):
    path = met_image_derivative_path(
        data_root=tmp_path / "data",
        object_id=436535,
        image_role="primary",
        derivative="standard-1024",
    )

    assert path == tmp_path / "data" / "met" / "images" / "436000-436999" / "436535" / "primary-standard-1024.jpg"


def test_builds_met_additional_image_derivative_path_with_padded_index(tmp_path):
    path = met_image_derivative_path(
        data_root=tmp_path / "data",
        object_id=436535,
        image_role="additional",
        image_index=1,
        derivative="thumb-256",
    )

    assert path == tmp_path / "data" / "met" / "images" / "436000-436999" / "436535" / "additional-001-thumb-256.jpg"
