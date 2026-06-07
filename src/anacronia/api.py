from pathlib import Path
import shutil
from typing import Annotated, Callable, Literal, Mapping, TypeVar

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from anacronia.collection_runs import (
    CandidateRun,
    DEFAULT_BATCH_TARGET,
    MetCandidateClient,
    discard_candidate_run,
    get_candidate_run,
)
from anacronia.curation import (
    CollectionCurationBusyError,
    CollectionDatabaseDeleteError,
    CollectionDeleteSummary,
    CollectionFileCleanupError,
    delete_collection_from_anacronia,
    delete_image_asset_from_anacronia,
    delete_object_from_anacronia,
    remove_image_asset_from_collection,
    remove_object_from_collection,
    set_image_asset_favorite,
    set_object_favorite,
)
from anacronia.collection_objects import (
    CollectionLocalResultSet,
    CollectionObjectDetail,
    CollectionObjectImage,
    CollectionObjectMatch,
    CollectionObjectMetadata,
    CollectionProviderFacet,
    CollectionObjectSkippedImageReference,
    CollectionObjectSummary,
    LibraryImageAssetCollection,
    LibraryImageAssetSummary,
    LibraryLocalResultSet,
    LibraryObjectSummary,
    get_collection_local_result_set as load_collection_local_result_set,
    get_library_local_result_set as load_library_local_result_set,
    get_collection_object_detail,
    get_library_object_detail,
    get_image_asset_derivative_path,
    list_collection_image_assets,
    list_library_image_assets,
    list_library_objects,
    list_collection_objects,
)
from anacronia.dashboard import OperationalDashboard, get_operational_dashboard
from anacronia.exports import (
    ExportFormat,
    CollectionExportResult,
    NoExportableAssetsError,
    export_collection,
    export_user_library,
)
from anacronia.met_ingest import (
    DEFAULT_MAX_IMAGES_PER_OBJECT,
    MetIngestSummary,
    MetRecordClient,
)
from anacronia.met_adapter import MetProviderAdapter
from anacronia.met_provider import HttpMetCandidateClient, fetch_bytes_url
from anacronia.provider_adapters import (
    OnlineProviderAdapter,
    ProviderIngestRequest,
    ProviderIngestSummary,
)
from anacronia.provider_identity import SourceObjectId
from anacronia.provider_identity import normalize_source_object_id
from anacronia.search_sets import (
    DuplicateSearchSetNameError,
    SearchSet,
    create_or_continue_search_set,
    get_search_set,
    list_search_sets,
    rename_search_set,
    slugify_search_set_name,
)
from anacronia.storage import initialize_storage
from anacronia.vam_adapter import VamProviderAdapter
from anacronia.vam_provider import HttpVamClient
from anacronia.worker import (
    CollectLockError,
    get_active_collect_job_for_search_set_provider,
    get_next_collect_candidate_offset_for_search_set_provider,
    get_worker_status,
    request_stop_collect_job,
    resume_collect_job,
    start_collect_job,
)


DEFAULT_CANDIDATE_LIMIT = 1000
MAX_GRID_PAGE_LIMIT = 500
IMAGE_DERIVATIVE_CACHE_CONTROL = "public, max-age=31536000, immutable"

GridPageLimit = Annotated[int | None, Query(ge=1, le=MAX_GRID_PAGE_LIMIT)]
GridPageOffset = Annotated[int, Query(ge=0)]
GridPagination = dict[str, int | bool | None]
T = TypeVar("T")
LocalResultSetView = Literal["objects", "images"]


def paginate_grid_items(
    items: list[T],
    *,
    limit: int | None,
    offset: int,
) -> tuple[list[T], GridPagination]:
    total = len(items)
    if limit is None:
        visible_items = items[offset:]
    else:
        visible_items = items[offset : offset + limit]

    return visible_items, {
        "total": total,
        "count": len(visible_items),
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(visible_items) < total,
    }
INTERNAL_CANDIDATE_LIMIT = 1_000_000_000
BatchTarget = Literal[5, 10, 20, 30, 100, 500, 1000]


class SearchSetRequest(BaseModel):
    display_name: str
    terms_text: str
    provider: str = "met"


class RenameSearchSetRequest(BaseModel):
    display_name: str


class DiscoverMetCandidatesRequest(BaseModel):
    candidate_offset: int = Field(default=0, ge=0)
    candidate_limit: int = Field(default=DEFAULT_CANDIDATE_LIMIT, ge=1)


class StartMetCollectRequest(BaseModel):
    batch_target: BatchTarget = DEFAULT_BATCH_TARGET


class CollectionExportObjectSelection(BaseModel):
    provider: str
    object_id: SourceObjectId | int


class CollectionExportSelection(BaseModel):
    image_asset_ids: list[int] = Field(default_factory=list)
    objects: list[CollectionExportObjectSelection] = Field(default_factory=list)


class CollectionExportRequest(BaseModel):
    format: ExportFormat
    selection: CollectionExportSelection | None = None


