import json
from pathlib import Path
import sqlite3

from anacronia.collection_objects import (
    get_collection_object_detail,
    list_collection_image_assets,
    list_collection_objects,
    list_library_image_assets,
    list_library_objects,
)
from anacronia.collection_runs import discover_met_candidates
from anacronia.curation import (
    add_collection_image_asset_exclusion,
    add_collection_object_exclusion,
    backfill_collection_memberships,
    CollectionCurationBusyError,
    CollectionDatabaseDeleteError,
    CollectionFileCleanupError,
    delete_collection_from_anacronia,
    delete_image_asset_from_anacronia,
    delete_object_from_anacronia,
    get_collection_import_exclusions,
    list_collection_image_asset_memberships,
    list_collection_object_memberships,
    mark_image_asset_deleted,
    mark_object_deleted,
    remove_image_asset_from_collection,
    remove_object_from_collection,
    set_image_asset_favorite,
    set_object_favorite,
)
from anacronia.worker import pause_collect_job, start_collect_job
from anacronia.met_ingest import (
    get_met_matches,
    get_met_skipped_candidates,
    get_met_skipped_image_references,
)
from anacronia.dashboard import get_operational_dashboard
from anacronia.exports import export_collection
from anacronia.met_ingest import ingest_met_run
from anacronia.search_sets import create_or_continue_search_set
from anacronia.storage import initialize_storage

from tests.test_met_ingest import ppm_image_bytes


class ExclusionCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        assert term == "snake"
        return [40, 20, 60]


class ExclusionRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        if object_id == 60:
            return {
                "objectID": 60,
                "isPublicDomain": True,
                "title": "Snake Cup",
                "objectName": "Cup",
                "artistDisplayName": "Met Workshop",
                "tags": [{"term": "Snake"}],
                "primaryImage": "https://images.metmuseum.org/60-primary.jpg",
                "objectURL": "https://www.metmuseum.org/art/collection/search/60",
                "rightsAndReproduction": "Public domain",
                "metadataDate": "2026-01-03",
            }
        return SharedRecordClient().fetch_object_record(object_id)


class SharedCandidateClient:
    def search_object_ids(self, term: str) -> list[int]:
        return {
            "snake": [20, 40],
            "bowl": [40],
        }[term]


class SharedRecordClient:
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        return {
            20: {
                "objectID": 20,
                "isPublicDomain": True,
                "title": "Snake Vessel",
                "objectName": "Vessel",
                "artistDisplayName": "Met Workshop",
                "tags": [{"term": "Snakes"}],
                "primaryImage": "https://images.metmuseum.org/20-primary.jpg",
                "objectURL": "https://www.metmuseum.org/art/collection/search/20",
                "rightsAndReproduction": "Public domain",
                "metadataDate": "2026-01-01",
            },
            40: {
                "objectID": 40,
                "isPublicDomain": True,
                "title": "Coiled Snake Bowl",
                "objectName": "Bowl",
                "artistDisplayName": "Unknown maker",
                "tags": [{"term": "Snake"}],
                "primaryImage": "https://images.metmuseum.org/40-primary.jpg",
                "additionalImages": [
                    "https://images.metmuseum.org/40-detail-a.jpg",
                    "https://images.metmuseum.org/40-detail-b.jpg",
                ],
                "objectURL": "https://www.metmuseum.org/art/collection/search/40",
                "rightsAndReproduction": "Public domain",
                "metadataDate": "2026-01-02",
            },
        }[object_id]


def ingest_collection(
    *,
    database_path,
    data_root,
    display_name: str,
    terms_text: str,
    candidate_limit: int,
) -> None:
    search_set = create_or_continue_search_set(
        database_path=database_path,
        display_name=display_name,
        terms_text=terms_text,
    )
    run = discover_met_candidates(
        database_path=database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=candidate_limit,
        met_client=SharedCandidateClient(),
    )
    ingest_met_run(
        database_path=database_path,
        data_root=data_root,
        run_id=run.run_id,
        met_client=SharedRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )


def visible_collection_state(
    database_path,
    slug: str,
) -> tuple[list[int], list[tuple[int, str]]]:
    objects = list_collection_objects(database_path=database_path, search_set_slug=slug)
    image_assets = list_collection_image_assets(
        database_path=database_path,
        search_set_slug=slug,
    )
    return (
        [museum_object.object_id for museum_object in objects],
        [
            (image_asset.object_id, image_asset.image_role)
            for image_asset in image_assets
        ],
    )


def historical_collection_state(
    database_path,
    slug: str,
) -> tuple[list[int], list[tuple[int, str]]]:
    with sqlite3.connect(database_path) as connection:
        object_rows = connection.execute(
            """
            SELECT
              image_assets.object_id,
              MAX(image_assets.id) AS latest_image_asset_id
            FROM image_assets
            JOIN object_matches
              ON object_matches.provider = image_assets.provider
              AND object_matches.object_id = image_assets.object_id
            JOIN collection_runs
              ON collection_runs.id = object_matches.run_id
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
              AND provider_collections.provider = image_assets.provider
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE search_sets.slug = ? AND image_assets.imported = 1
            GROUP BY image_assets.provider, image_assets.object_id
            ORDER BY latest_image_asset_id DESC
            """,
            (slug,),
        ).fetchall()
        image_rows = connection.execute(
            """
            SELECT DISTINCT image_assets.object_id, image_assets.image_role, image_assets.id
            FROM image_assets
            JOIN object_matches
              ON object_matches.provider = image_assets.provider
              AND object_matches.object_id = image_assets.object_id
            JOIN collection_runs
              ON collection_runs.id = object_matches.run_id
            JOIN provider_collections
              ON provider_collections.id = collection_runs.provider_collection_id
              AND provider_collections.provider = image_assets.provider
            JOIN search_sets
              ON search_sets.id = provider_collections.search_set_id
            WHERE search_sets.slug = ? AND image_assets.imported = 1
            ORDER BY image_assets.id DESC
            """,
            (slug,),
        ).fetchall()

    return (
        [int(row[0]) for row in object_rows],
        [(int(row[0]), row[1]) for row in image_rows],
    )


