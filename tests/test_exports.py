import csv
import json

import pytest

from anacronia.collection_runs import discover_met_candidates
from anacronia.exports import NoExportableAssetsError, export_collection
from anacronia.met_ingest import ingest_met_run
from anacronia.search_sets import create_or_continue_search_set
from anacronia.storage import initialize_storage

from tests.test_met_ingest import ppm_image_bytes


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
    assert rows[0]["image_asset"]["object_id"] == 40
    assert rows[0]["image_asset"]["source_image_url"] == "https://images.metmuseum.org/40-primary.jpg"
    assert rows[0]["image_asset"]["standard_path"].endswith("/primary-standard-1024.jpg")
    assert rows[0]["image_asset"]["thumb_path"].endswith("/primary-thumb-256.jpg")
    assert rows[0]["museum_object"] == {
        "title": "Coiled Snake Bowl",
        "object_name": "Bowl",
        "artist_display_name": "Unknown maker",
        "object_url": "https://www.metmuseum.org/art/collection/search/40",
        "rights_and_reproduction": "Public domain",
        "metadata_date": "2026-01-02",
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
    warnings = json.loads((result.export_path / "export-warnings.json").read_text(encoding="utf-8"))
    assert warnings["skipped_image_assets"][0]["reason"] == "missing_thumb_derivative"
    rows = [
        json.loads(line)
        for line in (result.export_path / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert rows[0]["image_asset"]["source_image_url"] == "https://images.metmuseum.org/40-detail-a.jpg"


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
