from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
from typing import Callable, Protocol
from urllib.error import HTTPError

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.curation import get_collection_import_exclusions
from anacronia.image_pipeline import met_temporary_original_path
from anacronia.local_material import (
    LocalDescriptor,
    LocalImageAsset,
    LocalMuseumObject,
    LocalObjectMatch,
    LocalSkippedCandidate,
    LocalSkippedImageReference,
    ensure_local_material_schema,
    record_local_image_asset,
    record_local_object_match,
    record_local_skipped_candidate,
    record_local_skipped_image_reference,
    replace_local_descriptors,
    upsert_local_museum_object,
)
from anacronia.provider_import import (
    finish_provider_import_candidate,
    get_provider_search_set_id_for_run,
    list_provider_run_candidates,
    load_provider_import_run_context,
)
from anacronia.provider_image_import import (
    ProviderImageImportCandidate,
    import_provider_image_candidates,
)
from anacronia.provider_identity import normalize_source_object_id
from anacronia.search_sets import normalize_search_term
from anacronia.storage import met_image_derivative_path, met_raw_object_path


MET_PROVIDER = "met"
MET_VERIFIED_MATCH_FIELDS = [
    "title",
    "objectName",
    "tags",
    "medium",
    "culture",
    "period",
    "classification",
    "artistDisplayName",
]
MET_DESCRIPTOR_FIELD_TYPES = {
    "title": "title",
    "objectName": "object_name",
    "tags.term": "tag",
    "medium": "medium",
    "culture": "culture",
    "period": "period",
    "classification": "classification",
    "artistDisplayName": "artist",
    "department": "department",
    "objectDate": "date",
    "country": "place",
    "region": "place",
    "city": "place",
}
DEFAULT_MAX_IMAGES_PER_OBJECT = 3


class MetRecordClient(Protocol):
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        pass


@dataclass(frozen=True)
class SkippedMetCandidate:
    object_id: int
    reason: str


@dataclass(frozen=True)
class MetImageReference:
    object_id: int
    source_image_url: str
    image_role: str
    image_index: int | None
    primary_image_small_url: str


@dataclass(frozen=True)
class SkippedMetImageReference:
    object_id: int
    source_image_url: str
    image_role: str
    image_index: int | None
    reason: str


@dataclass(frozen=True)
class MetIngestSummary:
    run_id: int
    fetched_object_ids: list[int]
    imported_object_ids: list[int]
    imported_image_count: int
    skipped_candidates: list[SkippedMetCandidate]


@dataclass(frozen=True)
class MetMuseumObject:
    object_id: int
    title: str
    object_name: str
    object_url: str
    raw_record_path: Path
    rights_and_reproduction: str
    metadata_date: str


@dataclass(frozen=True)
class MetImageAsset:
    object_id: int
    source_image_url: str
    source_image_id: str
    image_role: str
    image_index: int | None
    primary_image_small_url: str
    original_width: int
    original_height: int
    standard_path: Path
    thumb_path: Path
    imported: bool


@dataclass(frozen=True)
class MetMatch:
    object_id: int
    search_term: str
    verified: bool
    matched_fields: list[str]


@dataclass(frozen=True)
class MetDescriptor:
    object_id: int
    descriptor_type: str
    value: str
    normalized_value: str
    source_field: str
    provider: str = MET_PROVIDER


@dataclass(frozen=True)
class DescriptorRebuildSummary:
    provider: str
    rebuilt_object_count: int
    descriptor_count: int
    missing_raw_record_count: int


