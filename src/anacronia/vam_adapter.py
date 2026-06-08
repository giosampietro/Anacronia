from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
from typing import Callable, Protocol
from urllib.error import HTTPError

from anacronia.collection_runs import CandidateRun, discover_provider_candidates
from anacronia.curation import get_collection_import_exclusions
from anacronia.image_pipeline import process_image_derivatives_from_bytes
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
from anacronia.met_ingest import (
    DEFAULT_MAX_IMAGES_PER_OBJECT,
    get_run_candidates_for_ingest,
    get_search_set_id_for_run,
    missing_image_downloader,
)
from anacronia.provider_adapters import ProviderIngestRequest
from anacronia.provider_identity import SourceObjectId, normalize_source_object_id
from anacronia.search_sets import normalize_search_term
from anacronia.storage import (
    provider_image_derivative_path,
    provider_raw_record_path,
    provider_temporary_original_path,
)


VAM_PROVIDER = "vam"
VAM_DISPLAY_NAME = "V&A"
VAM_TERMS_NOTICE = (
    "V&A images are imported for private local testing in Anacronia. "
    "Check V&A terms before publication or commercial reuse."
)
VAM_IMAGE_BASE_URL = "https://framemark.vam.ac.uk/collections"
VAM_COLLECTION_PAGE_BASE_URL = "https://collections.vam.ac.uk/item"
VAM_VERIFIED_MATCH_FIELDS = [
    "record.titles.title",
    "record.objectType",
    "record.artistMakerPerson.name.text",
    "record.artistMakerPeople.name.text",
    "record.artistMakerOrganisations.name.text",
    "record.materials.text",
    "record.techniques.text",
    "record.categories.text",
    "record.styles.text",
    "record.summaryDescription",
    "record.briefDescription",
]


class VamClient(Protocol):
    def search_object_ids(self, term: str) -> list[str]:
        pass

    def fetch_object_record(self, object_id: str) -> dict[str, object]:
        pass


@dataclass(frozen=True)
class VamSkippedCandidate:
    object_id: str
    reason: str


@dataclass(frozen=True)
class VamImageReference:
    object_id: str
    asset_ref: str
    source_image_url: str
    image_role: str
    image_index: int | None
    primary_image_small_url: str
    copyright_text: str
    sensitive_image: bool | None


@dataclass(frozen=True)
class VamSkippedImageReference:
    object_id: str
    source_image_url: str
    image_role: str
    image_index: int | None
    reason: str


@dataclass(frozen=True)
class VamIngestSummary:
    run_id: int
    fetched_object_ids: list[str]
    imported_object_ids: list[str]
    imported_image_count: int
    skipped_candidates: list[VamSkippedCandidate]


@dataclass(frozen=True)
class VamProviderAdapter:
    vam_client: VamClient
    download_image_bytes: Callable[[str], bytes] | None = None
    provider: str = VAM_PROVIDER
    display_name: str = VAM_DISPLAY_NAME

    def discover_candidate_run(
        self,
        *,
        database_path: Path,
        search_set_slug: str,
        candidate_offset: int,
        candidate_limit: int,
        batch_target: int,
    ) -> CandidateRun:
        return discover_provider_candidates(
            database_path=database_path,
            search_set_slug=search_set_slug,
            provider=self.provider,
            candidate_offset=candidate_offset,
            candidate_limit=candidate_limit,
            candidate_client=self.vam_client,
            batch_target=batch_target,
        )

    def ingest_run(self, request: ProviderIngestRequest) -> VamIngestSummary:
        return ingest_vam_run(
            database_path=request.database_path,
            data_root=request.data_root,
            run_id=request.run_id,
            vam_client=self.vam_client,
            download_image_bytes=self.download_image_bytes,
            max_images_per_object=request.max_images_per_object,
            batch_target=request.batch_target,
            start_run_position=request.start_run_position,
            on_candidate_processed=request.on_candidate_processed,
            should_stop=request.should_stop,
        )