def object_match_count(database_path) -> int:
    with sqlite3.connect(database_path) as connection:
        return int(
            connection.execute("SELECT COUNT(*) FROM object_matches").fetchone()[0]
        )


def collection_row_exists(database_path, slug: str) -> bool:
    with sqlite3.connect(database_path) as connection:
        return (
            connection.execute(
                "SELECT 1 FROM search_sets WHERE slug = ?",
                (slug,),
            ).fetchone()
            is not None
        )


def install_search_set_delete_failure(database_path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TRIGGER fail_search_set_delete
            BEFORE DELETE ON search_sets
            BEGIN
              SELECT RAISE(ABORT, 'simulated database failure');
            END
            """
        )


def remove_search_set_delete_failure(database_path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute("DROP TRIGGER fail_search_set_delete")


def test_provider_import_exclusions_are_read_through_curation_boundary(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bowl Study",
        terms_text="bowl",
    )

    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    add_collection_image_asset_exclusion(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
        source_image_url="https://images.metmuseum.org/40-detail-a.jpg",
        reason="removed_from_collection",
    )

    with sqlite3.connect(storage.database_path) as connection:
        snake_search_set_id = int(
            connection.execute(
                "SELECT id FROM search_sets WHERE slug = ?",
                ("snake-study",),
            ).fetchone()[0]
        )
        bowl_search_set_id = int(
            connection.execute(
                "SELECT id FROM search_sets WHERE slug = ?",
                ("bowl-study",),
            ).fetchone()[0]
        )
        snake_exclusions = get_collection_import_exclusions(
            connection=connection,
            search_set_id=snake_search_set_id,
            provider="met",
            object_id=40,
        )
        bowl_exclusions = get_collection_import_exclusions(
            connection=connection,
            search_set_id=bowl_search_set_id,
            provider="met",
            object_id=40,
        )

    assert snake_exclusions.object_excluded is True
    assert snake_exclusions.image_source_urls == frozenset(
        {"https://images.metmuseum.org/40-detail-a.jpg"}
    )
    assert bowl_exclusions.object_excluded is False
    assert bowl_exclusions.image_source_urls == frozenset()


def deactivate_image_membership(
    database_path,
    *,
    search_set_slug: str,
    provider: str,
    object_id: int,
    source_image_url: str,
) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            UPDATE collection_image_asset_memberships
            SET active = 0
            WHERE
              search_set_id = (SELECT id FROM search_sets WHERE slug = ?)
              AND provider = ?
              AND object_id = ?
              AND source_image_url = ?
            """,
            (search_set_slug, provider, object_id, source_image_url),
        )