def select_met_image_references(
    *,
    record: dict[str, object],
    max_images_per_object: int = DEFAULT_MAX_IMAGES_PER_OBJECT,
) -> tuple[list[MetImageReference], list[SkippedMetImageReference]]:
    effective_max_images_per_object = clamp_max_images_per_object(max_images_per_object)
    object_id = int(record["objectID"])
    unique_references: list[tuple[str, str, str]] = []
    seen_source_urls: set[str] = set()
    primary_image_url = string_value(record.get("primaryImage"))
    primary_image_small_url = string_value(record.get("primaryImageSmall"))

    if primary_image_url:
        unique_references.append(("primary", primary_image_url, primary_image_small_url))
        seen_source_urls.add(primary_image_url)

    for additional_image_url in string_list(record.get("additionalImages")):
        if additional_image_url in seen_source_urls:
            continue
        unique_references.append(("additional", additional_image_url, ""))
        seen_source_urls.add(additional_image_url)

    selected_references: list[MetImageReference] = []
    skipped_references: list[SkippedMetImageReference] = []
    additional_image_index = 1

    for image_role, source_image_url, small_url in unique_references:
        image_index = None
        if image_role == "additional":
            image_index = additional_image_index
            additional_image_index += 1

        if len(selected_references) < effective_max_images_per_object:
            selected_references.append(
                MetImageReference(
                    object_id=object_id,
                    source_image_url=source_image_url,
                    image_role=image_role,
                    image_index=image_index,
                    primary_image_small_url=small_url,
                )
            )
            continue

        skipped_references.append(
            SkippedMetImageReference(
                object_id=object_id,
                source_image_url=source_image_url,
                image_role=image_role,
                image_index=image_index,
                reason="beyond_max_images_per_object",
            )
        )

    return selected_references, skipped_references


def clamp_max_images_per_object(value: int) -> int:
    return min(max(int(value), 1), DEFAULT_MAX_IMAGES_PER_OBJECT)


