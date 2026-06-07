from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import sqlite3

from anacronia.curation import (
    add_collection_image_asset_membership,
    add_collection_object_membership,
    get_collection_import_exclusions,
)
from anacronia.image_pipeline import process_image_derivatives_from_path
from anacronia.local_material import (
    LocalImageAsset,
    LocalMuseumObject,
    ensure_local_material_schema,
    record_local_image_asset,
    upsert_local_museum_object,
)
from anacronia.search_sets import (
    create_or_continue_search_set,
    ensure_provider_collection,
)
from anacronia.storage import (
    provider_image_derivative_path,
    provider_temporary_original_path,
)


LOCAL_FOLDER_PROVIDER = "local-folder"
SUPPORTED_LOCAL_IMAGE_SUFFIXES = frozenset(
    {".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
)


@dataclass(frozen=True)
class LocalFolderSkippedFile:
    path: Path
    reason: str


@dataclass(frozen=True)
class LocalFolderImportSummary:
    search_set_slug: str
    folder_path: Path
    discovered_file_count: int
    imported_object_ids: list[str]
    imported_image_count: int
    skipped_files: list[LocalFolderSkippedFile]


def create_local_folder_collection(
    *,
    database_path: Path,
    data_root: Path,
    display_name: str,
    folder_path: Path,
) -> LocalFolderImportSummary:
    resolved_folder_path = validate_local_folder_path(folder_path)
    search_set = create_or_continue_search_set(
        database_path=database_path,
        display_name=display_name,
        terms_text="",
        provider=LOCAL_FOLDER_PROVIDER,
        allow_empty_terms=True,
    )
    return import_local_image_folder(
        database_path=database_path,
        data_root=data_root,
        search_set_slug=search_set.slug,
        folder_path=resolved_folder_path,
    )


def import_local_image_folder(
    *,
    database_path: Path,
    data_root: Path,
    search_set_slug: str,
    folder_path: Path,
) -> LocalFolderImportSummary:
    resolved_folder_path = validate_local_folder_path(folder_path)

    all_files = discover_local_files(resolved_folder_path)
    image_files = [
        path for path in all_files if path.suffix.casefold() in SUPPORTED_LOCAL_IMAGE_SUFFIXES
    ]
    skipped_files = [
        LocalFolderSkippedFile(path=path, reason="unsupported_file_type")
        for path in all_files
        if path.suffix.casefold() not in SUPPORTED_LOCAL_IMAGE_SUFFIXES
    ]
    imported_object_ids: list[str] = []
    imported_image_count = 0
    seen_object_ids: set[str] = set()

    with sqlite3.connect(database_path) as connection:
        ensure_local_material_schema(connection)
        search_set_row = connection.execute(
            "SELECT id FROM search_sets WHERE slug = ?",
            (search_set_slug,),
        ).fetchone()
        if search_set_row is None:
            raise LookupError(f"Collection not found: {search_set_slug}")
        search_set_id = int(search_set_row[0])
        ensure_provider_collection(
            connection=connection,
            search_set_id=search_set_id,
            provider=LOCAL_FOLDER_PROVIDER,
        )

    for image_path in image_files:
        try:
            file_hash = sha256_file(image_path)
        except OSError:
            skipped_files.append(
                LocalFolderSkippedFile(path=image_path, reason="file_read_failed")
            )
            continue

        object_id = local_folder_object_id(file_hash)
        source_image_identity = local_folder_source_image_identity(file_hash)
        if object_id in seen_object_ids:
            skipped_files.append(
                LocalFolderSkippedFile(path=image_path, reason="duplicate_file_content")
            )
            continue
        seen_object_ids.add(object_id)

        with sqlite3.connect(database_path) as connection:
            exclusions = get_collection_import_exclusions(
                connection=connection,
                search_set_id=search_set_id,
                provider=LOCAL_FOLDER_PROVIDER,
                object_id=object_id,
            )
        if exclusions.object_excluded:
            skipped_files.append(
                LocalFolderSkippedFile(path=image_path, reason="collection_object_excluded")
            )
            continue
        if source_image_identity in exclusions.image_source_urls:
            skipped_files.append(
                LocalFolderSkippedFile(path=image_path, reason="collection_image_excluded")
            )
            continue

        try:
            processed = process_image_derivatives_from_path(
                source_path=image_path,
                temporary_original_path=provider_temporary_original_path(
                    data_root=data_root,
                    provider=LOCAL_FOLDER_PROVIDER,
                    object_id=object_id,
                    image_role="primary",
                ),
                standard_path=provider_image_derivative_path(
                    data_root=data_root,
                    provider=LOCAL_FOLDER_PROVIDER,
                    object_id=object_id,
                    image_role="primary",
                    derivative="standard-1024",
                ),
                thumb_path=provider_image_derivative_path(
                    data_root=data_root,
                    provider=LOCAL_FOLDER_PROVIDER,
                    object_id=object_id,
                    image_role="primary",
                    derivative="thumb-256",
                ),
            )
        except (OSError, ValueError):
            skipped_files.append(
                LocalFolderSkippedFile(path=image_path, reason="image_processing_failed")
            )
            continue

        if not processed.imported:
            skipped_files.append(
                LocalFolderSkippedFile(path=image_path, reason="image_processing_failed")
            )
            continue

        with sqlite3.connect(database_path) as connection:
            ensure_local_material_schema(connection)
            upsert_local_museum_object(
                connection=connection,
                museum_object=LocalMuseumObject(
                    provider=LOCAL_FOLDER_PROVIDER,
                    object_id=object_id,
                    title=image_path.stem,
                    object_name="Local image",
                    artist_display_name="",
                    object_url="",
                    is_public_domain=False,
                    rights_and_reproduction="",
                    metadata_date="",
                    raw_record_path="",
                ),
            )
            record_local_image_asset(
                connection=connection,
                image_asset=LocalImageAsset(
                    provider=LOCAL_FOLDER_PROVIDER,
                    object_id=object_id,
                    source_image_url=source_image_identity,
                    image_role="primary",
                    image_index=None,
                    primary_image_small_url="",
                    original_width=processed.original_width,
                    original_height=processed.original_height,
                    standard_path=processed.standard_path,
                    thumb_path=processed.thumb_path,
                    imported=True,
                ),
            )
            add_collection_object_membership(
                connection=connection,
                search_set_id=search_set_id,
                provider=LOCAL_FOLDER_PROVIDER,
                object_id=object_id,
            )
            add_collection_image_asset_membership(
                connection=connection,
                search_set_id=search_set_id,
                provider=LOCAL_FOLDER_PROVIDER,
                object_id=object_id,
                source_image_url=source_image_identity,
            )

        imported_object_ids.append(object_id)
        imported_image_count += 1

    return LocalFolderImportSummary(
        search_set_slug=search_set_slug,
        folder_path=resolved_folder_path,
        discovered_file_count=len(image_files),
        imported_object_ids=imported_object_ids,
        imported_image_count=imported_image_count,
        skipped_files=skipped_files,
    )


def discover_local_image_files(folder_path: Path) -> list[Path]:
    return [
        path
        for path in discover_local_files(folder_path)
        if path.suffix.casefold() in SUPPORTED_LOCAL_IMAGE_SUFFIXES
    ]


def discover_local_files(folder_path: Path) -> list[Path]:
    return sorted(
        (path for path in folder_path.rglob("*") if path.is_file()),
        key=lambda path: str(path.relative_to(folder_path)).casefold(),
    )


def validate_local_folder_path(folder_path: Path) -> Path:
    resolved_folder_path = folder_path.expanduser()
    if not resolved_folder_path.is_dir():
        raise ValueError("Local folder path must be an existing folder.")
    return resolved_folder_path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_folder_object_id(file_hash: str) -> str:
    normalized_hash = file_hash.strip().casefold()
    if len(normalized_hash) != 64 or any(
        character not in "0123456789abcdef" for character in normalized_hash
    ):
        raise ValueError("Local folder image hash must be a SHA-256 hex digest.")
    return f"sha256-{normalized_hash}"


def local_folder_source_image_identity(file_hash: str) -> str:
    return f"local-folder:sha256:{file_hash.strip().casefold()}"
