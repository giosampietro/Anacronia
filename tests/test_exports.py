import csv
import json
import sqlite3

import pytest
from PIL import Image

from anacronia.collection_runs import (
    discover_met_candidates,
    discover_provider_candidates,
)
from anacronia.exports import (
    NoExportableAssetsError,
    export_collection,
    export_user_library,
)
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.met_ingest import ingest_met_run
from anacronia.search_sets import create_or_continue_search_set
from anacronia.storage import initialize_storage
from anacronia.vam_adapter import ingest_vam_run

from tests.test_met_ingest import ppm_image_bytes
from tests.test_vam_adapter import (
    FakeVamCandidateClient,
    FakeVamRecordClient,
    SensitiveVamRecordClient,
    ppm_image_bytes as vam_ppm_image_bytes,
)


def write_export_test_image(path, *, size=(640, 320)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=(40, 130, 180)).save(path)


class ExportCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        assert term == "snake"
        return [40]


class ExportRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        assert object_id == 40
        return {
            "objectID": 40,
            "isPublicDomain": True,
            "title": "Coiled Snake Bowl",
            "objectName": "Bowl",
            "artistDisplayName": "Unknown maker",
            "tags": [{"term": "Snake"}, {"term": "Ceremony"}],
            "medium": "Terracotta",
            "classification": "Ceramics",
            "culture": "Moche",
            "period": "Early Intermediate Period",
            "objectDate": "3rd-7th century",
            "country": "Peru",
            "primaryImage": "https://images.metmuseum.org/40-primary.jpg",
            "additionalImages": ["https://images.metmuseum.org/40-detail-a.jpg"],
            "objectURL": "https://www.metmuseum.org/art/collection/search/40",
            "rightsAndReproduction": "Public domain",
            "metadataDate": "2026-01-02",
        }


def build_exportable_collection(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
        provider="met",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        candidate_offset=0,
        candidate_limit=1,
        met_client=ExportCandidateClient(),
    )
    ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=ExportRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )
    return storage


def build_vam_exportable_collection(tmp_path, *, record_client=None):
    storage = initialize_storage(project_root=tmp_path)
    resolved_record_client = record_client or FakeVamRecordClient()
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bed Study",
        terms_text="bed",
        provider="vam",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="bed-study",
        provider="vam",
        candidate_offset=0,
        candidate_limit=1,
        candidate_client=FakeVamCandidateClient(),
        batch_target=2,
    )
    ingest_vam_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        vam_client=resolved_record_client,
        download_image_bytes=lambda _url: vam_ppm_image_bytes(width=1600, height=800),
        max_images_per_object=2,
        batch_target=2,
    )
    return storage


def get_image_asset_ids(database_path):
    with sqlite3.connect(database_path) as connection:
        return [
            int(row[0])
            for row in connection.execute(
                "SELECT id FROM image_assets ORDER BY id"
            ).fetchall()
        ]