def deactivate_object_membership(
    database_path,
    *,
    search_set_slug: str,
    provider: str,
    object_id: int,
) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            UPDATE collection_object_memberships
            SET active = 0
            WHERE
              search_set_id = (SELECT id FROM search_sets WHERE slug = ?)
              AND provider = ?
              AND object_id = ?
            """,
            (search_set_slug, provider, object_id),
        )


def test_backfills_explicit_collection_memberships_without_changing_visible_results(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Bowl Study",
        terms_text="bowl",
        candidate_limit=1,
    )
    before_snake = historical_collection_state(storage.database_path, "snake-study")
    before_bowl = historical_collection_state(storage.database_path, "bowl-study")
    before_match_count = object_match_count(storage.database_path)

    summary = backfill_collection_memberships(database_path=storage.database_path)

    assert summary.object_memberships_created == 3
    assert summary.image_asset_memberships_created == 7
    assert visible_collection_state(storage.database_path, "snake-study") == before_snake
    assert visible_collection_state(storage.database_path, "bowl-study") == before_bowl
    assert object_match_count(storage.database_path) == before_match_count
    assert [
        (membership.search_set_slug, membership.provider, membership.object_id)
        for membership in list_collection_object_memberships(
            database_path=storage.database_path
        )
    ] == [
        ("bowl-study", "met", 40),
        ("snake-study", "met", 20),
        ("snake-study", "met", 40),
    ]
    assert [
        (
            membership.search_set_slug,
            membership.provider,
            membership.object_id,
            membership.source_image_url,
        )
        for membership in list_collection_image_asset_memberships(
            database_path=storage.database_path
        )
    ] == [
        ("bowl-study", "met", 40, "https://images.metmuseum.org/40-detail-a.jpg"),
        ("bowl-study", "met", 40, "https://images.metmuseum.org/40-detail-b.jpg"),
        ("bowl-study", "met", 40, "https://images.metmuseum.org/40-primary.jpg"),
        ("snake-study", "met", 20, "https://images.metmuseum.org/20-primary.jpg"),
        ("snake-study", "met", 40, "https://images.metmuseum.org/40-detail-a.jpg"),
        ("snake-study", "met", 40, "https://images.metmuseum.org/40-detail-b.jpg"),
        ("snake-study", "met", 40, "https://images.metmuseum.org/40-primary.jpg"),
    ]


def test_backfill_is_idempotent_and_dedupes_repeated_runs(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )

    first_summary = backfill_collection_memberships(database_path=storage.database_path)
    second_summary = backfill_collection_memberships(database_path=storage.database_path)

    assert first_summary.object_memberships_created == 2
    assert first_summary.image_asset_memberships_created == 4
    assert second_summary.object_memberships_created == 0
    assert second_summary.image_asset_memberships_created == 0
    assert (
        len(list_collection_object_memberships(database_path=storage.database_path))
        == 2
    )
    assert (
        len(
            list_collection_image_asset_memberships(
                database_path=storage.database_path
            )
        )
        == 4
    )


def test_active_image_membership_controls_collection_visibility_and_exports(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)

    deactivate_image_membership(
        storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
        source_image_url="https://images.metmuseum.org/40-detail-b.jpg",
    )

    collection_image_assets = list_collection_image_assets(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in collection_image_assets
    ] == [
        (40, "additional", 1),
        (40, "primary", None),
        (20, "primary", None),
    ]
    assert [
        (museum_object.object_id, museum_object.image_count)
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [(40, 2), (20, 1)]

    detail = get_collection_object_detail(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
    )
    assert detail is not None
    assert [image.source_image_url for image in detail.images] == [
        "https://images.metmuseum.org/40-primary.jpg",
        "https://images.metmuseum.org/40-detail-a.jpg",
    ]
    assert [(match.search_term, match.verified) for match in detail.matches] == [
        ("snake", True)
    ]

    export_result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        timestamp="260603-1210Z",
    )
    rows = [
        json.loads(line)
        for line in (export_result.export_path / "manifest.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert export_result.row_count == 3
    assert {
        row["image_asset"]["source_image_url"]
        for row in rows
    } == {
        "https://images.metmuseum.org/20-primary.jpg",
        "https://images.metmuseum.org/40-primary.jpg",
        "https://images.metmuseum.org/40-detail-a.jpg",
    }

    dashboard = get_operational_dashboard(database_path=storage.database_path)
    provider_collection = dashboard.search_sets[0].provider_collections[0]
    assert provider_collection.imported_object_count == 2
    assert provider_collection.imported_image_count == 3
    assert dashboard.provider_focus[0].imported_image_count == 4

    library_detail_b = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]
    assert library_detail_b.collections == []
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_library_image_assets(
            database_path=storage.database_path,
            filter_text="No Collection",
        )
    ] == [(40, "additional", 2)]


def test_inactive_object_membership_hides_collection_object_but_keeps_library_orphan(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)

    deactivate_object_membership(
        storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
    )

    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert [
        image_asset.object_id
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert (
        get_collection_object_detail(
            database_path=storage.database_path,
            search_set_slug="snake-study",
            provider="met",
            object_id=40,
        )
        is None
    )

    orphan_objects = list_library_objects(
        database_path=storage.database_path,
        filter_text="No Collection",
    )
    assert [(museum_object.object_id, museum_object.image_count) for museum_object in orphan_objects] == [
        (40, 3)
    ]


def test_deleted_image_asset_is_hidden_from_active_views_but_keeps_match_history(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    detail_b = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]

    deleted = mark_image_asset_deleted(
        database_path=storage.database_path,
        image_asset_id=detail_b.image_asset_id,
    )

    assert deleted is True
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [
        (40, "additional", 1),
        (40, "primary", None),
        (20, "primary", None),
    ]
    assert [
        (museum_object.object_id, museum_object.image_count)
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [(40, 2), (20, 1)]
    assert detail_b.image_asset_id not in {
        image_asset.image_asset_id
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    }
    assert [
        (match.object_id, match.search_term)
        for match in get_met_matches(database_path=storage.database_path, run_id=1)
    ] == [(20, "snake"), (40, "snake")]


def test_deleted_object_hides_object_and_all_images_but_keeps_match_history(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)

    deleted = mark_object_deleted(
        database_path=storage.database_path,
        provider="met",
        object_id=40,
    )

    assert deleted is True
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert [
        image_asset.object_id
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert [
        museum_object.object_id
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [20]
    assert [
        image_asset.object_id
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    ] == [20]
    assert [
        (match.object_id, match.search_term)
        for match in get_met_matches(database_path=storage.database_path, run_id=1)
    ] == [(20, "snake"), (40, "snake")]


def test_reimport_reactivates_deleted_material_without_duplicate_rows(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    detail_b = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]
    mark_image_asset_deleted(
        database_path=storage.database_path,
        image_asset_id=detail_b.image_asset_id,
    )
    mark_object_deleted(
        database_path=storage.database_path,
        provider="met",
        object_id=20,
    )

    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )

    assert [
        (museum_object.object_id, museum_object.image_count)
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [(40, 3), (20, 1)]
    assert detail_b.image_asset_id in {
        image_asset.image_asset_id
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    }
    with sqlite3.connect(storage.database_path) as connection:
        image_row = connection.execute(
            """
            SELECT COUNT(*), MAX(active), MAX(deleted_at)
            FROM image_assets
            WHERE
              provider = 'met'
              AND object_id = 40
              AND source_image_url = 'https://images.metmuseum.org/40-detail-b.jpg'
            """
        ).fetchone()
        object_row = connection.execute(
            """
            SELECT COUNT(*), MAX(active), MAX(deleted_at)
            FROM museum_objects
            WHERE provider = 'met' AND object_id = 20
            """
        ).fetchone()
    assert image_row == (1, 1, None)
    assert object_row == (1, 1, None)


def test_delete_empty_collection_removes_collection_navigation_and_scoped_state(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Bowl Study",
        terms_text="bowl",
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )

    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert summary.collection_slug == "snake-study"
    assert collection_row_exists(storage.database_path, "snake-study") is False
    assert collection_row_exists(storage.database_path, "bowl-study") is True
    assert [
        search_set.slug
        for search_set in get_operational_dashboard(
            database_path=storage.database_path
        ).search_sets
    ] == ["bowl-study"]
    with sqlite3.connect(storage.database_path) as connection:
        snake_scoped_rows = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM provider_collections WHERE search_set_id NOT IN (SELECT id FROM search_sets)),
              (SELECT COUNT(*) FROM collection_object_exclusions WHERE search_set_id NOT IN (SELECT id FROM search_sets)),
              (SELECT COUNT(*) FROM search_set_terms WHERE search_set_id NOT IN (SELECT id FROM search_sets))
            """
        ).fetchone()
    assert snake_scoped_rows == (0, 0, 0)


def test_delete_collection_removes_non_favorite_exclusive_material_and_files(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    export_result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="snake-study",
        export_format="jsonl",
        timestamp="260604-0900Z",
    )
    with sqlite3.connect(storage.database_path) as connection:
        file_paths = [
            Path(path)
            for row in connection.execute(
                """
                SELECT standard_path, thumb_path
                FROM image_assets
                ORDER BY id
                """
            ).fetchall()
            for path in row
        ]

    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert summary.deleted_objects == 2
    assert summary.deleted_image_assets == 4
    assert all(not path.exists() for path in file_paths)
    assert list_library_objects(database_path=storage.database_path) == []
    assert list_library_image_assets(database_path=storage.database_path) == []
    assert get_operational_dashboard(database_path=storage.database_path).search_sets == []
    assert (export_result.export_path / "manifest.jsonl").is_file()
    with sqlite3.connect(storage.database_path) as connection:
        object_rows = connection.execute(
            """
            SELECT COUNT(*), SUM(active), COUNT(deleted_at)
            FROM museum_objects
            """
        ).fetchone()
        image_rows = connection.execute(
            """
            SELECT COUNT(*), SUM(active), COUNT(deleted_at)
            FROM image_assets
            """
        ).fetchone()
    assert object_rows == (2, 0, 2)
    assert image_rows == (4, 0, 4)


