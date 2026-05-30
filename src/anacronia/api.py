from pathlib import Path
import shutil
from typing import Callable, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from anacronia.collection_runs import (
    CandidateRun,
    DEFAULT_BATCH_TARGET,
    MetCandidateClient,
    discover_met_candidates,
)
from anacronia.collection_objects import (
    CollectionObjectDetail,
    CollectionObjectImage,
    CollectionObjectMatch,
    CollectionObjectMetadata,
    CollectionObjectSkippedImageReference,
    CollectionObjectSummary,
    get_collection_object_detail,
    get_image_asset_derivative_path,
    list_collection_objects,
)
from anacronia.dashboard import OperationalDashboard, get_operational_dashboard
from anacronia.exports import (
    ExportFormat,
    CollectionExportResult,
    NoExportableAssetsError,
    export_collection,
)
from anacronia.met_ingest import (
    DEFAULT_MAX_IMAGES_PER_OBJECT,
    MetIngestSummary,
    MetRecordClient,
    ingest_met_run,
)
from anacronia.met_provider import HttpMetCandidateClient, fetch_bytes_url
from anacronia.search_sets import (
    SearchSet,
    create_or_continue_search_set,
    list_search_sets,
)
from anacronia.storage import initialize_storage
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
INTERNAL_CANDIDATE_LIMIT = 1_000_000_000
BatchTarget = Literal[5, 10, 20, 30, 100, 500, 1000]


class SearchSetRequest(BaseModel):
    display_name: str
    terms_text: str


class DiscoverMetCandidatesRequest(BaseModel):
    candidate_offset: int = Field(default=0, ge=0)
    candidate_limit: int = Field(default=DEFAULT_CANDIDATE_LIMIT, ge=1)


class StartMetCollectRequest(BaseModel):
    batch_target: BatchTarget = DEFAULT_BATCH_TARGET


class CollectionExportRequest(BaseModel):
    format: ExportFormat


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
                "object_id": candidate.object_id,
                "source_term": candidate.source_term,
                "source_term_index": candidate.source_term_index,
                "provider_position": candidate.provider_position,
                "run_position": candidate.run_position,
            }
            for candidate in run.candidates
        ],
    }


def serialize_met_ingest_summary(summary: MetIngestSummary) -> dict[str, object]:
    return {
        "run_id": summary.run_id,
        "fetched_object_ids": summary.fetched_object_ids,
        "imported_object_ids": summary.imported_object_ids,
        "skipped_candidates": [
            {
                "object_id": skipped.object_id,
                "reason": skipped.reason,
            }
            for skipped in summary.skipped_candidates
        ],
    }


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
        "object_id": collection_object.object_id,
        "title": collection_object.title,
        "object_name": collection_object.object_name,
        "artist_display_name": collection_object.artist_display_name,
        "image_count": collection_object.image_count,
        "cover_image_asset_id": collection_object.cover_image_asset_id,
        "cover_thumb_url": f"/image-assets/{collection_object.cover_image_asset_id}/thumb",
        "has_sibling_images": collection_object.image_count > 1,
    }