def test_exports_collection_jsonl_rows_with_descriptors_and_semantic_text(tmp_path):
    storage = build_exportable_collection(tmp_path)

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 2
    assert result.skipped_image_asset_count == 0
    assert result.export_path == storage.data_root / "exports" / "snake-study" / "jsonl-260530-1234Z"

    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert len(rows) == 2
    assert rows[0]["collection"] == {
        "slug": "snake-study",
        "title": "Snake Study",
        "scope": "collection",
    }
    assert rows[0]["image_asset"]["provider"] == "met"
    assert rows[0]["image_asset"]["object_id"] == "40"
    assert rows[0]["image_asset"]["source_type"] == "online-provider"
    assert rows[0]["image_asset"]["source_identity"] == (
        "online-provider:met:40:https://images.metmuseum.org/40-primary.jpg"
    )
    assert rows[0]["image_asset"]["source_object_identity"] == "met:40"
    assert rows[0]["image_asset"]["source_image_url"] == "https://images.metmuseum.org/40-primary.jpg"
    assert rows[0]["image_asset"]["source_image_identity"] == (
        "met:https://images.metmuseum.org/40-primary.jpg"
    )
    assert rows[0]["image_asset"]["source_system_number"] == ""
    assert rows[0]["image_asset"]["source_iiif_image_url"] == ""
    assert rows[0]["image_asset"]["standard_path"].endswith("/primary-standard-1024.jpg")
    assert rows[0]["image_asset"]["thumb_path"].endswith("/primary-thumb-256.jpg")
    assert rows[0]["image_asset"]["is_favorite"] is False
    assert rows[0]["museum_object"] == {
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "object_url": "https://www.metmuseum.org/art/collection/search/40",
        "rights_and_reproduction": "Public domain",
        "metadata_date": "2026-01-02",
        "is_favorite": False,
    }
    assert rows[0]["matches"] == [
        {
            "search_term": "snake",
            "verified": True,
            "matched_fields": ["tags", "title"],
        }
    ]
    assert {
        (descriptor["provider"], descriptor["type"], descriptor["value"], descriptor["normalized_value"], descriptor["source_field"])
        for descriptor in rows[0]["descriptors"]
    } >= {
        ("met", "tag", "Snake", "snake", "tags.term"),
        ("met", "medium", "Terracotta", "terracotta", "medium"),
        ("met", "classification", "Ceramics", "ceramics", "classification"),
    }
    assert rows[0]["semantic_text"] == (
        "Coiled Snake Bowl. Object name: Bowl. Tags: Ceremony; Snake. "
        "Medium: Terracotta. Classification: Ceramics. Culture: Moche. "
        "Period: Early Intermediate Period. Date: 3rd-7th century. Place: Peru."
    )


def test_exports_local_folder_without_source_url_or_rights_implication(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_export_test_image(folder / "sketch.jpg")
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Studio Folder",
        folder_path=folder,
    )

    jsonl_result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="studio-folder",
        export_format="jsonl",
        timestamp="260530-1234Z",
    )
    csv_result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="studio-folder",
        export_format="csv",
        timestamp="260530-1235Z",
    )

    manifest_row = json.loads(
        (jsonl_result.export_path / "manifest.jsonl").read_text(encoding="utf-8")
    )
    assert manifest_row["image_asset"]["provider"] == "local-folder"
    assert manifest_row["image_asset"]["source_type"] == "local-folder"
    assert manifest_row["image_asset"]["source_object_identity"].startswith(
        "local-folder:sha256-"
    )
    assert manifest_row["image_asset"]["source_image_url"] == ""
    assert manifest_row["image_asset"]["source_image_identity"].startswith(
        "local-folder:sha256:"
    )
    assert manifest_row["image_asset"]["source_identity"] == (
        manifest_row["image_asset"]["source_image_identity"]
    )
    assert str(folder.resolve()) not in json.dumps(manifest_row)
    assert manifest_row["museum_object"]["object_url"] == ""
    assert manifest_row["museum_object"]["rights_and_reproduction"] == ""
    assert manifest_row["matches"] == []
    assert manifest_row["descriptors"] == []

    with (csv_result.export_path / "metadata.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert rows[0]["source_type"] == "local-folder"
    assert rows[0]["source_object_identity"].startswith("local-folder:sha256-")
    assert rows[0]["source_image_url"] == ""
    assert rows[0]["source_image_identity"].startswith("local-folder:sha256:")
    assert rows[0]["source_identity"] == rows[0]["source_image_identity"]
    assert str(folder.resolve()) not in json.dumps(rows[0])


def test_exports_vam_package_with_source_identity_and_iiif_metadata(tmp_path):
    storage = build_vam_exportable_collection(
        tmp_path,
        record_client=SensitiveVamRecordClient(),
    )
    iiif_image_url = (
        "https://framemark.vam.ac.uk/collections/2006AL3614/full/full/0/default.jpg"
    )

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="bed-study",
        export_format="package",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 2
    manifest_rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert manifest_rows[0]["image_asset"]["provider"] == "vam"
    assert manifest_rows[0]["image_asset"]["object_id"] == "O9138"
    assert manifest_rows[0]["image_asset"]["source_type"] == "online-provider"
    assert manifest_rows[0]["image_asset"]["source_identity"] == (
        f"online-provider:vam:O9138:{iiif_image_url}"
    )
    assert manifest_rows[0]["image_asset"]["source_object_identity"] == "vam:O9138"
    assert manifest_rows[0]["image_asset"]["source_image_identity"] == (
        f"vam:{iiif_image_url}"
    )
    assert manifest_rows[0]["image_asset"]["source_image_url"] == iiif_image_url
    assert manifest_rows[0]["image_asset"]["source_system_number"] == "O9138"
    assert manifest_rows[0]["image_asset"]["source_iiif_image_url"] == iiif_image_url
    assert manifest_rows[0]["image_asset"]["source_sensitive_image"] is True
    assert manifest_rows[1]["image_asset"]["source_sensitive_image"] is False

    with (result.export_path / "metadata.csv").open(encoding="utf-8", newline="") as handle:
        csv_rows = list(csv.DictReader(handle))
    assert csv_rows[0]["source_type"] == "online-provider"
    assert csv_rows[0]["source_identity"] == (
        f"online-provider:vam:O9138:{iiif_image_url}"
    )
    assert csv_rows[0]["source_object_identity"] == "vam:O9138"
    assert csv_rows[0]["source_image_identity"] == f"vam:{iiif_image_url}"
    assert csv_rows[0]["source_system_number"] == "O9138"
    assert csv_rows[0]["source_iiif_image_url"] == iiif_image_url
    assert csv_rows[0]["source_sensitive_image"] == "true"
    assert csv_rows[1]["source_sensitive_image"] == "false"


def test_exports_selected_image_asset_jsonl_rows_only_selected_asset(tmp_path):
    storage = build_exportable_collection(tmp_path)
    selected_image_asset_id = get_image_asset_ids(storage.database_path)[0]

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        selected_image_asset_ids=[selected_image_asset_id],
        timestamp="260530-1234Z",
    )

    assert result.row_count == 1
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert [row["image_asset"]["image_asset_id"] for row in rows] == [
        selected_image_asset_id
    ]