def ingest_met_run(
    *,
    database_path: Path,
    data_root: Path,
    run_id: int,
    met_client: MetRecordClient,
    download_image_bytes: Callable[[str], bytes] | None = None,
    max_images_per_object: int = DEFAULT_MAX_IMAGES_PER_OBJECT,
    batch_target: int | None = None,
    start_run_position: int = 0,
    on_candidate_processed: Callable[[int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> MetIngestSummary:
    fetched_object_ids: list[int] = []
    imported_object_ids: list[int] = []
    imported_image_count = 0
    skipped_candidates: list[SkippedMetCandidate] = []
    resolved_download_image_bytes = download_image_bytes or missing_image_downloader

    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        run_context = load_provider_import_run_context(
            connection=connection,
            run_id=run_id,
            start_run_position=start_run_position,
        )
        run_candidates = run_context.candidates
        search_set_id = run_context.search_set_id

    for candidate in run_candidates:
        source_object_id = normalize_source_object_id(candidate.object_id)
        object_id = int(source_object_id)
        run_position = candidate.run_position
        with sqlite3.connect(database_path) as connection:
            ensure_met_ingest_schema(connection)
            import_exclusions = get_collection_import_exclusions(
                connection=connection,
                search_set_id=search_set_id,
                provider=MET_PROVIDER,
                object_id=source_object_id,
            )
            if import_exclusions.object_excluded:
                skipped_candidate = SkippedMetCandidate(
                    object_id=object_id,
                    reason="collection_object_excluded",
                )
                skipped_candidates.append(skipped_candidate)
                record_met_skipped_candidate_row(
                    connection=connection,
                    run_id=run_id,
                    candidate=skipped_candidate,
                )
                if finish_provider_import_candidate(
                    run_position=run_position,
                    on_candidate_processed=on_candidate_processed,
                    should_stop=should_stop,
                ):
                    break
                continue

        try:
            record = met_client.fetch_object_record(object_id)
        except HTTPError as error:
            if error.code != 404:
                raise
            skipped_candidate = SkippedMetCandidate(
                object_id=object_id,
                reason="provider_record_not_found",
            )
            skipped_candidates.append(skipped_candidate)
            record_met_skipped_candidate(
                database_path=database_path,
                run_id=run_id,
                candidate=skipped_candidate,
            )
            if finish_provider_import_candidate(
                run_position=run_position,
                on_candidate_processed=on_candidate_processed,
                should_stop=should_stop,
            ):
                break
            continue
        fetched_object_ids.append(object_id)

        if record.get("isPublicDomain") is not True:
            skipped_candidate = SkippedMetCandidate(
                object_id=object_id,
                reason="not_public_domain",
            )
            skipped_candidates.append(skipped_candidate)
            record_met_skipped_candidate(
                database_path=database_path,
                run_id=run_id,
                candidate=skipped_candidate,
            )
            if finish_provider_import_candidate(
                run_position=run_position,
                on_candidate_processed=on_candidate_processed,
                should_stop=should_stop,
            ):
                break
            continue

        image_references, skipped_image_references = select_met_image_references(
            record=record,
            max_images_per_object=max_images_per_object,
        )
        excluded_image_source_urls = import_exclusions.image_source_urls
        if excluded_image_source_urls:
            filtered_image_references: list[MetImageReference] = []
            for image_reference in image_references:
                if image_reference.source_image_url in excluded_image_source_urls:
                    skipped_image_references.append(
                        SkippedMetImageReference(
                            object_id=image_reference.object_id,
                            source_image_url=image_reference.source_image_url,
                            image_role=image_reference.image_role,
                            image_index=image_reference.image_index,
                            reason="collection_image_excluded",
                        )
                    )
                    continue
                filtered_image_references.append(image_reference)
            image_references = filtered_image_references

        image_import_result = import_provider_image_candidates(
            candidates=[
                met_image_import_candidate_from_reference(
                    data_root=data_root,
                    reference=image_reference,
                )
                for image_reference in image_references
            ],
            download_image_bytes=resolved_download_image_bytes,
        )
        processed_image_assets = image_import_result.imported_image_assets
        skipped_image_references.extend(
            met_skipped_image_reference_from_local(reference)
            for reference in image_import_result.skipped_image_references
        )

        if not processed_image_assets:
            skipped_candidate = SkippedMetCandidate(
                object_id=object_id,
                reason="no_imported_image_assets",
            )
            skipped_candidates.append(skipped_candidate)
            record_met_skipped_candidate(
                database_path=database_path,
                run_id=run_id,
                candidate=skipped_candidate,
            )
            record_skipped_met_image_references(
                database_path=database_path,
                references=skipped_image_references,
            )
            if finish_provider_import_candidate(
                run_position=run_position,
                on_candidate_processed=on_candidate_processed,
                should_stop=should_stop,
            ):
                break
            continue

        raw_record_path = write_met_raw_record(data_root=data_root, record=record)
        with sqlite3.connect(database_path) as connection:
            ensure_met_ingest_schema(connection)
            for skipped_image_reference in skipped_image_references:
                record_met_skipped_image_reference(
                    connection=connection,
                    reference=skipped_image_reference,
                )

            for image_asset in processed_image_assets:
                record_met_image_asset(connection=connection, image_asset=image_asset)

            upsert_met_museum_object(connection=connection, record=record, raw_record_path=raw_record_path)
            record_met_match(
                connection=connection,
                run_id=run_id,
                object_id=object_id,
                search_term=candidate.source_term,
                matched_fields=matched_verified_fields(
                    record=record,
                    search_term=candidate.source_term,
                ),
            )
            replace_met_descriptors(
                connection=connection,
                object_id=object_id,
                descriptors=extract_met_descriptors(record),
            )
            usable_image_count = 0
            for image_asset in processed_image_assets:
                if image_asset.source_image_url in excluded_image_source_urls:
                    record_met_skipped_image_reference(
                        connection=connection,
                        reference=SkippedMetImageReference(
                            object_id=image_asset.object_id,
                            source_image_url=image_asset.source_image_url,
                            image_role=image_asset.image_role,
                            image_index=image_asset.image_index,
                            reason="collection_image_excluded",
                        ),
                    )
                    continue
                usable_image_count += 1
        if usable_image_count > 0:
            imported_object_ids.append(object_id)
        imported_image_count += usable_image_count
        if finish_provider_import_candidate(
            run_position=run_position,
            on_candidate_processed=on_candidate_processed,
            should_stop=should_stop,
        ):
            break
        if batch_target is not None and imported_image_count >= batch_target:
            break

    return MetIngestSummary(
        run_id=run_id,
        fetched_object_ids=fetched_object_ids,
        imported_object_ids=imported_object_ids,
        imported_image_count=imported_image_count,
        skipped_candidates=skipped_candidates,
    )


def record_skipped_met_image_references(
    *,
    database_path: Path,
    references: list[SkippedMetImageReference],
) -> None:
    if not references:
        return

    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        for reference in references:
            record_met_skipped_image_reference(connection=connection, reference=reference)


def record_met_skipped_candidate(
    *,
    database_path: Path,
    run_id: int,
    candidate: SkippedMetCandidate,
) -> None:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        record_met_skipped_candidate_row(
            connection=connection,
            run_id=run_id,
            candidate=candidate,
        )


def record_met_skipped_candidate_row(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    candidate: SkippedMetCandidate,
) -> None:
    record_local_skipped_candidate(
        connection=connection,
        candidate=LocalSkippedCandidate(
            run_id=run_id,
            provider=MET_PROVIDER,
            object_id=candidate.object_id,
            reason=candidate.reason,
        ),
    )


def get_met_museum_objects(*, database_path: Path) -> list[MetMuseumObject]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT
              object_id,
              title,
              object_name,
              object_url,
              raw_record_path,
              rights_and_reproduction,
              metadata_date
            FROM museum_objects
            WHERE provider = ?
            ORDER BY CAST(object_id AS INTEGER)
            """,
            (MET_PROVIDER,),
        ).fetchall()

    return [
        MetMuseumObject(
            object_id=int(row[0]),
            title=row[1],
            object_name=row[2],
            object_url=row[3],
            raw_record_path=Path(row[4]),
            rights_and_reproduction=row[5],
            metadata_date=row[6],
        )
        for row in rows
    ]


def get_met_image_assets(*, database_path: Path) -> list[MetImageAsset]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT
              object_id,
              source_image_url,
              source_image_id,
              image_role,
              image_index,
              primary_image_small_url,
              original_width,
              original_height,
              standard_path,
              thumb_path,
              imported
            FROM image_assets
            WHERE provider = ?
            ORDER BY CAST(object_id AS INTEGER), COALESCE(image_index, 0), source_image_url
            """,
            (MET_PROVIDER,),
        ).fetchall()

    return [
        MetImageAsset(
            object_id=int(row[0]),
            source_image_url=row[1],
            source_image_id=row[2],
            image_role=row[3],
            image_index=row[4],
            primary_image_small_url=row[5],
            original_width=row[6],
            original_height=row[7],
            standard_path=Path(row[8]),
            thumb_path=Path(row[9]),
            imported=bool(row[10]),
        )
        for row in rows
    ]


def get_met_skipped_image_references(
    *,
    database_path: Path,
) -> list[SkippedMetImageReference]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT object_id, source_image_url, image_role, image_index, reason
            FROM skipped_image_references
            WHERE provider = ?
            ORDER BY CAST(object_id AS INTEGER), COALESCE(image_index, 0), source_image_url, reason
            """,
            (MET_PROVIDER,),
        ).fetchall()

    return [
        SkippedMetImageReference(
            object_id=int(row[0]),
            source_image_url=row[1],
            image_role=row[2],
            image_index=row[3],
            reason=row[4],
        )
        for row in rows
    ]


def get_met_skipped_candidates(
    *,
    database_path: Path,
    run_id: int,
) -> list[SkippedMetCandidate]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT object_id, reason
            FROM skipped_candidates
            WHERE provider = ? AND run_id = ?
            ORDER BY CAST(object_id AS INTEGER), reason
            """,
            (MET_PROVIDER, run_id),
        ).fetchall()

    return [
        SkippedMetCandidate(object_id=int(row[0]), reason=row[1])
        for row in rows
    ]


def get_met_matches(*, database_path: Path, run_id: int) -> list[MetMatch]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT object_id, search_term, verified, matched_fields_json
            FROM object_matches
            WHERE provider = ? AND run_id = ?
            ORDER BY CAST(object_id AS INTEGER), search_term
            """,
            (MET_PROVIDER, run_id),
        ).fetchall()

    return [
        MetMatch(
            object_id=int(row[0]),
            search_term=row[1],
            verified=bool(row[2]),
            matched_fields=json.loads(row[3]),
        )
        for row in rows
    ]


def get_met_descriptors(*, database_path: Path, object_id: int) -> list[MetDescriptor]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT provider, descriptor_type, value, normalized_value, source_field
            FROM descriptors
            WHERE provider = ? AND object_id = ?
            ORDER BY descriptor_type, value, source_field
            """,
            (MET_PROVIDER, object_id),
        ).fetchall()

    return [
        MetDescriptor(
            object_id=object_id,
            provider=row[0],
            descriptor_type=row[1],
            value=row[2],
            normalized_value=row[3],
            source_field=row[4],
        )
        for row in rows
    ]


