from dataclasses import dataclass
import os
from pathlib import Path
import sqlite3
from typing import Mapping
from urllib.parse import quote

from anacronia.provider_identity import ProviderObjectIdValue, normalize_source_object_id


DEFAULT_DATABASE_FILENAME = "anacronia.sqlite"
MET_RANGE_SIZE = 1000


@dataclass(frozen=True)
class StorageFoundation:
    data_root: Path
    database_path: Path


def met_object_range_folder(object_id: int) -> str:
    range_start = (object_id // MET_RANGE_SIZE) * MET_RANGE_SIZE
    range_end = range_start + MET_RANGE_SIZE - 1
    return f"{range_start}-{range_end}"


def met_raw_object_path(*, data_root: Path, object_id: int) -> Path:
    return (
        data_root
        / "met"
        / "raw-api"
        / "objects"
        / met_object_range_folder(object_id)
        / f"{object_id}.json"
    )


def met_image_derivative_path(
    *,
    data_root: Path,
    object_id: int,
    image_role: str,
    derivative: str,
    image_index: int | None = None,
) -> Path:
    image_name = met_image_derivative_filename(
        image_role=image_role,
        derivative=derivative,
        image_index=image_index,
    )
    return (
        data_root
        / "met"
        / "images"
        / met_object_range_folder(object_id)
        / str(object_id)
        / image_name
    )


def met_image_derivative_filename(
    *,
    image_role: str,
    derivative: str,
    image_index: int | None = None,
) -> str:
    if image_role == "additional":
        if image_index is None:
            raise ValueError("Additional Met image derivatives require an image index.")
        return f"additional-{image_index:03d}-{derivative}.jpg"

    return f"{image_role}-{derivative}.jpg"


def source_object_path_segment(object_id: ProviderObjectIdValue) -> str:
    source_object_id = normalize_source_object_id(object_id)
    if not source_object_id:
        raise ValueError("Source object ID is required.")
    return quote(source_object_id, safe="")


def provider_raw_record_path(
    *,
    data_root: Path,
    provider: str,
    object_id: ProviderObjectIdValue,
) -> Path:
    provider_key = provider_path_segment(provider)
    return (
        data_root
        / provider_key
        / "raw-api"
        / "objects"
        / f"{source_object_path_segment(object_id)}.json"
    )


def provider_image_derivative_path(
    *,
    data_root: Path,
    provider: str,
    object_id: ProviderObjectIdValue,
    image_role: str,
    derivative: str,
    image_index: int | None = None,
) -> Path:
    return (
        data_root
        / provider_path_segment(provider)
        / "images"
        / source_object_path_segment(object_id)
        / provider_image_derivative_filename(
            image_role=image_role,
            derivative=derivative,
            image_index=image_index,
        )
    )


def provider_temporary_original_path(
    *,
    data_root: Path,
    provider: str,
    object_id: ProviderObjectIdValue,
    image_role: str,
    image_index: int | None = None,
) -> Path:
    return (
        data_root
        / "temp"
        / provider_path_segment(provider)
        / "images"
        / source_object_path_segment(object_id)
        / provider_temporary_original_filename(
            image_role=image_role,
            image_index=image_index,
        )
    )


def provider_image_derivative_filename(
    *,
    image_role: str,
    derivative: str,
    image_index: int | None = None,
) -> str:
    safe_image_role = quote(image_role.strip() or "image", safe="")
    safe_derivative = quote(derivative.strip() or "derivative", safe="")
    if image_role == "additional":
        if image_index is None:
            raise ValueError("Additional image derivatives require an image index.")
        return f"additional-{image_index:03d}-{safe_derivative}.jpg"

    return f"{safe_image_role}-{safe_derivative}.jpg"


def provider_temporary_original_filename(
    *,
    image_role: str,
    image_index: int | None = None,
) -> str:
    safe_image_role = quote(image_role.strip() or "image", safe="")
    if image_role == "additional":
        if image_index is None:
            raise ValueError("Additional image originals require an image index.")
        return f"additional-{image_index:03d}-source-original"

    return f"{safe_image_role}-source-original"


def provider_path_segment(provider: str) -> str:
    provider_key = provider.strip()
    if not provider_key:
        raise ValueError("Provider is required.")
    return quote(provider_key, safe="")


def resolve_data_root(
    *,
    project_root: Path,
    environment: Mapping[str, str] | None = None,
) -> Path:
    source = os.environ if environment is None else environment
    configured_data_root = source.get("ANACRONIA_DATA_ROOT")

    if configured_data_root:
        return Path(configured_data_root).expanduser()

    return project_root / "data"


def initialize_storage(
    *,
    project_root: Path,
    data_root: Path | None = None,
    environment: Mapping[str, str] | None = None,
) -> StorageFoundation:
    resolved_data_root = (
        data_root
        if data_root is not None
        else resolve_data_root(project_root=project_root, environment=environment)
    )
    resolved_data_root.mkdir(parents=True, exist_ok=True)

    database_path = resolved_data_root / DEFAULT_DATABASE_FILENAME
    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA user_version = 1")

    return StorageFoundation(
        data_root=resolved_data_root,
        database_path=database_path,
    )