def test_exports_selected_object_jsonl_rows_expand_to_object_image_assets(tmp_path):
    storage = build_exportable_collection(tmp_path)

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        selected_objects=[("met", 40)],
        timestamp="260530-1234Z",
    )

    assert result.row_count == 2
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert {row["image_asset"]["object_id"] for row in rows} == {"40"}
    assert {row["image_asset"]["source_image_url"] for row in rows} == {
        "https://images.metmuseum.org/40-primary.jpg",
        "https://images.metmuseum.org/40-detail-a.jpg",
    }


def test_exports_selected_unknown_image_asset_ids_do_not_export_collection_assets(tmp_path):
    storage = build_exportable_collection(tmp_path)

    with pytest.raises(NoExportableAssetsError):
        export_collection(
            database_path=storage.database_path,
            data_root=storage.data_root,
            search_set_slug="snake-study",
            export_format="jsonl",
            selected_image_asset_ids=[999_999],
            timestamp="260530-1234Z",
        )

    assert not (storage.data_root / "exports" / "snake-study").exists()


def test_exports_collection_csv_with_flat_stable_columns(tmp_path):
    storage = build_exportable_collection(tmp_path)

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="csv",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 2
    csv_path = result.export_path / "metadata.csv"
    with csv_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    assert rows[0]["collection_slug"] == "snake-study"
    assert rows[0]["collection_title"] == "Snake Study"
    assert rows[0]["source_type"] == "online-provider"
    assert rows[0]["source_identity"] == (
        "online-provider:met:40:https://images.metmuseum.org/40-primary.jpg"
    )
    assert rows[0]["source_object_identity"] == "met:40"
    assert rows[0]["source_image_identity"] == (
        "met:https://images.metmuseum.org/40-primary.jpg"
    )
    assert rows[0]["source_system_number"] == ""
    assert rows[0]["source_iiif_image_url"] == ""
    assert rows[0]["provider"] == "met"
    assert rows[0]["object_id"] == "40"
    assert rows[0]["source_image_url"] == "https://images.metmuseum.org/40-primary.jpg"
    assert rows[0]["image_role"] == "primary"
    assert rows[0]["image_index"] == ""
    assert rows[0]["standard_path"].endswith("/primary-standard-1024.jpg")
    assert rows[0]["thumb_path"].endswith("/primary-thumb-256.jpg")
    assert rows[0]["title"] == "Coiled Snake Bowl"
    assert rows[0]["object_name"] == "Bowl"
    assert rows[0]["rights_and_reproduction"] == "Public domain"
    assert rows[0]["matched_terms"] == "snake"
    assert rows[0]["verified_matched_terms"] == "snake"
    assert rows[0]["matched_fields"] == "tags; title"
    assert "tag: Snake [tags.term]" in rows[0]["descriptors"]
    assert rows[0]["semantic_text"].startswith("Coiled Snake Bowl. Object name: Bowl.")