def test_delete_collection_preserves_shared_material_and_other_collection_exclusions(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Bowl Study",
        terms_text="bowl",
        candidate_limit=1,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=20,
        reason="removed_from_collection",
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="bowl-study",
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    with sqlite3.connect(storage.database_path) as connection:
        object_20_paths = [
            Path(path)
            for row in connection.execute(
                """
                SELECT standard_path, thumb_path
                FROM image_assets
                WHERE provider = 'met' AND object_id = 20
                """
            ).fetchall()
            for path in row
        ]
        object_40_paths = [
            Path(path)
            for row in connection.execute(
                """
                SELECT standard_path, thumb_path
                FROM image_assets
                WHERE provider = 'met' AND object_id = 40
                """
            ).fetchall()
            for path in row
        ]

    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert summary.deleted_objects == 1
    assert summary.deleted_image_assets == 1
    assert summary.preserved_shared_objects == 1
    assert summary.preserved_shared_image_assets == 3
    assert all(not path.exists() for path in object_20_paths)
    assert all(path.is_file() for path in object_40_paths)
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="bowl-study",
        )
    ] == [40]
    assert [
        museum_object.object_id
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [40]
    with sqlite3.connect(storage.database_path) as connection:
        exclusion_rows = connection.execute(
            """
            SELECT search_sets.slug, collection_object_exclusions.object_id
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            ORDER BY search_sets.slug, collection_object_exclusions.object_id
            """
        ).fetchall()
        object_40_active = connection.execute(
            """
            SELECT active, deleted_at
            FROM museum_objects
            WHERE provider = 'met' AND object_id = 40
            """
        ).fetchone()
    assert exclusion_rows == [("bowl-study", "40")]
    assert object_40_active == (1, None)


def test_delete_collection_preserves_favorite_exclusive_material_as_no_collection(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    set_object_favorite(
        database_path=storage.database_path,
        provider="met",
        object_id=20,
        is_favorite=True,
    )
    favorite_detail_image = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]
    set_image_asset_favorite(
        database_path=storage.database_path,
        image_asset_id=favorite_detail_image.image_asset_id,
        is_favorite=True,
    )
    with sqlite3.connect(storage.database_path) as connection:
        paths_by_image_id = {
            int(row[0]): (Path(row[1]), Path(row[2]))
            for row in connection.execute(
                """
                SELECT id, standard_path, thumb_path
                FROM image_assets
                ORDER BY id
                """
            ).fetchall()
        }

    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert summary.deleted_objects == 0
    assert summary.deleted_image_assets == 2
    assert summary.preserved_favorite_objects == 2
    assert summary.preserved_favorite_image_assets == 2
    no_collection_objects = list_library_objects(
        database_path=storage.database_path,
        collection="none",
    )
    assert [
        (museum_object.object_id, museum_object.image_count, museum_object.is_favorite)
        for museum_object in no_collection_objects
    ] == [(40, 1, False), (20, 1, True)]
    favorite_objects = list_library_objects(
        database_path=storage.database_path,
        favorite_only=True,
    )
    assert [(museum_object.object_id, museum_object.image_count) for museum_object in favorite_objects] == [
        (20, 1)
    ]
    favorite_images = list_library_image_assets(
        database_path=storage.database_path,
        favorite_only=True,
    )
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in favorite_images
    ] == [(40, "additional", 2)]
    retained_image_ids = {
        image_asset.image_asset_id
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    }
    assert retained_image_ids == {
        favorite_detail_image.image_asset_id,
        next(
            image_asset.image_asset_id
            for image_asset in list_library_image_assets(
                database_path=storage.database_path,
                collection="none",
            )
            if image_asset.object_id == 20
        ),
    }
    for image_asset_id, paths in paths_by_image_id.items():
        should_exist = image_asset_id in retained_image_ids
        assert all(path.exists() is should_exist for path in paths)


def test_delete_collection_is_rejected_while_provider_search_is_running(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=2,
        met_client=SharedCandidateClient(),
    )
    start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        available_disk_bytes=10_000_000,
    )

    try:
        delete_collection_from_anacronia(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    except CollectionCurationBusyError as error:
        assert str(error) == "Provider Search is running for this Collection."
    else:
        raise AssertionError("delete_collection_from_anacronia should reject running search")

    assert collection_row_exists(storage.database_path, "snake-study") is True


def test_delete_collection_allows_paused_provider_search(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=2,
        met_client=SharedCandidateClient(),
    )
    job = start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        available_disk_bytes=10_000_000,
    )
    pause_collect_job(
        database_path=storage.database_path,
        job_id=job.job_id,
    )

    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert collection_row_exists(storage.database_path, "snake-study") is False