class CollectionCurationRequest(BaseModel):
    selection: CollectionExportSelection = Field(default_factory=CollectionExportSelection)


def serialize_search_set(search_set: SearchSet) -> dict[str, object]:
    return {
        "display_name": search_set.display_name,
        "slug": search_set.slug,
        "terms": [
            {
                "term": term.term,
                "active": term.active,
            }
            for term in search_set.terms
        ],
    }


def serialize_collection_delete_summary(
    summary: CollectionDeleteSummary,
) -> dict[str, object]:
    return {
        "collection_slug": summary.collection_slug,
        "deleted": summary.deleted,
        "deleted_objects": summary.deleted_objects,
        "deleted_image_assets": summary.deleted_image_assets,
        "preserved_shared_objects": summary.preserved_shared_objects,
        "preserved_shared_image_assets": summary.preserved_shared_image_assets,
        "preserved_favorite_objects": summary.preserved_favorite_objects,
        "preserved_favorite_image_assets": summary.preserved_favorite_image_assets,
    }


def serialize_candidate_run(run: CandidateRun) -> dict[str, object]:
    return {
        "run_id": run.run_id,
        "search_set_slug": run.search_set_slug,
        "provider": run.provider,
        "term_snapshot": run.term_snapshot,
        "candidate_offset": run.candidate_offset,
        "candidate_limit": run.candidate_limit,
        "batch_target": run.batch_target,
        "candidate_progress_total": run.candidate_progress_total,
        "status": run.status,
        "candidates": [
            {
                "object_id": normalize_source_object_id(candidate.object_id),
                "source_term": candidate.source_term,
                "source_term_index": candidate.source_term_index,
                "provider_position": candidate.provider_position,
                "run_position": candidate.run_position,
            }
            for candidate in run.candidates
        ],
    }


def serialize_provider_ingest_summary(summary: ProviderIngestSummary) -> dict[str, object]:
    return {
        "run_id": summary.run_id,
        "fetched_object_ids": [
            normalize_source_object_id(object_id)
            for object_id in summary.fetched_object_ids
        ],
        "imported_object_ids": [
            normalize_source_object_id(object_id)
            for object_id in summary.imported_object_ids
        ],
        "skipped_candidates": [
            {
                "object_id": normalize_source_object_id(skipped.object_id),
                "reason": skipped.reason,
            }
            for skipped in summary.skipped_candidates
        ],
    }


def serialize_met_ingest_summary(summary: MetIngestSummary) -> dict[str, object]:
    return serialize_provider_ingest_summary(summary)


def serialize_operational_dashboard(dashboard: OperationalDashboard) -> dict[str, object]:
    return {
        "worker_status": {
            "service": dashboard.worker_status.service,
            "status": dashboard.worker_status.status,
            "active_collect_job_id": dashboard.worker_status.active_collect_job_id,
        },
        "search_sets": [
            {
                "display_name": search_set.display_name,
                "slug": search_set.slug,
                "terms": [
                    {
                        "term": term.term,
                        "active": term.active,
                    }
                    for term in search_set.terms
                ],
                "provider_collections": [
                    {
                        "provider": provider_collection.provider,
                        "latest_run_id": provider_collection.latest_run_id,
                        "collect_status": provider_collection.collect_status,
                        "pause_reason": provider_collection.pause_reason,
                        "candidate_offset": provider_collection.candidate_offset,
                        "candidate_limit": provider_collection.candidate_limit,
                        "batch_target": provider_collection.batch_target,
                        "candidate_progress_processed": provider_collection.candidate_progress_processed,
                        "candidate_progress_total": provider_collection.candidate_progress_total,
                        "imported_object_count": provider_collection.imported_object_count,
                        "imported_image_count": provider_collection.imported_image_count,
                        "continue_candidate_offset": provider_collection.continue_candidate_offset,
                    }
                    for provider_collection in search_set.provider_collections
                ],
            }
            for search_set in dashboard.search_sets
        ],
        "provider_focus": [
            {
                "provider": provider.provider,
                "search_set_count": provider.search_set_count,
                "imported_image_count": provider.imported_image_count,
            }
            for provider in dashboard.provider_focus
        ],
    }


def serialize_collection_object_summary(
    collection_object: CollectionObjectSummary,
) -> dict[str, object]:
    return {
        "provider": collection_object.provider,
        "object_id": normalize_source_object_id(collection_object.object_id),
        "title": collection_object.title,
        "object_name": collection_object.object_name,
        "artist_display_name": collection_object.artist_display_name,
        "image_count": collection_object.image_count,
        "cover_image_asset_id": collection_object.cover_image_asset_id,
        "cover_original_width": collection_object.cover_original_width,
        "cover_original_height": collection_object.cover_original_height,
        "cover_thumb_url": f"/image-assets/{collection_object.cover_image_asset_id}/thumb",
        "has_sibling_images": collection_object.image_count > 1,
        "is_favorite": collection_object.is_favorite,
    }


