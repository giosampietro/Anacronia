import json

from anacronia.collection_runs import discover_met_candidates
from anacronia.met_ingest import (
    get_met_image_assets,
    get_met_descriptors,
    get_met_matches,
    get_met_museum_objects,
    get_met_skipped_image_references,
    ingest_met_run,
    select_met_image_references,
)
from anacronia.search_sets import create_or_continue_search_set, get_search_set
from anacronia.storage import met_raw_object_path


class FakeMetCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        return {
            "snake": [10, 20],
            "anaconda": [40],
        }[term]


class FakeMetRecordClient:
    def __init__(self) -> None:
        self.fetched_object_ids: list[int] = []

    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        self.fetched_object_ids.append(object_id)
        return {
            10: {
                "objectID": 10,
                "isPublicDomain": True,
                "title": "Coiled Snake Vessel",
                "objectName": "Vessel",
                "tags": [{"term": "Snakes"}, {"term": "Animals"}],
                "medium": "Terracotta",
                "culture": "",
                "period": None,
                "classification": "Ceramics",
                "artistDisplayName": "",
                "primaryImage": "https://images.metmuseum.org/10.jpg",
                "primaryImageSmall": "https://images.metmuseum.org/10-small.jpg",
                "rightsAndReproduction": "",
                "metadataDate": "2024-01-01",
                "objectURL": "https://www.metmuseum.org/art/collection/search/10",
            },
            20: {
                "objectID": 20,
                "isPublicDomain": False,
                "title": "Snake Vessel With Restricted Image",
                "objectName": "Vessel",
                "primaryImage": "",
            },
            40: {
                "objectID": 40,
                "isPublicDomain": True,
                "title": "River Study",
                "objectName": "Drawing",
                "tags": None,
                "medium": "Ink",
                "primaryImage": "https://images.metmuseum.org/40.jpg",
                "rightsAndReproduction": "",
                "metadataDate": "2024-02-01",
                "objectURL": "https://www.metmuseum.org/art/collection/search/40",
            },
        }[object_id]


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([180, 40, 120]) * width
    return header + row * height


def test_selects_met_image_references_by_source_url_identity_primary_role_and_limit():
    selected, skipped = select_met_image_references(
        record={
            "objectID": 436535,
            "primaryImage": "https://images.metmuseum.org/shared.jpg",
            "primaryImageSmall": "https://images.metmuseum.org/small.jpg",
            "additionalImages": [
                "https://images.metmuseum.org/shared.jpg",
                "https://images.metmuseum.org/detail-a.jpg",
                "",
                "https://images.metmuseum.org/detail-b.jpg",
                "https://images.metmuseum.org/detail-a.jpg",
            ],
        },
        max_images_per_object=2,
    )

    assert [
        (
            reference.object_id,
            reference.source_image_url,
            reference.image_role,
            reference.image_index,
            reference.primary_image_small_url,
        )
        for reference in selected
    ] == [
        (
            436535,
            "https://images.metmuseum.org/shared.jpg",
            "primary",
            None,
            "https://images.metmuseum.org/small.jpg",
        ),
        (
            436535,
            "https://images.metmuseum.org/detail-a.jpg",
            "additional",
            1,
            "",
        ),
    ]
    assert [
        (
            reference.object_id,
            reference.source_image_url,
            reference.image_role,
            reference.image_index,
            reference.reason,
        )
        for reference in skipped
    ] == [
        (
            436535,
            "https://images.metmuseum.org/detail-b.jpg",
            "additional",
            2,
            "beyond_max_images_per_object",
        )
    ]


def test_met_image_reference_limit_defaults_to_three():
    selected, skipped = select_met_image_references(
        record={
            "objectID": 436535,
            "additionalImages": [
                f"https://images.metmuseum.org/detail-{index}.jpg"
                for index in range(1, 12)
            ],
        },
    )

    assert len(selected) == 3
    assert [
        (reference.source_image_url, reference.image_index, reference.reason)
        for reference in skipped
    ] == [
        (
            "https://images.metmuseum.org/detail-4.jpg",
            4,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-5.jpg",
            5,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-6.jpg",
            6,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-7.jpg",
            7,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-8.jpg",
            8,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-9.jpg",
            9,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-10.jpg",
            10,
            "beyond_max_images_per_object",
        ),
        (
            "https://images.metmuseum.org/detail-11.jpg",
            11,
            "beyond_max_images_per_object",
        )
    ]


def test_met_image_reference_limit_is_hard_capped_to_three():
    selected, skipped = select_met_image_references(
        record={
            "objectID": 436535,
            "additionalImages": [
                f"https://images.metmuseum.org/detail-{index}.jpg"
                for index in range(1, 6)
            ],
        },
        max_images_per_object=10,
    )

    assert len(selected) == 3
    assert [reference.image_index for reference in skipped] == [4, 5]


