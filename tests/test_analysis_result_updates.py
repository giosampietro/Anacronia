import json
from datetime import datetime, timezone

from PIL import Image

from anacronia.analysis_jobs import AnalysisStageResult, run_analysis_job
from anacronia.analysis_result_updates import summarize_analysis_result_source_changes
from anacronia.curation import remove_image_asset_from_collection
from anacronia.local_folder_import import (
    create_local_folder_collection,
    import_local_image_folder,
)
from anacronia.storage import initialize_storage


def write_image(path, *, color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (640, 320), color=color).save(path)


class NoopStageRunner:
    def run_stage(self, _request):
        return AnalysisStageResult()


def create_analysis_result(tmp_path, *, collection_name="Stale Board"):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name=collection_name,
        folder_path=folder,
    )
    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["stale-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=NoopStageRunner(),
        created_at=datetime(2026, 6, 14, 14, 0, tzinfo=timezone.utc),
    )
    result_dir = storage.data_root / "analysis-results" / job.analysis_result_ids[0]
    return storage, folder, result_dir


def test_source_changes_report_unchanged_scope_and_update_defaults(tmp_path):
    storage, _folder, result_dir = create_analysis_result(tmp_path)
    manifest_rows = [
        json.loads(line)
        for line in (result_dir / "manifest.jsonl").read_text().splitlines()
    ]

    summary = summarize_analysis_result_source_changes(
        database_path=storage.database_path,
        data_root=storage.data_root,
        analysis_result_dir=result_dir,
    )

    assert summary.state == "ready"
    assert summary.active_image_ids == [
        row["image_id"] for row in manifest_rows
    ]
    assert summary.added_image_ids == []
    assert summary.removed_image_ids == []
    assert summary.run_updated_analysis_available is False
    assert summary.update_defaults.collection_slugs == ["stale-board"]
    assert summary.update_defaults.recipe_ids == ["dinov3_vits_384"]


def test_source_changes_report_removed_images_without_update_requirement(tmp_path):
    storage, _folder, result_dir = create_analysis_result(tmp_path)
    manifest_rows = [
        json.loads(line)
        for line in (result_dir / "manifest.jsonl").read_text().splitlines()
    ]
    removed_row = manifest_rows[0]
    kept_row = manifest_rows[1]
    assert remove_image_asset_from_collection(
        database_path=storage.database_path,
        search_set_slug="stale-board",
        image_asset_id=removed_row["image_asset_id"],
    )

    summary = summarize_analysis_result_source_changes(
        database_path=storage.database_path,
        data_root=storage.data_root,
        analysis_result_dir=result_dir,
    )

    assert summary.state == "stale"
    assert summary.active_image_ids == [kept_row["image_id"]]
    assert summary.removed_image_ids == [removed_row["image_id"]]
    assert summary.added_image_ids == []
    assert summary.run_updated_analysis_available is False


def test_source_changes_report_added_images_and_reuse_previous_choices(tmp_path):
    storage, folder, result_dir = create_analysis_result(tmp_path)
    original_rows = [
        json.loads(line)
        for line in (result_dir / "manifest.jsonl").read_text().splitlines()
    ]
    write_image(folder / "c.jpg", color=(70, 80, 90))
    import_local_image_folder(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="stale-board",
        folder_path=folder,
    )

    summary = summarize_analysis_result_source_changes(
        database_path=storage.database_path,
        data_root=storage.data_root,
        analysis_result_dir=result_dir,
    )

    assert summary.state == "stale"
    assert summary.active_image_ids == [
        row["image_id"] for row in original_rows
    ]
    assert summary.removed_image_ids == []
    assert summary.added_image_ids == ["image-asset-3"]
    assert summary.run_updated_analysis_available is True
    assert summary.update_defaults.collection_slugs == ["stale-board"]
    assert summary.update_defaults.recipe_ids == ["dinov3_vits_384"]


def test_source_changes_keep_old_active_points_separate_from_new_images(tmp_path):
    storage, folder, result_dir = create_analysis_result(tmp_path)
    original_rows = [
        json.loads(line)
        for line in (result_dir / "manifest.jsonl").read_text().splitlines()
    ]
    removed_row = original_rows[0]
    kept_row = original_rows[1]
    assert remove_image_asset_from_collection(
        database_path=storage.database_path,
        search_set_slug="stale-board",
        image_asset_id=removed_row["image_asset_id"],
    )
    write_image(folder / "c.jpg", color=(70, 80, 90))
    import_local_image_folder(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="stale-board",
        folder_path=folder,
    )

    summary = summarize_analysis_result_source_changes(
        database_path=storage.database_path,
        data_root=storage.data_root,
        analysis_result_dir=result_dir,
    )

    assert summary.state == "stale"
    assert summary.active_image_ids == [kept_row["image_id"]]
    assert summary.removed_image_ids == [removed_row["image_id"]]
    assert summary.added_image_ids == ["image-asset-3"]
    assert summary.run_updated_analysis_available is True