def ingest_vam_run(
    *,
    database_path: Path,
    data_root: Path,
    run_id: int,
    vam_client: VamClient,
    download_image_bytes: Callable[[str], bytes] | None = None,
    max_images_per_object: int = DEFAULT_MAX_IMAGES_PER_OBJECT,
    batch_target: int | None = None,
    start_run_position: int = 0,
    on_candidate_processed: Callable[[int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> VamIngestSummary:
    fetched_object_ids: list[str] = []
    imported_object_ids: list[str] = []
    imported_image_count = 0
    skipped_candidates: list[VamSkippedCandidate] = []
    resolved_download_image_bytes = download_image_bytes or missing_image_downloader

    with sqlite3.connect(database_path) as connection:
        ensure_local_material_schema(connection)
        run_candidates = get_run_candidates_for_ingest(
            connection=connection,
            run_id=run_id,
            start_run_position=start_run_position,
        )
        search_set_id = get_search_set_id_for_run(
            connection=connection,
            run_id=run_id,
        )

    for candidate in run_candidates:
        object_id = normalize_source_object_id(candidate["object_id"])
        run_position = int(candidate["run_position"])
        with sqlite3.connect(database_path) as connection:
            ensure_local_material_schema(connection)
            import_exclusions = get_collection_import_exclusions(
                connection=connection,
                search_set_id=search_set_id,
                provider=VAM_PROVIDER,
                object_id=object_id,
            )
            if import_exclusions.object_excluded:
                skipped_candidate = VamSkippedCandidate(
                    object_id=object_id,
                    reason="collection_object_excluded",
                )
                skipped_candidates.append(skipped_candidate)
                record_vam_skipped_candidate(
                    connection=connection,
                    run_id=run_id,
                    candidate=skipped_candidate,
                )
                if on_candidate_processed is not None:
                    on_candidate_processed(run_position)
                if should_stop is not None and should_stop():
                    break
                continue

        try:
            record = vam_client.fetch_object_record(object_id)
        except HTTPError as error:
            if error.code != 404:
                raise
            skipped_candidate = VamSkippedCandidate(
                object_id=object_id,
                reason="provider_record_not_found",
            )
            skipped_candidates.append(skipped_candidate)
            with sqlite3.connect(database_path) as connection:
                ensure_local_material_schema(connection)
                record_vam_skipped_candidate(
                    connection=connection,
                    run_id=run_id,
                    candidate=skipped_candidate,
                )
            if on_candidate_processed is not None:
                on_candidate_processed(run_position)
            if should_stop is not None and should_stop():
                break
            continue
        fetched_object_ids.append(object_id)

        raw_record_path = write_vam_raw_record(data_root=data_root, record=record)
        image_references, skipped_image_references = select_vam_image_references(
            record=record,
            max_images_per_object=max_images_per_object,
        )
        excluded_image_source_urls = import_exclusions.image_source_urls
        if excluded_image_source_urls:
            filtered_image_references: list[VamImageReference] = []
            for image_reference in image_references:
                if image_reference.source_image_url in excluded_image_source_urls:
                    skipped_image_references.append(
                        VamSkippedImageReference(
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

        processed_image_assets: list[tuple[VamImageReference, LocalImageAsset]] = []
        for image_reference in image_references:
            try:
                processed = process_image_derivatives_from_bytes(
                    source_bytes=resolved_download_image_bytes(
                        image_reference.source_image_url
                    ),
                    temporary_original_path=provider_temporary_original_path(
                        data_root=data_root,
                        provider=VAM_PROVIDER,
                        object_id=image_reference.object_id,
                        image_role=image_reference.image_role,
                        image_index=image_reference.image_index,
                    ),
                    standard_path=provider_image_derivative_path(
                        data_root=data_root,
                        provider=VAM_PROVIDER,
                        object_id=image_reference.object_id,
                        image_role=image_reference.image_role,
                        image_index=image_reference.image_index,
                        derivative="standard-1024",
                    ),
                    thumb_path=provider_image_derivative_path(
                        data_root=data_root,
                        provider=VAM_PROVIDER,
                        object_id=image_reference.object_id,
                        image_role=image_reference.image_role,
                        image_index=image_reference.image_index,
                        derivative="thumb-256",
                    ),
                )
            except Exception:
                skipped_image_references.append(
                    VamSkippedImageReference(
                        object_id=image_reference.object_id,
                        source_image_url=image_reference.source_image_url,
                        image_role=image_reference.image_role,
                        image_index=image_reference.image_index,
                        reason="image_processing_failed",
                    )
                )
                continue

            if not processed.imported:
                skipped_image_references.append(
                    VamSkippedImageReference(
                        object_id=image_reference.object_id,
                        source_image_url=image_reference.source_image_url,
                        image_role=image_reference.image_role,
                        image_index=image_reference.image_index,
                        reason="image_processing_failed",
                    )
                )
                continue

            processed_image_assets.append(
                (
                    image_reference,
                    LocalImageAsset(
                        provider=VAM_PROVIDER,
                        object_id=image_reference.object_id,
                        source_image_url=image_reference.source_image_url,
                        image_role=image_reference.image_role,
                        image_index=image_reference.image_index,
                        primary_image_small_url=image_reference.primary_image_small_url,
                        original_width=processed.original_width,
                        original_height=processed.original_height,
                        standard_path=processed.standard_path,
                        thumb_path=processed.thumb_path,
                        imported=processed.imported,
                        source_metadata=(
                            {"sensitive_image": image_reference.sensitive_image}
                            if image_reference.sensitive_image is not None
                            else {}
                        ),
                    ),
                )
            )

        if not processed_image_assets:
            skipped_candidate = VamSkippedCandidate(
                object_id=object_id,
                reason="no_imported_image_assets",
            )
            skipped_candidates.append(skipped_candidate)
            with sqlite3.connect(database_path) as connection:
                ensure_local_material_schema(connection)
                record_vam_skipped_candidate(
                    connection=connection,
                    run_id=run_id,
                    candidate=skipped_candidate,
                )
                for skipped_image_reference in skipped_image_references:
                    record_vam_skipped_image_reference(
                        connection=connection,
                        reference=skipped_image_reference,
                    )
            if on_candidate_processed is not None:
                on_candidate_processed(run_position)
            if should_stop is not None and should_stop():
                break
            continue

        with sqlite3.connect(database_path) as connection:
            ensure_local_material_schema(connection)
            for skipped_image_reference in skipped_image_references:
                record_vam_skipped_image_reference(
                    connection=connection,
                    reference=skipped_image_reference,
                )
            for _image_reference, image_asset in processed_image_assets:
                record_local_image_asset(
                    connection=connection,
                    image_asset=image_asset,
                )
            upsert_local_museum_object(
                connection=connection,
                museum_object=vam_museum_object_from_record(
                    record=record,
                    raw_record_path=raw_record_path,
                ),
            )
            record_local_object_match(
                connection=connection,
                match=LocalObjectMatch(
                    run_id=run_id,
                    provider=VAM_PROVIDER,
                    object_id=object_id,
                    search_term=str(candidate["source_term"]),
                    matched_fields=matched_vam_fields(
                        record=record,
                        search_term=str(candidate["source_term"]),
                    ),
                ),
            )
            replace_local_descriptors(
                connection=connection,
                provider=VAM_PROVIDER,
                object_id=object_id,
                descriptors=extract_vam_descriptors(record),
            )

        imported_object_ids.append(object_id)
        imported_image_count += len(processed_image_assets)
        if on_candidate_processed is not None:
            on_candidate_processed(run_position)
        if should_stop is not None and should_stop():
            break
        if batch_target is not None and imported_image_count >= batch_target:
            break

    return VamIngestSummary(
        run_id=run_id,
        fetched_object_ids=fetched_object_ids,
        imported_object_ids=imported_object_ids,
        imported_image_count=imported_image_count,
        skipped_candidates=skipped_candidates,
    )


def select_vam_image_references(
    *,
    record: dict[str, object],
    max_images_per_object: int = DEFAULT_MAX_IMAGES_PER_OBJECT,
) -> tuple[list[VamImageReference], list[VamSkippedImageReference]]:
    object_id = vam_object_id(record)
    effective_max_images_per_object = min(max(int(max_images_per_object), 1), DEFAULT_MAX_IMAGES_PER_OBJECT)
    primary_thumbnail = nested_string(record, ["meta", "images", "_primary_thumbnail"])
    ordered_asset_refs = vam_image_asset_refs(record)
    copyright_by_asset_ref = vam_image_copyright_by_asset_ref(record)
    sensitive_by_asset_ref = vam_image_sensitive_by_asset_ref(record)
    selected_references: list[VamImageReference] = []
    skipped_references: list[VamSkippedImageReference] = []
    additional_image_index = 1

    for asset_ref_index, asset_ref in enumerate(ordered_asset_refs):
        image_role = "primary" if asset_ref_index == 0 else "additional"
        image_index = None
        if image_role == "additional":
            image_index = additional_image_index
            additional_image_index += 1
        source_image_url = vam_iiif_source_image_url(asset_ref)

        if len(selected_references) < effective_max_images_per_object:
            selected_references.append(
                VamImageReference(
                    object_id=object_id,
                    asset_ref=asset_ref,
                    source_image_url=source_image_url,
                    image_role=image_role,
                    image_index=image_index,
                    primary_image_small_url=primary_thumbnail if image_role == "primary" else "",
                    copyright_text=copyright_by_asset_ref.get(asset_ref, ""),
                    sensitive_image=sensitive_by_asset_ref.get(asset_ref),
                )
            )
            continue

        skipped_references.append(
            VamSkippedImageReference(
                object_id=object_id,
                source_image_url=source_image_url,
                image_role=image_role,
                image_index=image_index,
                reason="beyond_max_images_per_object",
            )
        )

    return selected_references, skipped_references


def vam_image_asset_refs(record: dict[str, object]) -> list[str]:
    asset_refs: list[str] = []
    seen_asset_refs: set[str] = set()

    for asset_ref in string_list_from_path(record, ["record", "images"]):
        if asset_ref in seen_asset_refs:
            continue
        seen_asset_refs.add(asset_ref)
        asset_refs.append(asset_ref)

    images_meta = nested_value(record, ["meta", "images", "_images_meta"])
    if isinstance(images_meta, list):
        for item in images_meta:
            if not isinstance(item, dict):
                continue
            asset_ref = string_value(item.get("assetRef"))
            if not asset_ref or asset_ref in seen_asset_refs:
                continue
            seen_asset_refs.add(asset_ref)
            asset_refs.append(asset_ref)

    primary_image_base_url = nested_string(record, ["meta", "images", "_iiif_image"])
    primary_asset_ref = primary_image_base_url.rstrip("/").split("/")[-1]
    if primary_asset_ref and primary_asset_ref not in seen_asset_refs:
        asset_refs.insert(0, primary_asset_ref)

    return asset_refs


def vam_image_copyright_by_asset_ref(record: dict[str, object]) -> dict[str, str]:
    values: dict[str, str] = {}
    images_meta = nested_value(record, ["meta", "images", "_images_meta"])
    if not isinstance(images_meta, list):
        return values

    for item in images_meta:
        if not isinstance(item, dict):
            continue
        asset_ref = string_value(item.get("assetRef"))
        copyright_text = string_value(item.get("copyright"))
        if asset_ref and copyright_text:
            values[asset_ref] = copyright_text
    return values


def vam_image_sensitive_by_asset_ref(record: dict[str, object]) -> dict[str, bool]:
    values: dict[str, bool] = {}
    images_meta = nested_value(record, ["meta", "images", "_images_meta"])
    if not isinstance(images_meta, list):
        return values

    for item in images_meta:
        if not isinstance(item, dict):
            continue
        asset_ref = string_value(item.get("assetRef"))
        if asset_ref and "sensitiveImage" in item:
            values[asset_ref] = item.get("sensitiveImage") is True
    return values


def vam_museum_object_from_record(
    *,
    record: dict[str, object],
    raw_record_path: Path,
) -> LocalMuseumObject:
    object_id = vam_object_id(record)
    rights_statement = vam_rights_statement(record)
    return LocalMuseumObject(
        provider=VAM_PROVIDER,
        object_id=object_id,
        title=vam_title(record),
        object_name=nested_string(record, ["record", "objectType"]),
        artist_display_name=vam_artist_display_name(record),
        object_url=vam_object_url(record),
        is_public_domain=False,
        rights_and_reproduction=rights_statement,
        metadata_date=nested_string(record, ["record", "recordModificationDate"]),
        raw_record_path=raw_record_path,
    )


def extract_vam_descriptors(record: dict[str, object]) -> list[LocalDescriptor]:
    object_id = vam_object_id(record)
    descriptors: list[LocalDescriptor] = []
    seen: set[tuple[str, str, str]] = set()
    field_mappings = [
        ("record.titles.title", "title", strings_from_path(record, ["record", "titles"], "title")),
        ("record.objectType", "object_name", [nested_string(record, ["record", "objectType"])]),
        ("record.artistMakerPerson.name.text", "artist", strings_from_path(record, ["record", "artistMakerPerson"], ("name", "text"))),
        ("record.artistMakerPeople.name.text", "artist", strings_from_path(record, ["record", "artistMakerPeople"], ("name", "text"))),
        ("record.materials.text", "medium", strings_from_path(record, ["record", "materials"], "text")),
        ("record.techniques.text", "technique", strings_from_path(record, ["record", "techniques"], "text")),
        ("record.categories.text", "category", strings_from_path(record, ["record", "categories"], "text")),
        ("record.styles.text", "style", strings_from_path(record, ["record", "styles"], "text")),
        ("record.placesOfOrigin.place.text", "place", strings_from_path(record, ["record", "placesOfOrigin"], ("place", "text"))),
        ("record.productionDates.date.text", "date", strings_from_path(record, ["record", "productionDates"], ("date", "text"))),
    ]

    for source_field, descriptor_type, values in field_mappings:
        for value in values:
            normalized_value = normalize_search_term(value)
            if not normalized_value:
                continue
            key = (descriptor_type, normalized_value, source_field)
            if key in seen:
                continue
            seen.add(key)
            descriptors.append(
                LocalDescriptor(
                    provider=VAM_PROVIDER,
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


def matched_vam_fields(*, record: dict[str, object], search_term: str) -> list[str]:
    normalized_search_term = normalize_search_term(search_term)
    matched_fields: list[str] = []

    for source_field in VAM_VERIFIED_MATCH_FIELDS:
        for value in values_from_vam_field(record=record, source_field=source_field):
            if normalized_search_term in normalize_search_term(value):
                matched_fields.append(source_field)
                break

    return sorted(matched_fields)


def values_from_vam_field(*, record: dict[str, object], source_field: str) -> list[str]:
    if source_field == "record.titles.title":
        return strings_from_path(record, ["record", "titles"], "title")
    if source_field == "record.objectType":
        return [nested_string(record, ["record", "objectType"])]
    if source_field == "record.artistMakerPerson.name.text":
        return strings_from_path(record, ["record", "artistMakerPerson"], ("name", "text"))
    if source_field == "record.artistMakerPeople.name.text":
        return strings_from_path(record, ["record", "artistMakerPeople"], ("name", "text"))
    if source_field == "record.artistMakerOrganisations.name.text":
        return strings_from_path(record, ["record", "artistMakerOrganisations"], ("name", "text"))
    if source_field == "record.materials.text":
        return strings_from_path(record, ["record", "materials"], "text")
    if source_field == "record.techniques.text":
        return strings_from_path(record, ["record", "techniques"], "text")
    if source_field == "record.categories.text":
        return strings_from_path(record, ["record", "categories"], "text")
    if source_field == "record.styles.text":
        return strings_from_path(record, ["record", "styles"], "text")
    if source_field == "record.summaryDescription":
        return [nested_string(record, ["record", "summaryDescription"])]
    if source_field == "record.briefDescription":
        return [nested_string(record, ["record", "briefDescription"])]
    return []


def write_vam_raw_record(*, data_root: Path, record: dict[str, object]) -> Path:
    raw_record_path = provider_raw_record_path(
        data_root=data_root,
        provider=VAM_PROVIDER,
        object_id=vam_object_id(record),
    )
    raw_record_path.parent.mkdir(parents=True, exist_ok=True)
    raw_record_path.write_text(json.dumps(record, indent=2, sort_keys=True), encoding="utf-8")
    return raw_record_path


def record_vam_skipped_candidate(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    candidate: VamSkippedCandidate,
) -> None:
    record_local_skipped_candidate(
        connection=connection,
        candidate=LocalSkippedCandidate(
            run_id=run_id,
            provider=VAM_PROVIDER,
            object_id=candidate.object_id,
            reason=candidate.reason,
        ),
    )


def record_vam_skipped_image_reference(
    *,
    connection: sqlite3.Connection,
    reference: VamSkippedImageReference,
) -> None:
    record_local_skipped_image_reference(
        connection=connection,
        reference=LocalSkippedImageReference(
            provider=VAM_PROVIDER,
            object_id=reference.object_id,
            source_image_url=reference.source_image_url,
            image_role=reference.image_role,
            image_index=reference.image_index,
            reason=reference.reason,
        ),
    )


def vam_object_id(record: dict[str, object]) -> str:
    object_id = nested_string(record, ["record", "systemNumber"])
    if not object_id:
        object_id = string_value(record.get("systemNumber"))
    if not object_id:
        raise ValueError("V&A record is missing systemNumber.")
    return object_id


def vam_title(record: dict[str, object]) -> str:
    title = first_string(strings_from_path(record, ["record", "titles"], "title"))
    if title:
        return title
    title = string_value(record.get("_primaryTitle"))
    if title:
        return title
    return nested_string(record, ["record", "objectType"]) or vam_object_id(record)


def vam_artist_display_name(record: dict[str, object]) -> str:
    values = (
        strings_from_path(record, ["record", "artistMakerPerson"], ("name", "text"))
        + strings_from_path(record, ["record", "artistMakerPeople"], ("name", "text"))
        + strings_from_path(record, ["record", "artistMakerOrganisations"], ("name", "text"))
    )
    return ", ".join(values)


def vam_object_url(record: dict[str, object]) -> str:
    collection_page_url = nested_string(record, ["meta", "_links", "collection_page", "href"])
    if collection_page_url:
        return collection_page_url
    return f"{VAM_COLLECTION_PAGE_BASE_URL}/{vam_object_id(record)}/"


def vam_rights_statement(record: dict[str, object]) -> str:
    copyrights = sorted(
        {
            normalize_vam_copyright_text(copyright_text)
            for copyright_text in vam_image_copyright_by_asset_ref(record).values()
            if normalize_vam_copyright_text(copyright_text)
        }
    )
    if copyrights:
        return "; ".join(copyrights)
    return VAM_TERMS_NOTICE


def normalize_vam_copyright_text(value: str) -> str:
    text = " ".join(value.replace("\xa0", " ").split())
    text = text.replace("©Victoria", "© Victoria")
    text = text.replace(" & ", " and ")
    return text.strip()


def vam_iiif_source_image_url(asset_ref: str) -> str:
    return f"{VAM_IMAGE_BASE_URL}/{asset_ref}/full/full/0/default.jpg"


def nested_value(value: object, path: list[str]) -> object:
    current = value
    for path_item in path:
        if not isinstance(current, dict):
            return None
        current = current.get(path_item)
    return current


def nested_string(value: object, path: list[str]) -> str:
    return string_value(nested_value(value, path))


def string_value(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def first_string(values: list[str]) -> str:
    return next((value for value in values if value), "")


def string_list_from_path(value: object, path: list[str]) -> list[str]:
    items = nested_value(value, path)
    if not isinstance(items, list):
        return []
    return [item.strip() for item in items if isinstance(item, str) and item.strip()]


def strings_from_path(value: object, list_path: list[str], key_path: str | tuple[str, str]) -> list[str]:
    items = nested_value(value, list_path)
    if not isinstance(items, list):
        return []
    values: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if isinstance(key_path, str):
            text = string_value(item.get(key_path))
        else:
            text = nested_string(item, [key_path[0], key_path[1]])
        if text:
            values.append(text)
    return values