def test_ingests_additional_image_assets_with_limits_and_independent_failures(tmp_path):
    class SingleCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [100]

    class MultiImageRecordClient:
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            assert object_id == 100
            return {
                "objectID": 100,
                "isPublicDomain": True,
                "title": "Additional Image Snake Object",
                "objectName": "Vessel",
                "primaryImage": "",
                "primaryImageSmall": "https://images.metmuseum.org/small-only.jpg",
                "additionalImages": [
                    "https://images.metmuseum.org/detail-a.jpg",
                    "https://images.metmuseum.org/fail.jpg",
                    "https://images.metmuseum.org/detail-b.jpg",
                    "https://images.metmuseum.org/skipped.jpg",
                ],
                "rightsAndReproduction": "",
                "metadataDate": "2024-01-01",
                "objectURL": "https://www.metmuseum.org/art/collection/search/100",
            }

    downloaded_urls: list[str] = []

    def download_image_bytes(url: str) -> bytes:
        downloaded_urls.append(url)
        if url.endswith("/fail.jpg"):
            raise OSError("simulated image processing failure")
        return ppm_image_bytes(width=1600, height=800)

    database_path = tmp_path / "anacronia.sqlite"
    data_root = tmp_path / "data"
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
        met_client=SingleCandidateClient(),
    )

    summary = ingest_met_run(
        database_path=database_path,
        data_root=data_root,
        run_id=run.run_id,
        met_client=MultiImageRecordClient(),
        download_image_bytes=download_image_bytes,
        max_images_per_object=3,
    )

    assert summary.imported_object_ids == [100]
    assert downloaded_urls == [
        "https://images.metmuseum.org/detail-a.jpg",
        "https://images.metmuseum.org/fail.jpg",
        "https://images.metmuseum.org/detail-b.jpg",
    ]

    image_assets = get_met_image_assets(database_path=database_path)
    assert [
        (
            image_asset.object_id,
            image_asset.source_image_url,
            image_asset.image_role,
            image_asset.image_index,
            image_asset.imported,
        )
        for image_asset in image_assets
    ] == [
        (
            100,
            "https://images.metmuseum.org/detail-a.jpg",
            "additional",
            1,
            True,
        ),
        (
            100,
            "https://images.metmuseum.org/detail-b.jpg",
            "additional",
            3,
            True,
        ),
    ]
    assert all(image_asset.standard_path.is_file() for image_asset in image_assets)
    assert all(image_asset.thumb_path.is_file() for image_asset in image_assets)

    skipped_references = get_met_skipped_image_references(database_path=database_path)
    assert [
        (
            reference.object_id,
            reference.source_image_url,
            reference.image_role,
            reference.image_index,
            reference.reason,
        )
        for reference in skipped_references
    ] == [
        (
            100,
            "https://images.metmuseum.org/fail.jpg",
            "additional",
            2,
            "image_processing_failed",
        ),
        (
            100,
            "https://images.metmuseum.org/skipped.jpg",
            "additional",
            4,
            "beyond_max_images_per_object",
        ),
    ]


def test_ingests_public_domain_met_records_with_raw_json_matches_and_descriptors(tmp_path):
    database_path = tmp_path / "anacronia.sqlite"
    data_root = tmp_path / "data"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake, anaconda",
    )
    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=3,
        met_client=FakeMetCandidateClient(),
    )
    met_record_client = FakeMetRecordClient()

    summary = ingest_met_run(
        database_path=database_path,
        data_root=data_root,
        run_id=run.run_id,
        met_client=met_record_client,
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert met_record_client.fetched_object_ids == [10, 20, 40]
    assert summary.imported_object_ids == [10, 40]
    assert [(skipped.object_id, skipped.reason) for skipped in summary.skipped_candidates] == [
        (20, "not_public_domain")
    ]

    raw_object_path = met_raw_object_path(data_root=data_root, object_id=10)
    assert json.loads(raw_object_path.read_text())["title"] == "Coiled Snake Vessel"

    museum_objects = get_met_museum_objects(database_path=database_path)
    assert [(museum_object.object_id, museum_object.title) for museum_object in museum_objects] == [
        (10, "Coiled Snake Vessel"),
        (40, "River Study"),
    ]

    matches = get_met_matches(database_path=database_path, run_id=run.run_id)
    assert [
        (match.object_id, match.search_term, match.verified, match.matched_fields)
        for match in matches
    ] == [
        (10, "snake", True, ["tags", "title"]),
        (40, "anaconda", False, []),
    ]

    descriptors = get_met_descriptors(database_path=database_path, object_id=10)
    assert [
        (descriptor.descriptor_type, descriptor.value, descriptor.source_field)
        for descriptor in descriptors
    ] == [
        ("classification", "Ceramics", "classification"),
        ("medium", "Terracotta", "medium"),
        ("object_name", "Vessel", "objectName"),
        ("tag", "Animals", "tags.term"),
        ("tag", "Snakes", "tags.term"),
        ("title", "Coiled Snake Vessel", "title"),
    ]


def test_ingest_does_not_block_search_set_creation_between_candidates(tmp_path):
    class TwoPublicCandidateClient:
        def search_object_ids(self, term: str) -> list[int]:
            assert term == "snake"
            return [10, 40]

    class ConcurrentCreateRecordClient(FakeMetRecordClient):
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            if object_id == 40:
                create_or_continue_search_set(
                    database_path=database_path,
                    display_name="Money",
                    terms_text="mani, mano",
                )
            return super().fetch_object_record(object_id)

    database_path = tmp_path / "anacronia.sqlite"
    data_root = tmp_path / "data"
    create_or_continue_search_set(
        database_path=database_path,
        display_name="Snake Studies",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug="snake-studies",
        candidate_offset=0,
        candidate_limit=2,
        met_client=TwoPublicCandidateClient(),
    )

    ingest_met_run(
        database_path=database_path,
        data_root=data_root,
        run_id=run.run_id,
        met_client=ConcurrentCreateRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    money = get_search_set(database_path=database_path, slug="money")
    assert money.display_name == "Money"
    assert [term.term for term in money.terms] == ["mani", "mano"]