def serialize_collection_object_metadata(
    collection_object: CollectionObjectMetadata,
) -> dict[str, object]:
    return {
        "provider": collection_object.provider,
        "object_id": normalize_source_object_id(collection_object.object_id),
        "title": collection_object.title,
        "object_name": collection_object.object_name,
        "artist_display_name": collection_object.artist_display_name,
        "artist_display_bio": collection_object.artist_display_bio,
        "artist_nationality": collection_object.artist_nationality,
        "department": collection_object.department,
        "object_date": collection_object.object_date,
        "medium": collection_object.medium,
        "dimensions": collection_object.dimensions,
        "classification": collection_object.classification,
        "credit_line": collection_object.credit_line,
        "accession_number": collection_object.accession_number,
        "repository": collection_object.repository,
        "tags": collection_object.tags,
        "object_url": collection_object.object_url,
        "is_public_domain": collection_object.is_public_domain,
        "rights_and_reproduction": collection_object.rights_and_reproduction,
        "metadata_date": collection_object.metadata_date,
        "is_favorite": collection_object.is_favorite,
    }


def serialize_collection_object_image(image: CollectionObjectImage) -> dict[str, object]:
    return {
        "image_asset_id": image.image_asset_id,
        "source_image_url": image.source_image_url,
        "image_role": image.image_role,
        "image_index": image.image_index,
        "original_width": image.original_width,
        "original_height": image.original_height,
        "thumb_url": f"/image-assets/{image.image_asset_id}/thumb",
        "standard_url": f"/image-assets/{image.image_asset_id}/standard",
        "is_favorite": image.is_favorite,
    }


def serialize_collection_object_match(match: CollectionObjectMatch) -> dict[str, object]:
    return {
        "search_term": match.search_term,
        "verified": match.verified,
        "matched_fields": match.matched_fields,
    }


def serialize_collection_object_skipped_image_reference(
    reference: CollectionObjectSkippedImageReference,
) -> dict[str, object]:
    return {
        "source_image_url": reference.source_image_url,
        "image_role": reference.image_role,
        "image_index": reference.image_index,
        "reason": reference.reason,
    }


def serialize_library_image_asset_collection(
    collection: LibraryImageAssetCollection,
) -> dict[str, object]:
    return {
        "slug": collection.slug,
        "display_name": collection.display_name,
    }


def serialize_library_object_summary(
    library_object: LibraryObjectSummary,
) -> dict[str, object]:
    return {
        "provider": library_object.provider,
        "object_id": normalize_source_object_id(library_object.object_id),
        "title": library_object.title,
        "object_name": library_object.object_name,
        "artist_display_name": library_object.artist_display_name,
        "image_count": library_object.image_count,
        "cover_image_asset_id": library_object.cover_image_asset_id,
        "cover_original_width": library_object.cover_original_width,
        "cover_original_height": library_object.cover_original_height,
        "cover_thumb_url": f"/image-assets/{library_object.cover_image_asset_id}/thumb",
        "has_sibling_images": library_object.image_count > 1,
        "is_favorite": library_object.is_favorite,
        "collections": [
            serialize_library_image_asset_collection(collection)
            for collection in library_object.collections
        ],
    }


def serialize_library_image_asset_summary(
    image_asset: LibraryImageAssetSummary,
) -> dict[str, object]:
    return {
        "image_asset_id": image_asset.image_asset_id,
        "provider": image_asset.provider,
        "object_id": normalize_source_object_id(image_asset.object_id),
        "title": image_asset.title,
        "object_name": image_asset.object_name,
        "artist_display_name": image_asset.artist_display_name,
        "image_role": image_asset.image_role,
        "image_index": image_asset.image_index,
        "original_width": image_asset.original_width,
        "original_height": image_asset.original_height,
        "image_count": image_asset.image_count,
        "has_sibling_images": image_asset.image_count > 1,
        "thumb_url": f"/image-assets/{image_asset.image_asset_id}/thumb",
        "standard_url": f"/image-assets/{image_asset.image_asset_id}/standard",
        "is_favorite": image_asset.is_favorite,
        "collections": [
            serialize_library_image_asset_collection(collection)
            for collection in image_asset.collections
        ],
    }


def serialize_collection_provider_facet(facet: CollectionProviderFacet) -> dict[str, object]:
    return {
        "provider": facet.provider,
        "object_count": facet.object_count,
        "image_count": facet.image_count,
    }


def serialize_collection_local_result_set(
    result_set: CollectionLocalResultSet,
    *,
    objects: list[CollectionObjectSummary],
    image_assets: list[LibraryImageAssetSummary],
    pagination: GridPagination,
) -> dict[str, object]:
    return {
        "query": result_set.query,
        "provider": result_set.provider,
        "view": result_set.view,
        "counts": {
            "objects": result_set.counts.objects,
            "images": result_set.counts.images,
        },
        "provider_facets": [
            serialize_collection_provider_facet(facet)
            for facet in result_set.provider_facets
        ],
        "objects": [
            serialize_collection_object_summary(collection_object)
            for collection_object in objects
        ],
        "image_assets": [
            serialize_library_image_asset_summary(image_asset)
            for image_asset in image_assets
        ],
        "pagination": pagination,
    }


