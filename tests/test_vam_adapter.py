import sqlite3

from anacronia.collection_objects import get_collection_object_detail
from anacronia.collection_runs import discover_provider_candidates
from anacronia.image_pipeline import ImageDerivativeSettings, validate_image_derivative
from anacronia.search_sets import create_or_continue_search_set
from anacronia.storage import initialize_storage, provider_raw_record_path
from anacronia.vam_adapter import (
    extract_vam_descriptors,
    ingest_vam_run,
    matched_vam_fields,
    select_vam_image_references,
)


class FakeVamCandidateClient:
    def search_object_ids(self, term: str) -> list[str]:
        assert term == "bed"
        return ["O9138"]


class FakeVamRecordClient:
    def fetch_object_record(self, object_id: str) -> dict[str, object]:
        assert object_id == "O9138"
        return vam_record_fixture()


class SensitiveVamRecordClient:
    def fetch_object_record(self, object_id: str) -> dict[str, object]:
        assert object_id == "O9138"
        record = vam_record_fixture()
        images_meta = record["meta"]["images"]["_images_meta"]
        assert isinstance(images_meta, list)
        assert isinstance(images_meta[0], dict)
        images_meta[0]["sensitiveImage"] = True
        return record


class MissingSensitivityVamRecordClient:
    def fetch_object_record(self, object_id: str) -> dict[str, object]:
        assert object_id == "O9138"
        record = vam_record_fixture()
        images_meta = record["meta"]["images"]["_images_meta"]
        assert isinstance(images_meta, list)
        for item in images_meta:
            assert isinstance(item, dict)
            item.pop("sensitiveImage", None)
        return record


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([40, 130, 180]) * width
    return header + row * height


def vam_record_fixture() -> dict[str, object]:
    return {
        "meta": {
            "_links": {
                "collection_page": {
                    "href": "https://collections.vam.ac.uk/item/O9138/",
                },
            },
            "images": {
                "_primary_thumbnail": "https://framemark.vam.ac.uk/collections/2006AL3614/full/!100,100/0/default.jpg",
                "_iiif_image": "https://framemark.vam.ac.uk/collections/2006AL3614/",
                "_images_meta": [
                    {
                        "assetRef": "2006AL3614",
                        "copyright": "© Victoria and Albert Museum, London",
                        "sensitiveImage": False,
                    },
                    {
                        "assetRef": "2006AM3113",
                        "copyright": "©Victoria and Albert Museum, London",
                        "sensitiveImage": False,
                    },
                    {
                        "assetRef": "2006AM3112",
                        "copyright": "©Victoria & Albert Museum, London",
                        "sensitiveImage": False,
                    },
                ],
            },
        },
        "record": {
            "systemNumber": "O9138",
            "accessionNumber": "W.47:1 to 28-1931",
            "objectType": "Bed",
            "titles": [{"title": "Great Bed of Ware", "type": "popular title"}],
            "artistMakerPerson": [
                {
                    "name": {"text": "Vredeman de Vries, Hans", "id": "A1556"},
                    "association": {"text": "designer", "id": "AAT25190"},
                },
            ],
            "materials": [{"text": "oak", "id": "AAT12264"}],
            "materialsAndTechniques": "Oak, carved and originally painted",
            "techniques": [{"text": "carving", "id": "AAT53149"}],
            "categories": [{"text": "Furniture", "id": "THES48948"}],
            "styles": [{"text": "Elizabethan", "id": "AAT21036"}],
            "dimensions": [
                {"dimension": "Height", "value": "267", "unit": "cm"},
                {"dimension": "Width", "value": "326", "unit": "cm"},
            ],
            "placesOfOrigin": [
                {
                    "place": {"text": "Ware", "id": "x29994"},
                    "association": {"text": "made", "id": "x28654"},
                },
            ],
            "productionDates": [
                {
                    "date": {"text": "1590-1600"},
                    "association": {"text": "made", "id": "x28654"},
                },
            ],
            "images": ["2006AL3614", "2006AM3113", "2006AM3112"],
            "briefDescription": "The Great Bed of Ware, oak, carved, inlaid and painted.",
            "creditLine": "Purchased with Art Fund support",
            "recordModificationDate": "2025-04-30",
            "availableToBook": False,
        },
    }


def test_selects_vam_iiif_image_references_with_skipped_over_limit():
    selected, skipped = select_vam_image_references(
        record=vam_record_fixture(),
        max_images_per_object=2,
    )

    assert [(reference.asset_ref, reference.image_role) for reference in selected] == [
        ("2006AL3614", "primary"),
        ("2006AM3113", "additional"),
    ]
    assert selected[0].source_image_url == (
        "https://framemark.vam.ac.uk/collections/2006AL3614/full/full/0/default.jpg"
    )
    assert skipped[0].reason == "beyond_max_images_per_object"


def test_extracts_vam_descriptors_and_verified_match_fields():
    record = vam_record_fixture()

    descriptors = extract_vam_descriptors(record)

    assert ("title", "Great Bed of Ware", "record.titles.title") in [
        (descriptor.descriptor_type, descriptor.value, descriptor.source_field)
        for descriptor in descriptors
    ]
    assert ("medium", "oak", "record.materials.text") in [
        (descriptor.descriptor_type, descriptor.value, descriptor.source_field)
        for descriptor in descriptors
    ]
    assert matched_vam_fields(record=record, search_term="bed") == [
        "record.briefDescription",
        "record.objectType",
        "record.titles.title",
    ]