def serialize_collection_object_metadata(
    collection_object: CollectionObjectMetadata,
) -> dict[str, object]:
    return {
        "provider": collection_object.provider,
        "object_id": collection_object.object_id,
        "title": collection_object.title,
        "object_name": collection_object.object_name,
        "artist_display_name": collection_object.artist_display_name,
        "object_url": collection_object.object_url,
        "rights_and_reproduction": collection_object.rights_and_reproduction,
        "metadata_date": collection_object.metadata_date,
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
                "object_id": skipped.object_id,
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
        try:
            search_set = create_or_continue_search_set(
                database_path=resolved_database_path,
                display_name=request.display_name,
                terms_text=request.terms_text,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return serialize_search_set(search_set)

    @app.get("/search-sets")
    def get_search_sets() -> list[dict[str, object]]:
        return [serialize_search_set(search_set) for search_set in list_search_sets(database_path=resolved_database_path)]

    @app.get("/dashboard")
    def get_dashboard() -> dict[str, object]:
        dashboard = get_operational_dashboard(database_path=resolved_database_path)
        return serialize_operational_dashboard(dashboard)

    @app.get("/search-sets/{slug}/objects")
    def get_collection_objects(slug: str) -> dict[str, object]:
        return {
            "objects": [
                serialize_collection_object_summary(collection_object)
                for collection_object in list_collection_objects(
                    database_path=resolved_database_path,
                    search_set_slug=slug,
                )
            ]
        }

    @app.get("/search-sets/{slug}/objects/{provider}/{object_id}")
    def get_collection_object(slug: str, provider: str, object_id: int) -> dict[str, object]:
        detail = get_collection_object_detail(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider=provider,
            object_id=object_id,
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="Collection object not found.")
        return serialize_collection_object_detail(detail)

    @app.post("/search-sets/{slug}/exports")
    def export_search_set(slug: str, request: CollectionExportRequest) -> dict[str, object]:
        ensure_collection_can_export(
            dashboard=get_operational_dashboard(database_path=resolved_database_path),
            slug=slug,
        )
        try:
            result = export_collection(
                database_path=resolved_database_path,
                data_root=resolved_data_root,
                search_set_slug=slug,
                export_format=request.format,
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
                            "object_id": skipped.object_id,
                            "source_image_url": skipped.source_image_url,
                            "reason": skipped.reason,
                        }
                        for skipped in error.skipped_image_assets
                    ],
                },
            ) from error
        return serialize_collection_export_result(result)

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

        return FileResponse(resolved_path, media_type="image/jpeg")

    @app.post("/search-sets/{slug}/provider-collections/met/runs")
    def discover_met_candidate_run(
        slug: str,
        request: DiscoverMetCandidatesRequest,
    ) -> dict[str, object]:
        run = discover_met_candidates(
            database_path=resolved_database_path,
            search_set_slug=slug,
            candidate_offset=request.candidate_offset,
            candidate_limit=request.candidate_limit,
            met_client=resolved_met_candidate_client,
        )
        return serialize_candidate_run(run)

    @app.post("/search-sets/{slug}/provider-collections/met/collects")
    def start_met_collect(
        slug: str,
        request: StartMetCollectRequest,
    ) -> dict[str, object]:
        if get_worker_status(database_path=resolved_database_path).active_collect_job_id is not None:
            raise HTTPException(status_code=409, detail="Another search is already active.")
        existing_collect_job = get_active_collect_job_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider="met",
        )
        if existing_collect_job is not None and existing_collect_job.status == "paused":
            raise HTTPException(status_code=409, detail="Paused Met search can be resumed.")

        candidate_offset = get_next_collect_candidate_offset_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider="met",
        )
        if candidate_offset is None:
            raise HTTPException(status_code=409, detail="Met has no more results for this Collection.")

        run = discover_met_candidates(
            database_path=resolved_database_path,
            search_set_slug=slug,
            candidate_offset=candidate_offset,
            candidate_limit=INTERNAL_CANDIDATE_LIMIT,
            met_client=resolved_met_candidate_client,
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
            raise HTTPException(status_code=409, detail=str(error)) from error

        return {
            "run_id": run.run_id,
            "collect_job_id": collect_job.job_id,
            "status": collect_job.status,
            "batch_target": collect_job.batch_target,
        }

    @app.post("/search-sets/{slug}/provider-collections/met/collects/stop")
    def stop_met_collect(slug: str) -> dict[str, object]:
        collect_job = get_active_collect_job_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider="met",
        )
        if collect_job is None or collect_job.status != "running":
            raise HTTPException(status_code=409, detail="No running Met search can be stopped.")

        stopped_job = request_stop_collect_job(
            database_path=resolved_database_path,
            job_id=collect_job.job_id,
        )
        return {
            "collect_job_id": stopped_job.job_id,
            "status": stopped_job.status,
        }

    @app.post("/search-sets/{slug}/provider-collections/met/collects/resume")
    def resume_met_collect(
        slug: str,
        request: StartMetCollectRequest,
    ) -> dict[str, object]:
        collect_job = get_active_collect_job_for_search_set_provider(
            database_path=resolved_database_path,
            search_set_slug=slug,
            provider="met",
        )
        if collect_job is None or collect_job.status != "paused":
            raise HTTPException(status_code=409, detail="No paused Met search can be resumed.")

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

    @app.post("/provider-collections/met/runs/{run_id}/ingest")
    def ingest_met_candidate_run(run_id: int) -> dict[str, object]:
        summary = ingest_met_run(
            database_path=resolved_database_path,
            data_root=resolved_data_root,
            run_id=run_id,
            met_client=resolved_met_record_client,
            download_image_bytes=resolved_download_image_bytes,
        )
        return serialize_met_ingest_summary(summary)

    return app