def serialize_library_local_result_set(
    result_set: LibraryLocalResultSet,
    *,
    objects: list[LibraryObjectSummary],
    image_assets: list[LibraryImageAssetSummary],
    pagination: GridPagination,
) -> dict[str, object]:
    return {
        "query": result_set.query,
        "provider": result_set.provider,
        "view": result_set.view,
        "counts": {
            "objects": result_set.counts.objects,
            "images": result_set.counts.images,
        },
        "provider_facets": [
            serialize_collection_provider_facet(facet)
            for facet in result_set.provider_facets
        ],
        "objects": [
            serialize_library_object_summary(library_object)
            for library_object in objects
        ],
        "image_assets": [
            serialize_library_image_asset_summary(image_asset)
            for image_asset in image_assets
        ],
        "pagination": pagination,
    }


def serialize_collection_object_detail(
    detail: CollectionObjectDetail,
) -> dict[str, object]:
    return {
        "object": serialize_collection_object_metadata(detail.object),
        "images": [
            serialize_collection_object_image(image)
            for image in detail.images
        ],
        "matches": [
            serialize_collection_object_match(match)
            for match in detail.matches
        ],
        "skipped_image_references": [
            serialize_collection_object_skipped_image_reference(reference)
            for reference in detail.skipped_image_references
        ],
    }


def serialize_collection_export_result(result: CollectionExportResult) -> dict[str, object]:
    return {
        "format": result.export_format,
        "export_path": str(result.export_path.resolve()),
        "row_count": result.row_count,
        "skipped_image_asset_count": result.skipped_image_asset_count,
        "skipped_image_assets": [
            {
                "image_asset_id": skipped.image_asset_id,
                "provider": skipped.provider,
                "object_id": normalize_source_object_id(skipped.object_id),
                "source_image_url": skipped.source_image_url,
                "reason": skipped.reason,
            }
            for skipped in result.skipped_image_assets
        ],
    }


def ensure_collection_can_export(dashboard: OperationalDashboard, slug: str) -> None:
    search_set = next(
        (search_set for search_set in dashboard.search_sets if search_set.slug == slug),
        None,
    )
    if search_set is None:
        raise HTTPException(status_code=404, detail="Collection not found.")

    if any(
        provider_collection.collect_status in {"running", "stopping"}
        for provider_collection in search_set.provider_collections
    ):
        raise HTTPException(
            status_code=409,
            detail="Collection export is unavailable while a Provider Search is active.",
        )

    if sum(
        provider_collection.imported_image_count
        for provider_collection in search_set.provider_collections
    ) == 0:
        raise HTTPException(
            status_code=409,
            detail="Collection has no Image Assets to export.",
        )