def rebuild_met_descriptors(*, database_path: Path) -> DescriptorRebuildSummary:
    rebuilt_object_count = 0
    descriptor_count = 0
    missing_raw_record_count = 0

    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT object_id, raw_record_path
            FROM museum_objects
            WHERE provider = ?
            ORDER BY CAST(object_id AS INTEGER)
            """,
            (MET_PROVIDER,),
        ).fetchall()

        for object_id, raw_record_path_text in rows:
            raw_record_path = Path(raw_record_path_text)
            try:
                record = json.loads(raw_record_path.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                missing_raw_record_count += 1
                continue

            descriptors = extract_met_descriptors(record)
            replace_met_descriptors(
                connection=connection,
                object_id=int(object_id),
                descriptors=descriptors,
            )
            rebuilt_object_count += 1
            descriptor_count += len(descriptors)

    return DescriptorRebuildSummary(
        provider=MET_PROVIDER,
        rebuilt_object_count=rebuilt_object_count,
        descriptor_count=descriptor_count,
        missing_raw_record_count=missing_raw_record_count,
    )


def get_run_candidates_for_ingest(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    start_run_position: int = 0,
) -> list[dict[str, object]]:
    return [
        {
            "object_id": candidate.object_id,
            "source_term": candidate.source_term,
            "run_position": candidate.run_position,
        }
        for candidate in list_provider_run_candidates(
            connection=connection,
            run_id=run_id,
            start_run_position=start_run_position,
        )
    ]


def get_search_set_id_for_run(
    *,
    connection: sqlite3.Connection,
    run_id: int,
) -> int:
    return get_provider_search_set_id_for_run(
        connection=connection,
        run_id=run_id,
    )


def write_met_raw_record(*, data_root: Path, record: dict[str, object]) -> Path:
    object_id = int(record["objectID"])
    raw_record_path = met_raw_object_path(data_root=data_root, object_id=object_id)
    raw_record_path.parent.mkdir(parents=True, exist_ok=True)
    raw_record_path.write_text(json.dumps(record, indent=2, sort_keys=True), encoding="utf-8")
    return raw_record_path


def met_museum_object_from_record(
    *,
    record: dict[str, object],
    raw_record_path: Path,
) -> LocalMuseumObject:
    object_id = int(record["objectID"])
    return LocalMuseumObject(
        provider=MET_PROVIDER,
        object_id=object_id,
        title=string_value(record.get("title")),
        object_name=string_value(record.get("objectName")),
        artist_display_name=string_value(record.get("artistDisplayName")),
        object_url=string_value(record.get("objectURL")),
        is_public_domain=True,
        rights_and_reproduction=string_value(record.get("rightsAndReproduction")),
        metadata_date=string_value(record.get("metadataDate")),
        raw_record_path=raw_record_path,
    )


def met_image_import_candidate_from_reference(
    *,
    data_root: Path,
    reference: MetImageReference,
) -> ProviderImageImportCandidate:
    return ProviderImageImportCandidate(
        provider=MET_PROVIDER,
        object_id=reference.object_id,
        source_image_url=reference.source_image_url,
        source_image_id=reference.source_image_url,
        image_role=reference.image_role,
        image_index=reference.image_index,
        primary_image_small_url=reference.primary_image_small_url,
        temporary_original_path=met_temporary_original_path(
            data_root=data_root,
            object_id=reference.object_id,
            image_role=reference.image_role,
            image_index=reference.image_index,
        ),
        standard_path=met_image_derivative_path(
            data_root=data_root,
            object_id=reference.object_id,
            image_role=reference.image_role,
            image_index=reference.image_index,
            derivative="standard-1024",
        ),
        thumb_path=met_image_derivative_path(
            data_root=data_root,
            object_id=reference.object_id,
            image_role=reference.image_role,
            image_index=reference.image_index,
            derivative="thumb-256",
        ),
    )


def met_skipped_image_reference_from_local(
    reference: LocalSkippedImageReference,
) -> SkippedMetImageReference:
    return SkippedMetImageReference(
        object_id=int(reference.object_id),
        source_image_url=reference.source_image_url,
        image_role=reference.image_role,
        image_index=reference.image_index,
        reason=reference.reason,
    )


def upsert_met_museum_object(
    *,
    connection: sqlite3.Connection,
    record: dict[str, object],
    raw_record_path: Path,
) -> None:
    upsert_local_museum_object(
        connection=connection,
        museum_object=met_museum_object_from_record(
            record=record,
            raw_record_path=raw_record_path,
        ),
    )


def record_met_match(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    object_id: int,
    search_term: str,
    matched_fields: list[str],
) -> None:
    record_local_object_match(
        connection=connection,
        match=LocalObjectMatch(
            run_id=run_id,
            provider=MET_PROVIDER,
            object_id=object_id,
            search_term=search_term,
            matched_fields=matched_fields,
        ),
    )


def record_met_image_asset(
    *,
    connection: sqlite3.Connection,
    image_asset: LocalImageAsset,
) -> None:
    record_local_image_asset(
        connection=connection,
        image_asset=image_asset,
    )


def record_met_skipped_image_reference(
    *,
    connection: sqlite3.Connection,
    reference: SkippedMetImageReference,
) -> None:
    record_local_skipped_image_reference(
        connection=connection,
        reference=LocalSkippedImageReference(
            provider=MET_PROVIDER,
            object_id=reference.object_id,
            source_image_url=reference.source_image_url,
            image_role=reference.image_role,
            image_index=reference.image_index,
            reason=reference.reason,
        ),
    )


def replace_met_descriptors(
    *,
    connection: sqlite3.Connection,
    object_id: int,
    descriptors: list[MetDescriptor],
) -> None:
    replace_local_descriptors(
        connection=connection,
        provider=MET_PROVIDER,
        object_id=object_id,
        descriptors=[
            LocalDescriptor(
                provider=MET_PROVIDER,
                object_id=object_id,
                descriptor_type=descriptor.descriptor_type,
                value=descriptor.value,
                normalized_value=descriptor.normalized_value,
                source_field=descriptor.source_field,
            )
            for descriptor in descriptors
        ],
    )


def matched_verified_fields(
    *,
    record: dict[str, object],
    search_term: str,
) -> list[str]:
    normalized_search_term = normalize_search_term(search_term)
    matched_fields: list[str] = []

    for source_field in MET_VERIFIED_MATCH_FIELDS:
        values = values_from_met_field(record=record, source_field=source_field)
        if any(normalized_search_term in normalize_search_term(value) for value in values):
            matched_fields.append(source_field)

    return sorted(matched_fields)


def extract_met_descriptors(record: dict[str, object]) -> list[MetDescriptor]:
    object_id = int(record["objectID"])
    descriptors: list[MetDescriptor] = []
    seen_descriptors: set[tuple[str, str, str]] = set()

    for source_field, descriptor_type in MET_DESCRIPTOR_FIELD_TYPES.items():
        for value in values_from_met_field(record=record, source_field=source_field):
            normalized_value = normalize_search_term(value)
            key = (descriptor_type, normalized_value, source_field)
            if not normalized_value or key in seen_descriptors:
                continue

            seen_descriptors.add(key)
            descriptors.append(
                MetDescriptor(
                    object_id=object_id,
                    descriptor_type=descriptor_type,
                    value=value,
                    normalized_value=normalized_value,
                    source_field=source_field,
                )
            )

    return sorted(
        descriptors,
        key=lambda descriptor: (
            descriptor.descriptor_type,
            descriptor.value,
            descriptor.source_field,
        ),
    )


def values_from_met_field(*, record: dict[str, object], source_field: str) -> list[str]:
    if source_field == "tags" or source_field == "tags.term":
        tags = record.get("tags")
        if not isinstance(tags, list):
            return []

        values: list[str] = []
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            term = tag.get("term")
            if isinstance(term, str) and term.strip():
                values.append(term.strip())
        return values

    value = record.get(source_field)
    if isinstance(value, str) and value.strip():
        return [value.strip()]

    return []


def string_value(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def missing_image_downloader(url: str) -> bytes:
    raise RuntimeError(f"Image downloader is required to import {url}")


def ensure_met_ingest_schema(connection: sqlite3.Connection) -> None:
    ensure_collection_run_schema(connection)
    ensure_local_material_schema(connection)
