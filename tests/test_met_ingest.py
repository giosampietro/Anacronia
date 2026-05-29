import json

from anacronia.collection_runs import discover_met_candidates
from anacronia.met_ingest import (
    get_met_descriptors,
    get_met_matches,
    get_met_museum_objects,
    ingest_met_run,
)
from anacronia.search_sets import create_or_continue_search_set
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
                "rightsAndReproduction": "",
                "metadataDate": "2024-02-01",
                "objectURL": "https://www.metmuseum.org/art/collection/search/40",
            },
        }[object_id]


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