def create_app(
    *,
    database_path: Path | None = None,
    data_root: Path | None = None,
    met_candidate_client: MetCandidateClient | None = None,
    met_record_client: MetRecordClient | None = None,
    download_image_bytes: Callable[[str], bytes] | None = None,
    provider_adapters: Mapping[str, OnlineProviderAdapter] | None = None,
) -> FastAPI:
    app = FastAPI(title="Anacronia")
    project_root = Path(__file__).resolve().parents[2]
    if database_path is None:
        storage = initialize_storage(project_root=project_root, data_root=data_root)
        resolved_database_path = storage.database_path
        resolved_data_root = storage.data_root
    else:
        resolved_database_path = database_path
        resolved_data_root = data_root if data_root is not None else database_path.parent
        resolved_data_root.mkdir(parents=True, exist_ok=True)
    resolved_met_candidate_client = met_candidate_client or HttpMetCandidateClient()
    resolved_met_record_client = met_record_client or HttpMetCandidateClient()
    resolved_download_image_bytes = download_image_bytes or fetch_bytes_url
    default_met_adapter = MetProviderAdapter(
        candidate_client=resolved_met_candidate_client,
        record_client=resolved_met_record_client,
        download_image_bytes=resolved_download_image_bytes,
    )
    default_vam_adapter = VamProviderAdapter(
        vam_client=HttpVamClient(),
        download_image_bytes=resolved_download_image_bytes,
    )
    resolved_provider_adapters = {
        "met": default_met_adapter,
        "vam": default_vam_adapter,
        **(provider_adapters or {}),
    }

    def get_online_provider_adapter(provider: str) -> OnlineProviderAdapter:
        provider_key = provider.strip()
        adapter = resolved_provider_adapters.get(provider_key)
        if adapter is None:
            raise HTTPException(
                status_code=404,
                detail=f"Provider is not configured: {provider_key}",
            )
        return adapter

    @app.get("/health")
    def health() -> dict[str, object]:
        worker_status = get_worker_status(database_path=resolved_database_path)
        return {
            "service": "api",
            "status": "ok",
            "worker": {
                "service": worker_status.service,
                "status": worker_status.status,
                "active_collect_job_id": worker_status.active_collect_job_id,
            },
        }

    @app.post("/search-sets")
    def create_search_set(request: SearchSetRequest) -> dict[str, object]:
        if get_worker_status(database_path=resolved_database_path).active_collect_job_id is not None:
            raise HTTPException(status_code=409, detail="Another search is already active.")
        provider_key = request.provider.strip()
        if not provider_key:
            provider_key = "met"
        if provider_key not in resolved_provider_adapters:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported Provider: {provider_key}",
            )

        slug = slugify_search_set_name(request.display_name)
        if slug:
            try:
                get_search_set(database_path=resolved_database_path, slug=slug)
            except LookupError:
                pass
            else:
                raise HTTPException(
                    status_code=409,
                    detail="A Collection with this name already exists.",
                )

        try:
            search_set = create_or_continue_search_set(
                database_path=resolved_database_path,
                display_name=request.display_name,
                terms_text=request.terms_text,
                provider=provider_key,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return serialize_search_set(search_set)

    @app.get("/search-sets")
    def get_search_sets() -> list[dict[str, object]]:
        return [serialize_search_set(search_set) for search_set in list_search_sets(database_path=resolved_database_path)]

    @app.patch("/search-sets/{slug}")
    def rename_collection(slug: str, request: RenameSearchSetRequest) -> dict[str, object]:
        try:
            search_set = rename_search_set(
                database_path=resolved_database_path,
                slug=slug,
                display_name=request.display_name,
            )
        except DuplicateSearchSetNameError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except LookupError as error:
            raise HTTPException(status_code=404, detail="Collection not found.") from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return serialize_search_set(search_set)

    @app.delete("/search-sets/{slug}")
    def delete_collection(slug: str) -> dict[str, object]:
        try:
            summary = delete_collection_from_anacronia(
                database_path=resolved_database_path,
                search_set_slug=slug,
            )
        except CollectionCurationBusyError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except CollectionDatabaseDeleteError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except CollectionFileCleanupError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        if not summary.deleted:
            raise HTTPException(status_code=404, detail="Collection not found.")
        return serialize_collection_delete_summary(summary)

    @app.get("/dashboard")
    def get_dashboard() -> dict[str, object]:
        dashboard = get_operational_dashboard(database_path=resolved_database_path)
        return serialize_operational_dashboard(dashboard)

    @app.get("/library/local-result-set")
    def get_library_local_result_set(
        q: str = "",
        provider: str = "all",
        view: LocalResultSetView = "images",
        favorite: bool = False,
        collection: str = "all",
        limit: GridPageLimit = None,
        offset: GridPageOffset = 0,
    ) -> dict[str, object]:
        result_set = load_library_local_result_set(
            database_path=resolved_database_path,
            query_text=q,
            provider=provider,
            view=view,
            favorite_only=favorite,
            collection=collection,
        )
        if view == "objects":
            objects, pagination = paginate_grid_items(
                result_set.objects,
                limit=limit,
                offset=offset,
            )
            image_assets: list[LibraryImageAssetSummary] = []
        else:
            image_assets, pagination = paginate_grid_items(
                result_set.image_assets,
                limit=limit,
                offset=offset,
            )
            objects = []

        return serialize_library_local_result_set(
            result_set,
            objects=objects,
            image_assets=image_assets,
            pagination=pagination,
        )

    @app.get("/library/image-assets")
    def get_library_image_assets(
        filter: str = "",
        favorite: bool = False,
        collection: str = "all",
        limit: GridPageLimit = None,
        offset: GridPageOffset = 0,
    ) -> dict[str, object]:
        image_assets, pagination = paginate_grid_items(
            list_library_image_assets(
                database_path=resolved_database_path,
                filter_text=filter,
                favorite_only=favorite,
                collection=collection,
            ),
            limit=limit,
            offset=offset,
        )
        return {
            "image_assets": [
                serialize_library_image_asset_summary(image_asset)
                for image_asset in image_assets
            ],
            "pagination": pagination,
        }

    @app.get("/library/objects")
    def get_library_objects(
        filter: str = "",
        favorite: bool = False,
        collection: str = "all",
        limit: GridPageLimit = None,
        offset: GridPageOffset = 0,
    ) -> dict[str, object]:
        library_objects, pagination = paginate_grid_items(
            list_library_objects(
                database_path=resolved_database_path,
                filter_text=filter,
                favorite_only=favorite,
                collection=collection,
            ),
            limit=limit,
            offset=offset,
        )
        return {
            "objects": [
                serialize_library_object_summary(library_object)
                for library_object in library_objects
            ],
            "pagination": pagination,
        }

    @app.get("/library/objects/{provider}/{object_id}")
    def get_library_object(provider: str, object_id: SourceObjectId) -> dict[str, object]:
        detail = get_library_object_detail(
            database_path=resolved_database_path,
            provider=provider,
            object_id=object_id,
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="Library object not found.")
        return serialize_collection_object_detail(detail)

    @app.put("/objects/{provider}/{object_id}/favorite")
    def favorite_object(provider: str, object_id: SourceObjectId) -> dict[str, object]:
        set_object_favorite(
            database_path=resolved_database_path,
            provider=provider,
            object_id=object_id,
            is_favorite=True,
        )
        return {
            "provider": provider,
            "object_id": object_id,
            "is_favorite": True,
        }

    @app.delete("/objects/{provider}/{object_id}/favorite")
    def unfavorite_object(provider: str, object_id: SourceObjectId) -> dict[str, object]:
        set_object_favorite(
            database_path=resolved_database_path,
            provider=provider,
            object_id=object_id,
            is_favorite=False,
        )
        return {
            "provider": provider,
            "object_id": object_id,
            "is_favorite": False,
        }

    @app.get("/search-sets/{slug}/objects")
    def get_collection_objects(
        slug: str,
        favorite: bool = False,
        limit: GridPageLimit = None,
        offset: GridPageOffset = 0,
    ) -> dict[str, object]:
        collection_objects, pagination = paginate_grid_items(
            list_collection_objects(
                database_path=resolved_database_path,
                search_set_slug=slug,
                favorite_only=favorite,
            ),
            limit=limit,
            offset=offset,
        )
        return {
            "objects": [
                serialize_collection_object_summary(collection_object)
                for collection_object in collection_objects
            ],
            "pagination": pagination,
        }

    @app.get("/search-sets/{slug}/local-result-set")
    def get_collection_local_result_set(
        slug: str,
        q: str = "",
        provider: str = "all",
        view: LocalResultSetView = "objects",
        favorite: bool = False,
        limit: GridPageLimit = None,
        offset: GridPageOffset = 0,
    ) -> dict[str, object]:
        result_set = load_collection_local_result_set(
            database_path=resolved_database_path,
            search_set_slug=slug,
            query_text=q,
            provider=provider,
            view=view,
            favorite_only=favorite,
        )
        if view == "objects":
            objects, pagination = paginate_grid_items(
                result_set.objects,
                limit=limit,
                offset=offset,
            )
            image_assets: list[LibraryImageAssetSummary] = []
        else:
            image_assets, pagination = paginate_grid_items(
                result_set.image_assets,
                limit=limit,
                offset=offset,
            )
            objects = []

        return serialize_collection_local_result_set(
            result_set,
            objects=objects,
            image_assets=image_assets,
            pagination=pagination,
        )

    @app.get("/search-sets/{slug}/image-assets")
    def get_collection_image_assets(
        slug: str,
        favorite: bool = False,
        limit: GridPageLimit = None,
        offset: GridPageOffset = 0,
    ) -> dict[str, object]:
        image_assets, pagination = paginate_grid_items(
            list_collection_image_assets(
                database_path=resolved_database_path,
                search_set_slug=slug,
                favorite_only=favorite,
            ),
            limit=limit,
            offset=offset,
        )
        return {
            "image_assets": [
                serialize_library_image_asset_summary(image_asset)
                for image_asset in image_assets
            ],
            "pagination": pagination,
        }

    @app.get("/search-sets/{slug}/objects/{provider}/{object_id}")
    def get_collection_object(
        slug: str,
        provider: str,
        object_id: SourceObjectId,
    ) -> dict[str, object]:
        detail = get_collection_object_detail(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider=provider,
            object_id=object_id,
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="Collection object not found.")
        return serialize_collection_object_detail(detail)

    @app.post("/search-sets/{slug}/remove-from-collection")
    def remove_selection_from_collection(
        slug: str,
        request: CollectionCurationRequest,
    ) -> dict[str, object]:
        try:
            removed_objects = sum(
                1
                for selected_object in request.selection.objects
                if remove_object_from_collection(
                    database_path=resolved_database_path,
                    search_set_slug=slug,
                    provider=selected_object.provider,
                    object_id=selected_object.object_id,
                )
            )
            removed_image_assets = sum(
                1
                for image_asset_id in request.selection.image_asset_ids
                if remove_image_asset_from_collection(
                    database_path=resolved_database_path,
                    search_set_slug=slug,
                    image_asset_id=image_asset_id,
                )
            )
        except CollectionCurationBusyError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except CollectionFileCleanupError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

        return {
            "removed_objects": removed_objects,
            "removed_image_assets": removed_image_assets,
        }

    @app.post("/search-sets/{slug}/exports")
    def export_search_set(slug: str, request: CollectionExportRequest) -> dict[str, object]:
        ensure_collection_can_export(
            dashboard=get_operational_dashboard(database_path=resolved_database_path),
            slug=slug,
        )
        selected_image_asset_ids = (
            request.selection.image_asset_ids if request.selection is not None else None
        )
        selected_objects = (
            [
                (selected_object.provider, selected_object.object_id)
                for selected_object in request.selection.objects
            ]
            if request.selection is not None
            else None
        )
        try:
            result = export_collection(
                database_path=resolved_database_path,
                data_root=resolved_data_root,
                search_set_slug=slug,
                export_format=request.format,
                selected_image_asset_ids=selected_image_asset_ids,
                selected_objects=selected_objects,
            )
        except NoExportableAssetsError as error:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Collection has no exportable Image Assets.",
                    "skipped_image_asset_count": len(error.skipped_image_assets),
                    "skipped_image_assets": [
                        {
                            "image_asset_id": skipped.image_asset_id,
                            "provider": skipped.provider,
                            "object_id": normalize_source_object_id(skipped.object_id),
                            "source_image_url": skipped.source_image_url,
                            "reason": skipped.reason,
                        }
                        for skipped in error.skipped_image_assets
                    ],
                },
            ) from error
        return serialize_collection_export_result(result)

    @app.post("/library/exports")
    def export_library(request: CollectionExportRequest) -> dict[str, object]:
        dashboard = get_operational_dashboard(database_path=resolved_database_path)
        if dashboard.worker_status.active_collect_job_id is not None:
            raise HTTPException(
                status_code=409,
                detail="User Library export is unavailable while a Provider Search is active.",
            )
        selected_image_asset_ids = (
            request.selection.image_asset_ids if request.selection is not None else None
        )
        selected_objects = (
            [
                (selected_object.provider, selected_object.object_id)
                for selected_object in request.selection.objects
            ]
            if request.selection is not None
            else None
        )
        try:
            result = export_user_library(
                database_path=resolved_database_path,
                data_root=resolved_data_root,
                export_format=request.format,
                selected_image_asset_ids=selected_image_asset_ids,
                selected_objects=selected_objects,
            )
        except NoExportableAssetsError as error:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "User Library has no exportable Image Assets.",
                    "skipped_image_asset_count": len(error.skipped_image_assets),
                    "skipped_image_assets": [
                        {
                            "image_asset_id": skipped.image_asset_id,
                            "provider": skipped.provider,
                            "object_id": normalize_source_object_id(skipped.object_id),
                            "source_image_url": skipped.source_image_url,
                            "reason": skipped.reason,
                        }
                        for skipped in error.skipped_image_assets
                    ],
                },
            ) from error
        return serialize_collection_export_result(result)

    @app.put("/image-assets/{image_asset_id}/favorite")
    def favorite_image_asset(image_asset_id: int) -> dict[str, object]:
        is_favorite = set_image_asset_favorite(
            database_path=resolved_database_path,
            image_asset_id=image_asset_id,
            is_favorite=True,
        )
        if is_favorite is None:
            raise HTTPException(status_code=404, detail="Image Asset not found.")
        return {
            "image_asset_id": image_asset_id,
            "is_favorite": True,
        }

    @app.delete("/image-assets/{image_asset_id}/favorite")
    def unfavorite_image_asset(image_asset_id: int) -> dict[str, object]:
        is_favorite = set_image_asset_favorite(
            database_path=resolved_database_path,
            image_asset_id=image_asset_id,
            is_favorite=False,
        )
        if is_favorite is None:
            raise HTTPException(status_code=404, detail="Image Asset not found.")
        return {
            "image_asset_id": image_asset_id,
            "is_favorite": False,
        }

    @app.post("/curation/delete")
    def delete_selection_from_anacronia(
        request: CollectionCurationRequest,
    ) -> dict[str, object]:
        try:
            deleted_objects = sum(
                1
                for selected_object in request.selection.objects
                if delete_object_from_anacronia(
                    database_path=resolved_database_path,
                    provider=selected_object.provider,
                    object_id=selected_object.object_id,
                )
            )
            deleted_image_assets = sum(
                1
                for image_asset_id in request.selection.image_asset_ids
                if delete_image_asset_from_anacronia(
                    database_path=resolved_database_path,
                    image_asset_id=image_asset_id,
                )
            )
        except CollectionCurationBusyError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except CollectionFileCleanupError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

        return {
            "deleted_objects": deleted_objects,
            "deleted_image_assets": deleted_image_assets,
        }

    @app.get("/image-assets/{image_asset_id}/{derivative}")
    def get_image_asset_derivative(image_asset_id: int, derivative: str) -> FileResponse:
        path = get_image_asset_derivative_path(
            database_path=resolved_database_path,
            image_asset_id=image_asset_id,
            derivative=derivative,
        )
        if path is None:
            raise HTTPException(status_code=404, detail="Image Asset derivative not found.")

        resolved_path = path.resolve()
        resolved_root = resolved_data_root.resolve()
        if not resolved_path.is_relative_to(resolved_root) or not resolved_path.is_file():
            raise HTTPException(status_code=404, detail="Image Asset derivative not found.")

        return FileResponse(
            resolved_path,
            headers={"Cache-Control": IMAGE_DERIVATIVE_CACHE_CONTROL},
            media_type="image/jpeg",
        )

    @app.post("/search-sets/{slug}/provider-collections/{provider}/runs")
    def discover_provider_candidate_run(
        slug: str,
        provider: str,
        request: DiscoverMetCandidatesRequest,
    ) -> dict[str, object]:
        adapter = get_online_provider_adapter(provider)
        run = adapter.discover_candidate_run(
            database_path=resolved_database_path,
            search_set_slug=slug,
            candidate_offset=request.candidate_offset,
            candidate_limit=request.candidate_limit,
            batch_target=DEFAULT_BATCH_TARGET,
        )
        return serialize_candidate_run(run)

    @app.post("/search-sets/{slug}/provider-collections/{provider}/collects")
    def start_provider_collect(
        slug: str,
        provider: str,
        request: StartMetCollectRequest,
    ) -> dict[str, object]:
        adapter = get_online_provider_adapter(provider)
        if get_worker_status(database_path=resolved_database_path).active_collect_job_id is not None:
            raise HTTPException(status_code=409, detail="Another search is already active.")
        existing_collect_job = get_active_collect_job_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider=adapter.provider,
        )
        if existing_collect_job is not None and existing_collect_job.status == "paused":
            raise HTTPException(
                status_code=409,
                detail=f"Paused {adapter.display_name} search can be resumed.",
            )

        candidate_offset = get_next_collect_candidate_offset_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider=adapter.provider,
        )
        if candidate_offset is None:
            raise HTTPException(
                status_code=409,
                detail=f"{adapter.display_name} has no more results for this Collection.",
            )

        run = adapter.discover_candidate_run(
            database_path=resolved_database_path,
            search_set_slug=slug,
            candidate_offset=candidate_offset,
            candidate_limit=INTERNAL_CANDIDATE_LIMIT,
            batch_target=request.batch_target,
        )
        try:
            collect_job = start_collect_job(
                database_path=resolved_database_path,
                run_id=run.run_id,
                candidate_offset=run.candidate_offset,
                candidate_limit=run.candidate_limit,
                candidate_progress_total=run.candidate_progress_total,
                batch_target=run.batch_target,
                max_images_per_object=DEFAULT_MAX_IMAGES_PER_OBJECT,
                available_disk_bytes=shutil.disk_usage(resolved_data_root).free,
            )
        except CollectLockError as error:
            discard_candidate_run(database_path=resolved_database_path, run_id=run.run_id)
            raise HTTPException(status_code=409, detail="Another search is already active.") from error

        return {
            "run_id": run.run_id,
            "collect_job_id": collect_job.job_id,
            "status": collect_job.status,
            "batch_target": collect_job.batch_target,
        }

    @app.post("/search-sets/{slug}/provider-collections/{provider}/collects/stop")
    def stop_provider_collect(slug: str, provider: str) -> dict[str, object]:
        adapter = get_online_provider_adapter(provider)
        collect_job = get_active_collect_job_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider=adapter.provider,
        )
        if collect_job is None or collect_job.status != "running":
            raise HTTPException(
                status_code=409,
                detail=f"No running {adapter.display_name} search can be stopped.",
            )

        stopped_job = request_stop_collect_job(
            database_path=resolved_database_path,
            job_id=collect_job.job_id,
        )
        return {
            "collect_job_id": stopped_job.job_id,
            "status": stopped_job.status,
        }

    @app.post("/search-sets/{slug}/provider-collections/{provider}/collects/resume")
    def resume_provider_collect(
        slug: str,
        provider: str,
        request: StartMetCollectRequest,
    ) -> dict[str, object]:
        adapter = get_online_provider_adapter(provider)
        collect_job = get_active_collect_job_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider=adapter.provider,
        )
        if collect_job is None or collect_job.status != "paused":
            raise HTTPException(
                status_code=409,
                detail=f"No paused {adapter.display_name} search can be resumed.",
            )

        try:
            resumed_job = resume_collect_job(
                database_path=resolved_database_path,
                job_id=collect_job.job_id,
                batch_target=request.batch_target,
            )
        except CollectLockError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return {
            "collect_job_id": resumed_job.job_id,
            "status": resumed_job.status,
            "batch_target": resumed_job.batch_target,
        }

    @app.post("/provider-collections/{provider}/runs/{run_id}/ingest")
    def ingest_provider_candidate_run(provider: str, run_id: int) -> dict[str, object]:
        adapter = get_online_provider_adapter(provider)
        run = get_candidate_run(database_path=resolved_database_path, run_id=run_id)
        if run.provider != adapter.provider:
            raise HTTPException(status_code=409, detail="Run belongs to another Provider.")

        summary = adapter.ingest_run(
            ProviderIngestRequest(
                database_path=resolved_database_path,
                data_root=resolved_data_root,
                run_id=run_id,
                max_images_per_object=DEFAULT_MAX_IMAGES_PER_OBJECT,
            )
        )
        return serialize_provider_ingest_summary(summary)

    return app