def test_vam_import_creates_private_permanent_derivatives_and_collection_detail(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bed Studies",
        terms_text="bed",
        provider="vam",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        candidate_offset=0,
        candidate_limit=1,
        candidate_client=FakeVamCandidateClient(),
        batch_target=2,
    )

    summary = ingest_vam_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        vam_client=FakeVamRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        max_images_per_object=2,
        batch_target=2,
    )

    assert summary.fetched_object_ids == ["O9138"]
    assert summary.imported_object_ids == ["O9138"]
    assert summary.imported_image_count == 2
    detail = get_collection_object_detail(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        object_id="O9138",
    )
    assert detail is not None
    assert detail.object.provider == "vam"
    assert detail.object.object_id == "O9138"
    assert detail.object.title == "Great Bed of Ware"
    assert detail.object.object_name == "Bed"
    assert detail.object.artist_display_name == "Vredeman de Vries, Hans"
    assert detail.object.is_public_domain is False
    assert detail.object.rights_and_reproduction == "© Victoria and Albert Museum, London"
    assert detail.object.accession_number == "W.47:1 to 28-1931"
    assert detail.object.object_date == "1590-1600"
    assert detail.object.medium == "Oak, carved and originally painted"
    assert detail.object.dimensions == "Height 267 cm; Width 326 cm"
    assert detail.object.classification == "Furniture"
    assert detail.object.credit_line == "Purchased with Art Fund support"
    assert detail.object.repository == "Victoria and Albert Museum"
    assert detail.object.tags == ["Furniture", "oak", "carving", "Elizabethan"]
    assert [image.image_role for image in detail.images] == ["primary", "additional"]
    assert detail.skipped_image_references[0].reason == "beyond_max_images_per_object"
    assert detail.matches[0].verified is True
    assert [image.sensitive_image for image in detail.images] == [False, False]
    assert [image.source_image_id for image in detail.images] == [
        "2006AL3614",
        "2006AM3113",
    ]
    assert detail.images[0].source_rights_statement == (
        "© Victoria and Albert Museum, London"
    )
    assert detail.images[0].source_iiif_service_url == (
        "https://framemark.vam.ac.uk/collections/2006AL3614"
    )

    for image in detail.images:
        standard_path = storage.data_root / "vam" / "images" / "O9138" / (
            "primary-standard-1024.jpg"
            if image.image_role == "primary"
            else "additional-001-standard-1024.jpg"
        )
        thumb_path = standard_path.with_name(
            standard_path.name.replace("standard-1024", "thumb-256")
        )
        assert validate_image_derivative(
            path=standard_path,
            settings=ImageDerivativeSettings(
                derivative="standard-1024",
                long_edge=1024,
                jpeg_quality=90,
            ),
        )
        assert validate_image_derivative(
            path=thumb_path,
            settings=ImageDerivativeSettings(
                derivative="thumb-256",
                long_edge=256,
                jpeg_quality=75,
            ),
        )


def test_vam_import_surfaces_sensitive_image_source_provenance(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bed Studies",
        terms_text="bed",
        provider="vam",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        candidate_offset=0,
        candidate_limit=1,
        candidate_client=FakeVamCandidateClient(),
        batch_target=1,
    )

    ingest_vam_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        vam_client=SensitiveVamRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        max_images_per_object=1,
        batch_target=1,
    )

    detail = get_collection_object_detail(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        object_id="O9138",
    )

    assert detail is not None
    assert detail.images[0].sensitive_image is True


def test_vam_does_not_write_raw_record_when_no_image_asset_imports(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bed Studies",
        terms_text="bed",
        provider="vam",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        candidate_offset=0,
        candidate_limit=1,
        candidate_client=FakeVamCandidateClient(),
        batch_target=1,
    )

    summary = ingest_vam_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        vam_client=FakeVamRecordClient(),
        download_image_bytes=lambda _url: (_ for _ in ()).throw(
            OSError("simulated image processing failure")
        ),
        max_images_per_object=1,
        batch_target=1,
    )

    assert summary.imported_object_ids == []
    assert [(skipped.object_id, skipped.reason) for skipped in summary.skipped_candidates] == [
        ("O9138", "no_imported_image_assets")
    ]
    assert not provider_raw_record_path(
        data_root=storage.data_root,
        provider="vam",
        object_id="O9138",
    ).exists()
    assert (
        get_collection_object_detail(
            database_path=storage.database_path,
            search_set_slug="bed-studies",
            provider="vam",
            object_id="O9138",
        )
        is None
    )
    with sqlite3.connect(storage.database_path) as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM museum_objects WHERE provider = 'vam'"
            ).fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM image_assets WHERE provider = 'vam'"
            ).fetchone()[0]
            == 0
        )


def test_vam_import_allows_missing_sensitive_image_source_provenance(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bed Studies",
        terms_text="bed",
        provider="vam",
    )
    run = discover_provider_candidates(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        candidate_offset=0,
        candidate_limit=1,
        candidate_client=FakeVamCandidateClient(),
        batch_target=1,
    )

    ingest_vam_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        vam_client=MissingSensitivityVamRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        max_images_per_object=1,
        batch_target=1,
    )

    detail = get_collection_object_detail(
        database_path=storage.database_path,
        search_set_slug="bed-studies",
        provider="vam",
        object_id="O9138",
    )

    assert detail is not None
    assert detail.images[0].sensitive_image is None
