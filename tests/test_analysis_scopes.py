import json
import shutil
from datetime import datetime, timezone

from PIL import Image

from anacronia.analysis_scopes import (
    create_analysis_scope_snapshot,
    resolve_analysis_scope,
)
from anacronia.collection_objects import list_collection_image_assets
from anacronia.curation import (
    delete_image_asset_from_anacronia,
    remove_image_asset_from_collection,
)
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.storage import initialize_storage


def write_image(path, *, size=(640, 320), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def test_saves_one_collection_scope_snapshot_with_active_image_assets(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg")
    write_image(folder / "b.png", color=(180, 80, 40))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Mood Board",
        folder_path=folder,
    )

    snapshot = create_analysis_scope_snapshot(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["mood-board"],
        created_at=datetime(2026, 6, 14, 10, 30, tzinfo=timezone.utc),
    )

    payload = json.loads(snapshot.snapshot_path.read_text(encoding="utf-8"))
    serialized = json.dumps(payload)
    assert snapshot.snapshot_path == (
        storage.data_root
        / "analysis-scopes"
        / snapshot.snapshot_id
        / "analysis-scope.json"
    )
    assert payload["asset_kind"] == "analysis-scope-snapshot"
    assert payload["scope"] == {
        "kind": "collections",
        "collection_slugs": ["mood-board"],
    }
    assert payload["counts"] == {
        "selected_collections": 1,
        "candidate_memberships": 2,
        "active_memberships": 2,
        "active_images": 2,
        "duplicates_collapsed": 0,
        "missing_or_removed_material": 0,
    }
    assert [item["contributing_collections"] for item in payload["items"]] == [
        [{"slug": "mood-board", "display_name": "Mood Board"}],
        [{"slug": "mood-board", "display_name": "Mood Board"}],
    ]
    assert all(
        item["source_identity"]["source_type"] == "local-folder"
        for item in payload["items"]
    )
    first_derivatives = payload["items"][0]["derivatives"]
    assert first_derivatives["standard-1024"]["artifact_key"].endswith(
        "/primary-standard-1024.jpg"
    )
    assert first_derivatives["thumb-256"]["artifact_key"].endswith(
        "/primary-thumb-256.jpg"
    )
    assert not first_derivatives["standard-1024"]["artifact_key"].startswith("/")
    assert not first_derivatives["thumb-256"]["artifact_key"].startswith("/")
    assert str(tmp_path) not in serialized


def test_resolves_scope_counts_without_writing_snapshot(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg")
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Resolver Board",
        folder_path=folder,
    )

    resolved_scope = resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["resolver-board"],
    )

    assert resolved_scope.item_count == 1
    assert resolved_scope.counts["active_images"] == 1
    assert not (storage.data_root / "analysis-scopes").exists()


def test_multi_collection_scope_collapses_duplicate_assets_and_records_contributors(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    first_folder = tmp_path / "first"
    second_folder = tmp_path / "second"
    write_image(first_folder / "shared.jpg", color=(10, 20, 30))
    write_image(first_folder / "first-only.jpg", color=(40, 50, 60))
    second_folder.mkdir()
    shutil.copyfile(first_folder / "shared.jpg", second_folder / "shared-copy.jpg")
    write_image(second_folder / "second-only.jpg", color=(70, 80, 90))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Jewelry",
        folder_path=first_folder,
    )
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Vases",
        folder_path=second_folder,
    )

    snapshot = create_analysis_scope_snapshot(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["snake-jewelry", "snake-vases"],
        created_at=datetime(2026, 6, 14, 10, 40, tzinfo=timezone.utc),
    )

    payload = json.loads(snapshot.snapshot_path.read_text(encoding="utf-8"))
    shared_items = [
        item
        for item in payload["items"]
        if len(item["contributing_collections"]) == 2
    ]
    assert payload["scope"]["collection_slugs"] == ["snake-jewelry", "snake-vases"]
    assert payload["counts"] == {
        "selected_collections": 2,
        "candidate_memberships": 4,
        "active_memberships": 4,
        "active_images": 3,
        "duplicates_collapsed": 1,
        "missing_or_removed_material": 0,
    }
    assert len(shared_items) == 1
    assert shared_items[0]["contributing_collections"] == [
        {"slug": "snake-jewelry", "display_name": "Snake Jewelry"},
        {"slug": "snake-vases", "display_name": "Snake Vases"},
    ]


def test_scope_snapshot_excludes_removed_and_deleted_material(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "keep.jpg", color=(10, 20, 30))
    write_image(folder / "remove.jpg", color=(40, 50, 60))
    write_image(folder / "delete.jpg", color=(70, 80, 90))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Editing Board",
        folder_path=folder,
    )
    assets_by_title = {
        image_asset.title: image_asset
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="editing-board",
        )
    }
    assert remove_image_asset_from_collection(
        database_path=storage.database_path,
        search_set_slug="editing-board",
        image_asset_id=assets_by_title["remove"].image_asset_id,
    )
    assert delete_image_asset_from_anacronia(
        database_path=storage.database_path,
        image_asset_id=assets_by_title["delete"].image_asset_id,
    )

    snapshot = create_analysis_scope_snapshot(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["editing-board"],
        created_at=datetime(2026, 6, 14, 10, 50, tzinfo=timezone.utc),
    )

    payload = json.loads(snapshot.snapshot_path.read_text(encoding="utf-8"))
    assert payload["counts"] == {
        "selected_collections": 1,
        "candidate_memberships": 3,
        "active_memberships": 1,
        "active_images": 1,
        "duplicates_collapsed": 0,
        "missing_or_removed_material": 2,
    }
    assert len(payload["items"]) == 1


def test_saved_scope_snapshot_is_immutable_after_collection_membership_changes(
    tmp_path,
):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "first.jpg", color=(10, 20, 30))
    write_image(folder / "second.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Immutable Board",
        folder_path=folder,
    )

    first_snapshot = create_analysis_scope_snapshot(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["immutable-board"],
        created_at=datetime(2026, 6, 14, 11, 0, tzinfo=timezone.utc),
    )
    first_payload_before_change = first_snapshot.snapshot_path.read_text(
        encoding="utf-8"
    )
    removable_asset = list_collection_image_assets(
        database_path=storage.database_path,
        search_set_slug="immutable-board",
    )[0]

    assert remove_image_asset_from_collection(
        database_path=storage.database_path,
        search_set_slug="immutable-board",
        image_asset_id=removable_asset.image_asset_id,
    )
    second_snapshot = create_analysis_scope_snapshot(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["immutable-board"],
        created_at=datetime(2026, 6, 14, 11, 5, tzinfo=timezone.utc),
    )

    first_payload = json.loads(
        first_snapshot.snapshot_path.read_text(encoding="utf-8")
    )
    second_payload = json.loads(
        second_snapshot.snapshot_path.read_text(encoding="utf-8")
    )
    assert first_snapshot.snapshot_id != second_snapshot.snapshot_id
    assert (
        first_snapshot.snapshot_path.read_text(encoding="utf-8")
        == first_payload_before_change
    )
    assert first_payload["counts"]["active_images"] == 2
    assert second_payload["counts"]["active_images"] == 1
    assert second_payload["counts"]["missing_or_removed_material"] == 1