def test_exports_complete_package_with_relative_manifest_paths_and_copied_images(tmp_path):
    storage = build_exportable_collection(tmp_path)

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="package",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 2
    assert (result.export_path / "manifest.jsonl").is_file()
    assert (result.export_path / "metadata.csv").is_file()
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert rows[0]["image_asset"]["standard_path"] == (
        f"images/standard-1024/{rows[0]['image_asset']['image_asset_id']}.jpg"
    )
    assert rows[0]["image_asset"]["thumb_path"] == (
        f"images/thumb-256/{rows[0]['image_asset']['image_asset_id']}.jpg"
    )
    assert (result.export_path / rows[0]["image_asset"]["standard_path"]).is_file()
    assert (result.export_path / rows[0]["image_asset"]["thumb_path"]).is_file()
    assert not (result.export_path / "raw-api").exists()


def test_exports_user_library_csv_and_package_formats(tmp_path):
    storage = build_exportable_collection(tmp_path)
    selected_image_asset_id = get_image_asset_ids(storage.database_path)[0]

    csv_result = export_user_library(
        database_path=storage.database_path,
        data_root=storage.data_root,
        export_format="csv",
        selected_image_asset_ids=[selected_image_asset_id],
        timestamp="260530-1234Z",
    )
    package_result = export_user_library(
        database_path=storage.database_path,
        data_root=storage.data_root,
        export_format="package",
        selected_image_asset_ids=[selected_image_asset_id],
        timestamp="260530-1235Z",
    )

    assert csv_result.row_count == 1
    csv_path = csv_result.export_path / "metadata.csv"
    with csv_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert rows[0]["collection_slug"] == "user-library"
    assert rows[0]["collection_title"] == "My Library"
    assert rows[0]["provider"] == "met"
    assert rows[0]["object_id"] == "40"

    assert package_result.row_count == 1
    assert package_result.export_path == (
        storage.data_root / "exports" / "user-library" / "package-260530-1235Z"
    )
    manifest_rows = [
        json.loads(line)
        for line in (package_result.export_path / "manifest.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert manifest_rows[0]["collection"]["scope"] == "user-library"
    assert (package_result.export_path / manifest_rows[0]["image_asset"]["standard_path"]).is_file()
    assert (package_result.export_path / manifest_rows[0]["image_asset"]["thumb_path"]).is_file()


def test_exports_use_short_format_prefixed_unique_folder_names(tmp_path):
    storage = build_exportable_collection(tmp_path)
    existing_export_path = storage.data_root / "exports" / "snake-study" / "jsonl-260530-1234Z"
    existing_export_path.mkdir(parents=True)

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        timestamp="260530-1234Z",
    )

    assert result.export_path == storage.data_root / "exports" / "snake-study" / "jsonl-260530-1234Z-02"
    assert (result.export_path / "manifest.jsonl").is_file()


def test_export_skips_assets_with_missing_derivatives_and_writes_warnings(tmp_path):
    storage = build_exportable_collection(tmp_path)
    missing_thumb = next(storage.data_root.glob("met/images/*/40/primary-thumb-256.jpg"))
    missing_thumb.unlink()

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 1
    assert result.skipped_image_asset_count == 1
    assert result.skipped_image_assets[0].reason == "missing_thumb_derivative"
    warnings = json.loads(
        (result.export_path / "export-warnings.json").read_text(encoding="utf-8")
    )
    assert warnings["skipped_image_assets"][0]["reason"] == "missing_thumb_derivative"
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert rows[0]["image_asset"]["source_image_url"] == "https://images.metmuseum.org/40-detail-a.jpg"


def test_export_skips_assets_with_corrupt_derivatives_and_writes_warnings(tmp_path):
    storage = build_exportable_collection(tmp_path)
    corrupt_standard = next(
        storage.data_root.glob("met/images/*/40/primary-standard-1024.jpg")
    )
    corrupt_standard.write_bytes(b"not a valid jpeg")

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 1
    assert result.skipped_image_asset_count == 1
    assert result.skipped_image_assets[0].reason == "invalid_derivative"
    warnings = json.loads(
        (result.export_path / "export-warnings.json").read_text(encoding="utf-8")
    )
    assert warnings["skipped_image_assets"][0]["reason"] == "invalid_derivative"
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert rows[0]["image_asset"]["source_image_url"] == "https://images.metmuseum.org/40-detail-a.jpg"


def test_csv_export_skips_assets_with_wrong_size_derivatives_and_writes_warnings(tmp_path):
    storage = build_exportable_collection(tmp_path)
    wrong_size_thumb = next(
        storage.data_root.glob("met/images/*/40/primary-thumb-256.jpg")
    )
    write_export_test_image(wrong_size_thumb, size=(64, 32))

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="csv",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 1
    assert result.skipped_image_asset_count == 1
    assert result.skipped_image_assets[0].reason == "invalid_derivative"
    warnings = json.loads(
        (result.export_path / "export-warnings.json").read_text(encoding="utf-8")
    )
    assert warnings["skipped_image_assets"][0]["reason"] == "invalid_derivative"
    with (result.export_path / "metadata.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert [row["source_image_url"] for row in rows] == [
        "https://images.metmuseum.org/40-detail-a.jpg"
    ]


def test_package_export_skips_invalid_derivatives_without_copying_them(tmp_path):
    storage = build_exportable_collection(tmp_path)
    corrupt_thumb = next(
        storage.data_root.glob("met/images/*/40/primary-thumb-256.jpg")
    )
    corrupt_thumb.write_bytes(b"not a valid jpeg")

    result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="package",
        timestamp="260530-1234Z",
    )

    assert result.row_count == 1
    assert result.skipped_image_asset_count == 1
    assert result.skipped_image_assets[0].reason == "invalid_derivative"
    warnings = json.loads((result.export_path / "export-warnings.json").read_text(encoding="utf-8"))
    assert warnings["skipped_image_assets"][0]["reason"] == "invalid_derivative"
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert [row["image_asset"]["source_image_url"] for row in rows] == [
        "https://images.metmuseum.org/40-detail-a.jpg"
    ]
    assert len(list((result.export_path / "images" / "standard-1024").glob("*.jpg"))) == 1
    assert len(list((result.export_path / "images" / "thumb-256").glob("*.jpg"))) == 1


def test_export_raises_without_creating_empty_files_when_all_derivatives_are_missing(tmp_path):
    storage = build_exportable_collection(tmp_path)
    for derivative_path in storage.data_root.glob("met/images/*/40/*.jpg"):
        derivative_path.unlink()

    with pytest.raises(NoExportableAssetsError) as error:
        export_collection(
            database_path=storage.database_path,
            data_root=storage.data_root,
            search_set_slug="snake-study",
            export_format="jsonl",
            timestamp="260530-1234Z",
        )

    assert len(error.value.skipped_image_assets) == 2
    assert not (storage.data_root / "exports" / "snake-study" / "20260530T123456Z").exists()
