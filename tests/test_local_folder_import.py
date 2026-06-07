import sqlite3
from pathlib import Path

from PIL import Image

from anacronia.collection_objects import (
    get_collection_object_detail,
    get_collection_local_result_set,
    get_library_local_result_set,
)
from anacronia.curation import remove_object_from_collection
from anacronia.image_pipeline import ImageDerivativeSettings, validate_image_derivative
from anacronia.local_folder_import import (
    LOCAL_FOLDER_PROVIDER,
    create_local_folder_collection,
    discover_local_image_files,
    import_local_image_folder,
    local_folder_object_id,
    local_folder_source_image_identity,
    sha256_file,
)
from anacronia.search_sets import create_or_continue_search_set
from anacronia.storage import initialize_storage


def write_image(path, *, size=(640, 320), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def test_discovers_supported_local_images_recursively(tmp_path):
    folder = tmp_path / "folder"
    write_image(folder / "root.jpg")
    write_image(folder / "nested" / "inside.png")
    (folder / "notes.txt").write_text("not an image", encoding="utf-8")

    assert [
        path.relative_to(folder)
        for path in discover_local_image_files(folder)
    ] == [
        (folder / "nested" / "inside.png").relative_to(folder),
        (folder / "root.jpg").relative_to(folder),
    ]


def test_imports_plain_local_folder_without_metadata_or_rights(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    image_path = folder / "sketch.png"
    write_image(image_path, size=(320, 160))

    summary = create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Studio Sketches",
        folder_path=folder,
    )
    object_id = local_folder_object_id(sha256_file(image_path))

    assert summary.search_set_slug == "studio-sketches"
    assert summary.discovered_file_count == 1
    assert summary.imported_object_ids == [object_id]
    assert summary.imported_image_count == 1
    assert summary.skipped_files == []
    detail = get_collection_object_detail(
        database_path=storage.database_path,
        search_set_slug="studio-sketches",
        provider=LOCAL_FOLDER_PROVIDER,
        object_id=object_id,
    )
    assert detail is not None
    assert detail.object.provider == LOCAL_FOLDER_PROVIDER
    assert detail.object.title == "sketch"
    assert detail.object.object_name == "Local image"
    assert detail.object.object_url == ""
    assert detail.object.is_public_domain is False
    assert detail.object.rights_and_reproduction == ""
    assert detail.object.tags == []
    assert detail.images[0].source_image_url == local_folder_source_image_identity(
        sha256_file(image_path)
    )
    assert detail.images[0].source_file_path == str(image_path.resolve())

    with sqlite3.connect(storage.database_path) as connection:
        row = connection.execute(
            """
            SELECT standard_path, thumb_path
            FROM image_assets
            WHERE provider = ? AND object_id = ?
            """,
            (LOCAL_FOLDER_PROVIDER, object_id),
        ).fetchone()
    assert row is not None
    assert validate_image_derivative(
        path=Path(row[0]),
        settings=ImageDerivativeSettings(
            derivative="standard-1024",
            long_edge=1024,
            jpeg_quality=90,
        ),
    )
    assert validate_image_derivative(
        path=Path(row[1]),
        settings=ImageDerivativeSettings(
            derivative="thumb-256",
            long_edge=256,
            jpeg_quality=75,
        ),
    )


def test_dedupes_same_file_bytes_and_can_join_multiple_collections(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg")
    write_image(folder / "duplicates" / "b.jpg")
    object_id = local_folder_object_id(sha256_file(folder / "a.jpg"))

    first_summary = create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="First Folder",
        folder_path=folder,
    )
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Second Folder",
        terms_text="",
        provider=LOCAL_FOLDER_PROVIDER,
        allow_empty_terms=True,
    )
    second_summary = import_local_image_folder(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="second-folder",
        folder_path=folder,
    )

    assert first_summary.imported_object_ids == [object_id]
    assert [skipped.reason for skipped in first_summary.skipped_files] == [
        "duplicate_file_content"
    ]
    assert second_summary.imported_object_ids == [object_id]
    with sqlite3.connect(storage.database_path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM image_assets WHERE provider = ? AND object_id = ?",
            (LOCAL_FOLDER_PROVIDER, object_id),
        ).fetchone()[0] == 1
        assert connection.execute(
            """
            SELECT COUNT(*)
            FROM collection_object_memberships
            WHERE provider = ? AND object_id = ? AND active = 1
            """,
            (LOCAL_FOLDER_PROVIDER, object_id),
        ).fetchone()[0] == 2


def test_can_suppress_source_file_links_for_temporary_browser_uploads(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    image_path = folder / "sketch.png"
    write_image(image_path)

    summary = create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Browser Upload",
        folder_path=folder,
        store_source_file_links=False,
    )
    detail = get_collection_object_detail(
        database_path=storage.database_path,
        search_set_slug=summary.search_set_slug,
        provider=LOCAL_FOLDER_PROVIDER,
        object_id=summary.imported_object_ids[0],
    )

    assert detail is not None
    assert detail.images[0].source_file_path == ""


def test_collection_exclusion_blocks_local_folder_readd(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "sketch.jpg")
    object_id = local_folder_object_id(sha256_file(folder / "sketch.jpg"))

    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Sketches",
        folder_path=folder,
    )
    assert remove_object_from_collection(
        database_path=storage.database_path,
        search_set_slug="sketches",
        provider=LOCAL_FOLDER_PROVIDER,
        object_id=object_id,
    )

    summary = import_local_image_folder(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="sketches",
        folder_path=folder,
    )

    assert summary.imported_object_ids == []
    assert [skipped.reason for skipped in summary.skipped_files] == [
        "collection_object_excluded"
    ]
    assert get_collection_local_result_set(
        database_path=storage.database_path,
        search_set_slug="sketches",
        query_text="",
        provider=LOCAL_FOLDER_PROVIDER,
        view="objects",
    ).counts.objects == 0
    assert get_library_local_result_set(
        database_path=storage.database_path,
        query_text="",
        provider=LOCAL_FOLDER_PROVIDER,
        view="objects",
    ).counts.objects == 1


def test_skips_corrupt_and_unsupported_files(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "valid.jpg")
    (folder / "corrupt.png").write_bytes(b"not really an image")
    (folder / "notes.txt").write_text("ignore me", encoding="utf-8")

    summary = create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Mixed Folder",
        folder_path=folder,
    )

    assert summary.imported_image_count == 1
    assert sorted(skipped.reason for skipped in summary.skipped_files) == [
        "image_processing_failed",
        "unsupported_file_type",
    ]