def test_delete_collection_file_cleanup_failure_keeps_collection_retryable(tmp_path, monkeypatch):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    with sqlite3.connect(storage.database_path) as connection:
        failed_path = Path(
            connection.execute(
                """
                SELECT thumb_path
                FROM image_assets
                ORDER BY id
                LIMIT 1
                """
            ).fetchone()[0]
        )
    original_unlink = Path.unlink
    failed_once = False

    def flaky_unlink(path: Path, *args, **kwargs):
        nonlocal failed_once
        if path == failed_path and not failed_once:
            failed_once = True
            raise PermissionError("file busy")
        return original_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", flaky_unlink)

    try:
        delete_collection_from_anacronia(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    except CollectionFileCleanupError as error:
        assert error.path == failed_path
    else:
        raise AssertionError("delete_collection_from_anacronia should report file cleanup failure")

    assert collection_row_exists(storage.database_path, "snake-study") is True
    assert list_library_objects(database_path=storage.database_path)
    with sqlite3.connect(storage.database_path) as connection:
        active_rows = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM museum_objects WHERE active = 1),
              (SELECT COUNT(*) FROM image_assets WHERE active = 1)
            """
        ).fetchone()
    assert active_rows == (2, 4)

    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert collection_row_exists(storage.database_path, "snake-study") is False


def test_delete_collection_database_failure_rolls_back_and_preserves_files_for_retry(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    initial_state = visible_collection_state(storage.database_path, "snake-study")
    with sqlite3.connect(storage.database_path) as connection:
        file_paths = [
            Path(path)
            for row in connection.execute(
                """
                SELECT standard_path, thumb_path
                FROM image_assets
                ORDER BY id
                """
            ).fetchall()
            for path in row
        ]
        active_rows_before = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM museum_objects WHERE active = 1 AND deleted_at IS NULL),
              (SELECT COUNT(*) FROM image_assets WHERE active = 1 AND deleted_at IS NULL),
              (SELECT COUNT(*) FROM collection_object_memberships WHERE active = 1),
              (SELECT COUNT(*) FROM collection_image_asset_memberships WHERE active = 1)
            """
        ).fetchone()

    install_search_set_delete_failure(storage.database_path)

    try:
        delete_collection_from_anacronia(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    except CollectionDatabaseDeleteError as error:
        assert str(error).startswith("Could not delete Collection")
    else:
        raise AssertionError("delete_collection_from_anacronia should report database failure")

    assert collection_row_exists(storage.database_path, "snake-study") is True
    assert visible_collection_state(storage.database_path, "snake-study") == initial_state
    assert all(path.is_file() for path in file_paths)
    with sqlite3.connect(storage.database_path) as connection:
        active_rows_after = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM museum_objects WHERE active = 1 AND deleted_at IS NULL),
              (SELECT COUNT(*) FROM image_assets WHERE active = 1 AND deleted_at IS NULL),
              (SELECT COUNT(*) FROM collection_object_memberships WHERE active = 1),
              (SELECT COUNT(*) FROM collection_image_asset_memberships WHERE active = 1)
            """
        ).fetchone()
    assert active_rows_after == active_rows_before

    remove_search_set_delete_failure(storage.database_path)
    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert collection_row_exists(storage.database_path, "snake-study") is False
    assert list_library_objects(database_path=storage.database_path) == []
    assert list_library_image_assets(database_path=storage.database_path) == []
    assert all(not path.exists() for path in file_paths)


def test_delete_collection_database_failure_preserves_shared_favorite_and_exclusion_state(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Bowl Study",
        terms_text="bowl",
        candidate_limit=1,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    set_object_favorite(
        database_path=storage.database_path,
        provider="met",
        object_id=20,
        is_favorite=True,
    )
    favorite_detail_image = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]
    set_image_asset_favorite(
        database_path=storage.database_path,
        image_asset_id=favorite_detail_image.image_asset_id,
        is_favorite=True,
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=20,
        reason="removed_from_collection",
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="bowl-study",
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    initial_snake_state = visible_collection_state(storage.database_path, "snake-study")
    initial_bowl_state = visible_collection_state(storage.database_path, "bowl-study")
    with sqlite3.connect(storage.database_path) as connection:
        favorite_counts_before = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM object_favorites),
              (SELECT COUNT(*) FROM image_asset_favorites)
            """
        ).fetchone()
        exclusion_rows_before = connection.execute(
            """
            SELECT search_sets.slug, collection_object_exclusions.object_id
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            ORDER BY search_sets.slug, collection_object_exclusions.object_id
            """
        ).fetchall()
        active_rows_before = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM museum_objects WHERE active = 1 AND deleted_at IS NULL),
              (SELECT COUNT(*) FROM image_assets WHERE active = 1 AND deleted_at IS NULL)
            """
        ).fetchone()

    install_search_set_delete_failure(storage.database_path)

    try:
        delete_collection_from_anacronia(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    except CollectionDatabaseDeleteError as error:
        assert str(error).startswith("Could not delete Collection")
    else:
        raise AssertionError("delete_collection_from_anacronia should report database failure")

    assert collection_row_exists(storage.database_path, "snake-study") is True
    assert collection_row_exists(storage.database_path, "bowl-study") is True
    assert visible_collection_state(storage.database_path, "snake-study") == initial_snake_state
    assert visible_collection_state(storage.database_path, "bowl-study") == initial_bowl_state
    assert list_library_objects(
        database_path=storage.database_path,
        collection="none",
    ) == []
    with sqlite3.connect(storage.database_path) as connection:
        favorite_counts_after = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM object_favorites),
              (SELECT COUNT(*) FROM image_asset_favorites)
            """
        ).fetchone()
        exclusion_rows_after = connection.execute(
            """
            SELECT search_sets.slug, collection_object_exclusions.object_id
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            ORDER BY search_sets.slug, collection_object_exclusions.object_id
            """
        ).fetchall()
        active_rows_after = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM museum_objects WHERE active = 1 AND deleted_at IS NULL),
              (SELECT COUNT(*) FROM image_assets WHERE active = 1 AND deleted_at IS NULL)
            """
        ).fetchone()
    assert favorite_counts_after == favorite_counts_before
    assert exclusion_rows_after == exclusion_rows_before
    assert active_rows_after == active_rows_before

    remove_search_set_delete_failure(storage.database_path)
    summary = delete_collection_from_anacronia(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )

    assert summary.deleted is True
    assert collection_row_exists(storage.database_path, "snake-study") is False
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="bowl-study",
        )
    ] == [40]
    assert [
        (museum_object.object_id, museum_object.image_count, museum_object.is_favorite)
        for museum_object in list_library_objects(
            database_path=storage.database_path,
            collection="none",
        )
    ] == [(20, 1, True)]
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_library_image_assets(
            database_path=storage.database_path,
            favorite_only=True,
        )
    ] == [(40, "additional", 2)]
    with sqlite3.connect(storage.database_path) as connection:
        exclusion_rows = connection.execute(
            """
            SELECT search_sets.slug, collection_object_exclusions.object_id
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            ORDER BY search_sets.slug, collection_object_exclusions.object_id
            """
        ).fetchall()
        assert exclusion_rows == [("bowl-study", "40")]


def test_object_exclusion_prevents_import_and_does_not_count_batch_target(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=3,
        met_client=ExclusionCandidateClient(),
    )

    summary = ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=ExclusionRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        batch_target=2,
    )

    assert summary.fetched_object_ids == [20, 60]
    assert summary.imported_image_count == 2
    assert summary.imported_object_ids == [20, 60]
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [60, 20]
    assert [
        museum_object.object_id
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [60, 20]
    assert [
        (match.object_id, match.search_term)
        for match in get_met_matches(database_path=storage.database_path, run_id=run.run_id)
    ] == [(20, "snake"), (60, "snake")]
    assert [
        (skipped.object_id, skipped.reason)
        for skipped in get_met_skipped_candidates(
            database_path=storage.database_path,
            run_id=run.run_id,
        )
    ] == [(40, "collection_object_excluded")]


def test_object_exclusion_skips_provider_fetch_download_and_import_for_same_collection(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=2,
        met_client=ExclusionCandidateClient(),
    )
    fetched_object_ids: list[int] = []
    downloaded_urls: list[str] = []

    class ObjectExclusionRecordClient:
        def fetch_object_record(self, object_id: int) -> dict[str, object]:
            fetched_object_ids.append(object_id)
            if object_id == 40:
                raise AssertionError("excluded object should not be fetched")
            return SharedRecordClient().fetch_object_record(object_id)

    def download_image_bytes(source_url: str) -> bytes:
        downloaded_urls.append(source_url)
        return ppm_image_bytes(width=1600, height=800)

    summary = ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=ObjectExclusionRecordClient(),
        download_image_bytes=download_image_bytes,
        batch_target=1,
    )

    assert summary.fetched_object_ids == [20]
    assert summary.imported_image_count == 1
    assert summary.imported_object_ids == [20]
    assert fetched_object_ids == [20]
    assert downloaded_urls == ["https://images.metmuseum.org/20-primary.jpg"]
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert [
        museum_object.object_id
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [20]
    assert [
        (skipped.object_id, skipped.reason)
        for skipped in get_met_skipped_candidates(
            database_path=storage.database_path,
            run_id=run.run_id,
        )
    ] == [(40, "collection_object_excluded")]


def test_collection_exclusion_does_not_block_other_collection_import(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    snake_search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug=snake_search_set.slug,
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Bowl Study",
        terms_text="bowl",
        candidate_limit=1,
    )
    backfill_collection_memberships(database_path=storage.database_path)

    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == []
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="bowl-study",
        )
    ] == [40]
    assert [
        museum_object.object_id
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [40]


def test_image_exclusion_skips_only_that_image_and_does_not_count_batch_target(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    add_collection_image_asset_exclusion(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        provider="met",
        object_id=40,
        source_image_url="https://images.metmuseum.org/40-detail-b.jpg",
        reason="removed_from_collection",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=3,
        met_client=ExclusionCandidateClient(),
    )

    summary = ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=ExclusionRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
        batch_target=3,
    )

    assert summary.fetched_object_ids == [40, 20]
    assert summary.imported_image_count == 3
    assert summary.imported_object_ids == [40, 20]
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [
        (20, "primary", None),
        (40, "additional", 1),
        (40, "primary", None),
    ]
    assert [
        (museum_object.object_id, museum_object.image_count)
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [(20, 1), (40, 2)]
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    ] == [
        (20, "primary", None),
        (40, "additional", 1),
        (40, "primary", None),
    ]
    assert [
        (reference.object_id, reference.source_image_url, reference.reason)
        for reference in get_met_skipped_image_references(
            database_path=storage.database_path,
        )
        if reference.reason == "collection_image_excluded"
    ] == [
        (
            40,
            "https://images.metmuseum.org/40-detail-b.jpg",
            "collection_image_excluded",
        )
    ]


def test_image_exclusion_skips_download_and_import_for_same_collection(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    add_collection_image_asset_exclusion(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        provider="met",
        object_id=40,
        source_image_url="https://images.metmuseum.org/40-detail-b.jpg",
        reason="removed_from_collection",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=1,
        met_client=ExclusionCandidateClient(),
    )
    downloaded_urls: list[str] = []

    def download_image_bytes(source_url: str) -> bytes:
        downloaded_urls.append(source_url)
        if source_url == "https://images.metmuseum.org/40-detail-b.jpg":
            raise AssertionError("excluded image should not be downloaded")
        return ppm_image_bytes(width=1600, height=800)

    summary = ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=ExclusionRecordClient(),
        download_image_bytes=download_image_bytes,
        batch_target=2,
    )

    assert summary.fetched_object_ids == [40]
    assert summary.imported_image_count == 2
    assert summary.imported_object_ids == [40]
    assert downloaded_urls == [
        "https://images.metmuseum.org/40-primary.jpg",
        "https://images.metmuseum.org/40-detail-a.jpg",
    ]
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [
        (40, "additional", 1),
        (40, "primary", None),
    ]
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    ] == [
        (40, "additional", 1),
        (40, "primary", None),
    ]
    assert [
        (reference.object_id, reference.source_image_url, reference.reason)
        for reference in get_met_skipped_image_references(
            database_path=storage.database_path,
        )
        if reference.reason == "collection_image_excluded"
    ] == [
        (
            40,
            "https://images.metmuseum.org/40-detail-b.jpg",
            "collection_image_excluded",
        )
    ]


def test_remove_object_from_collection_keeps_library_other_collection_and_files(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Bowl Study",
        terms_text="bowl",
        candidate_limit=1,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    with sqlite3.connect(storage.database_path) as connection:
        file_paths = [
            row[0]
            for row in connection.execute(
                """
                SELECT standard_path
                FROM image_assets
                WHERE provider = 'met' AND object_id = 40
                ORDER BY id
                """
            ).fetchall()
        ]

    removed = remove_object_from_collection(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
    )

    assert removed is True
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="bowl-study",
        )
    ] == [40]
    library_object = [
        museum_object
        for museum_object in list_library_objects(database_path=storage.database_path)
        if museum_object.object_id == 40
    ][0]
    assert [(collection.slug, collection.display_name) for collection in library_object.collections] == [
        ("bowl-study", "Bowl Study")
    ]
    assert all(Path(file_path).is_file() for file_path in file_paths)
    with sqlite3.connect(storage.database_path) as connection:
        active_image_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM image_assets
            WHERE provider = 'met' AND object_id = 40 AND active = 1
            """
        ).fetchone()[0]
        exclusion_row = connection.execute(
            """
            SELECT reason
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            WHERE
              search_sets.slug = 'snake-study'
              AND provider = 'met'
              AND object_id = 40
            """
        ).fetchone()
    assert active_image_count == 3
    assert exclusion_row == ("removed_from_collection",)


def test_remove_image_from_collection_keeps_siblings_and_orphans_that_image(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    detail_b = [
        image_asset
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]

    removed = remove_image_asset_from_collection(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        image_asset_id=detail_b.image_asset_id,
    )

    assert removed is True
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [
        (40, "additional", 1),
        (40, "primary", None),
        (20, "primary", None),
    ]
    assert [
        (museum_object.object_id, museum_object.image_count)
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [(40, 2), (20, 1)]
    orphan_image = [
        image_asset
        for image_asset in list_library_image_assets(
            database_path=storage.database_path,
            filter_text="No Collection",
        )
        if image_asset.image_asset_id == detail_b.image_asset_id
    ][0]
    assert orphan_image.collections == []
    with sqlite3.connect(storage.database_path) as connection:
        image_exclusion = connection.execute(
            """
            SELECT reason
            FROM collection_image_asset_exclusions
            JOIN search_sets
              ON search_sets.id = collection_image_asset_exclusions.search_set_id
            WHERE
              search_sets.slug = 'snake-study'
              AND provider = 'met'
              AND object_id = 40
              AND source_image_url = 'https://images.metmuseum.org/40-detail-b.jpg'
            """
        ).fetchone()
        object_exclusion = connection.execute(
            """
            SELECT 1
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            WHERE
              search_sets.slug = 'snake-study'
              AND provider = 'met'
              AND object_id = 40
            """
        ).fetchone()
    assert image_exclusion == ("removed_from_collection",)
    assert object_exclusion is None


def test_remove_last_image_from_collection_also_excludes_object(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    object_20_image = [
        image_asset
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
        if image_asset.object_id == 20
    ][0]

    removed = remove_image_asset_from_collection(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        image_asset_id=object_20_image.image_asset_id,
    )

    assert removed is True
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [40]
    orphan_object = [
        museum_object
        for museum_object in list_library_objects(
            database_path=storage.database_path,
            filter_text="No Collection",
        )
        if museum_object.object_id == 20
    ][0]
    assert orphan_object.collections == []
    with sqlite3.connect(storage.database_path) as connection:
        object_exclusion = connection.execute(
            """
            SELECT reason
            FROM collection_object_exclusions
            JOIN search_sets
              ON search_sets.id = collection_object_exclusions.search_set_id
            WHERE
              search_sets.slug = 'snake-study'
              AND provider = 'met'
              AND object_id = 20
            """
        ).fetchone()
    assert object_exclusion == ("removed_from_collection",)


def test_remove_from_collection_is_rejected_while_provider_search_is_running(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=2,
        met_client=SharedCandidateClient(),
    )
    ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=SharedRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )
    backfill_collection_memberships(database_path=storage.database_path)
    start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        available_disk_bytes=10_000_000,
    )

    try:
        remove_object_from_collection(
            database_path=storage.database_path,
            search_set_slug="snake-study",
            provider="met",
            object_id=40,
        )
    except CollectionCurationBusyError as error:
        assert str(error) == "Provider Search is running for this Collection."
    else:
        raise AssertionError("remove_object_from_collection should reject running search")

    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [40, 20]


def test_delete_image_asset_is_rejected_while_provider_search_is_running(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name="Snake Study",
        terms_text="snake",
    )
    run = discover_met_candidates(
        database_path=storage.database_path,
        search_set_slug=search_set.slug,
        candidate_offset=0,
        candidate_limit=2,
        met_client=SharedCandidateClient(),
    )
    ingest_met_run(
        database_path=storage.database_path,
        data_root=storage.data_root,
        run_id=run.run_id,
        met_client=SharedRecordClient(),
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )
    backfill_collection_memberships(database_path=storage.database_path)
    selected_image_asset = list_collection_image_assets(
        database_path=storage.database_path,
        search_set_slug="snake-study",
    )[0]
    with sqlite3.connect(storage.database_path) as connection:
        path_row = connection.execute(
            """
            SELECT standard_path, thumb_path
            FROM image_assets
            WHERE id = ?
            """,
            (selected_image_asset.image_asset_id,),
        ).fetchone()
    standard_path = Path(path_row[0])
    thumb_path = Path(path_row[1])
    start_collect_job(
        database_path=storage.database_path,
        run_id=run.run_id,
        candidate_offset=run.candidate_offset,
        candidate_limit=run.candidate_limit,
        candidate_progress_total=run.candidate_progress_total,
        available_disk_bytes=10_000_000,
    )

    try:
        delete_image_asset_from_anacronia(
            database_path=storage.database_path,
            image_asset_id=selected_image_asset.image_asset_id,
        )
    except CollectionCurationBusyError as error:
        assert str(error) == "Provider Search is running."
    else:
        raise AssertionError("delete_image_asset_from_anacronia should reject running search")

    assert standard_path.is_file()
    assert thumb_path.is_file()
    assert selected_image_asset.image_asset_id in {
        image_asset.image_asset_id
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    }


def test_delete_image_asset_removes_files_hides_everywhere_and_clears_favorite(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    detail_b = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]
    set_image_asset_favorite(
        database_path=storage.database_path,
        image_asset_id=detail_b.image_asset_id,
        is_favorite=True,
    )
    with sqlite3.connect(storage.database_path) as connection:
        path_row = connection.execute(
            """
            SELECT standard_path, thumb_path
            FROM image_assets
            WHERE id = ?
            """,
            (detail_b.image_asset_id,),
        ).fetchone()
    standard_path = Path(path_row[0])
    thumb_path = Path(path_row[1])

    deleted = delete_image_asset_from_anacronia(
        database_path=storage.database_path,
        image_asset_id=detail_b.image_asset_id,
    )

    assert deleted is True
    assert not standard_path.exists()
    assert not thumb_path.exists()
    assert [
        (image_asset.object_id, image_asset.image_role, image_asset.image_index)
        for image_asset in list_collection_image_assets(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [
        (40, "additional", 1),
        (40, "primary", None),
        (20, "primary", None),
    ]
    assert detail_b.image_asset_id not in {
        image_asset.image_asset_id
        for image_asset in list_library_image_assets(database_path=storage.database_path)
    }
    with sqlite3.connect(storage.database_path) as connection:
        active_row = connection.execute(
            "SELECT active, deleted_at FROM image_assets WHERE id = ?",
            (detail_b.image_asset_id,),
        ).fetchone()
        favorite_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM image_asset_favorites
            WHERE
              provider = 'met'
              AND object_id = 40
              AND source_image_url = 'https://images.metmuseum.org/40-detail-b.jpg'
            """
        ).fetchone()[0]
    assert active_row[0] == 0
    assert active_row[1] is not None
    assert favorite_count == 0
    assert [
        (match.object_id, match.search_term)
        for match in get_met_matches(database_path=storage.database_path, run_id=1)
    ] == [(20, "snake"), (40, "snake")]


def test_delete_image_asset_file_cleanup_failure_is_retryable(tmp_path, monkeypatch):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    selected_image_asset = list_library_image_assets(
        database_path=storage.database_path,
    )[0]
    with sqlite3.connect(storage.database_path) as connection:
        path_row = connection.execute(
            """
            SELECT standard_path, thumb_path
            FROM image_assets
            WHERE id = ?
            """,
            (selected_image_asset.image_asset_id,),
        ).fetchone()
    standard_path = Path(path_row[0])
    thumb_path = Path(path_row[1])
    original_unlink = Path.unlink
    failed_once = False

    def flaky_unlink(path: Path, *args, **kwargs):
        nonlocal failed_once
        if path == thumb_path and not failed_once:
            failed_once = True
            raise PermissionError("file busy")
        return original_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", flaky_unlink)

    try:
        delete_image_asset_from_anacronia(
            database_path=storage.database_path,
            image_asset_id=selected_image_asset.image_asset_id,
        )
    except CollectionFileCleanupError as error:
        assert error.path == thumb_path
    else:
        raise AssertionError("delete should fail on file cleanup error")

    with sqlite3.connect(storage.database_path) as connection:
        active_row = connection.execute(
            "SELECT active, deleted_at FROM image_assets WHERE id = ?",
            (selected_image_asset.image_asset_id,),
        ).fetchone()
    assert active_row == (1, None)
    assert not standard_path.exists()
    assert thumb_path.is_file()

    deleted = delete_image_asset_from_anacronia(
        database_path=storage.database_path,
        image_asset_id=selected_image_asset.image_asset_id,
    )

    assert deleted is True
    assert not thumb_path.exists()
    with sqlite3.connect(storage.database_path) as connection:
        active_row = connection.execute(
            "SELECT active, deleted_at FROM image_assets WHERE id = ?",
            (selected_image_asset.image_asset_id,),
        ).fetchone()
    assert active_row[0] == 0
    assert active_row[1] is not None


def test_delete_object_removes_files_hides_globally_and_preserves_audit_artifacts(tmp_path):
    storage = initialize_storage(project_root=tmp_path)
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Snake Study",
        terms_text="snake",
        candidate_limit=2,
    )
    ingest_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name="Bowl Study",
        terms_text="bowl",
        candidate_limit=1,
    )
    backfill_collection_memberships(database_path=storage.database_path)
    detail_b = [
        image_asset
        for image_asset in list_library_image_assets(database_path=storage.database_path)
        if image_asset.object_id == 40
        and image_asset.image_role == "additional"
        and image_asset.image_index == 2
    ][0]
    set_object_favorite(
        database_path=storage.database_path,
        provider="met",
        object_id=40,
        is_favorite=True,
    )
    set_image_asset_favorite(
        database_path=storage.database_path,
        image_asset_id=detail_b.image_asset_id,
        is_favorite=True,
    )
    add_collection_object_exclusion(
        database_path=storage.database_path,
        search_set_slug="snake-study",
        provider="met",
        object_id=40,
        reason="removed_from_collection",
    )
    export_result = export_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        search_set_slug="bowl-study",
        export_format="jsonl",
        timestamp="260603-1220Z",
    )
    with sqlite3.connect(storage.database_path) as connection:
        file_paths = [
            Path(path)
            for row in connection.execute(
                """
                SELECT standard_path, thumb_path
                FROM image_assets
                WHERE provider = 'met' AND object_id = 40
                """
            ).fetchall()
            for path in row
        ]

    deleted = delete_object_from_anacronia(
        database_path=storage.database_path,
        provider="met",
        object_id=40,
    )

    assert deleted is True
    assert all(not path.exists() for path in file_paths)
    assert [
        museum_object.object_id
        for museum_object in list_library_objects(database_path=storage.database_path)
    ] == [20]
    assert [
        museum_object.object_id
        for museum_object in list_collection_objects(
            database_path=storage.database_path,
            search_set_slug="snake-study",
        )
    ] == [20]
    assert list_collection_objects(
        database_path=storage.database_path,
        search_set_slug="bowl-study",
    ) == []
    assert (export_result.export_path / "manifest.jsonl").is_file()
    with sqlite3.connect(storage.database_path) as connection:
        object_active = connection.execute(
            """
            SELECT active
            FROM museum_objects
            WHERE provider = 'met' AND object_id = 40
            """
        ).fetchone()[0]
        active_image_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM image_assets
            WHERE provider = 'met' AND object_id = 40 AND active = 1
            """
        ).fetchone()[0]
        favorite_count = connection.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM object_favorites WHERE provider = 'met' AND object_id = 40),
              (SELECT COUNT(*) FROM image_asset_favorites WHERE provider = 'met' AND object_id = 40)
            """
        ).fetchone()
        exclusion_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM collection_object_exclusions
            WHERE provider = 'met' AND object_id = 40
            """
        ).fetchone()[0]
    assert object_active == 0
    assert active_image_count == 0
    assert favorite_count == (0, 0)
    assert exclusion_count == 1
    assert [
        (match.object_id, match.search_term)
        for match in get_met_matches(database_path=storage.database_path, run_id=1)
    ] == [(20, "snake"), (40, "snake")]
