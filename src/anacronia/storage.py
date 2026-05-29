from dataclasses import dataclass
import os
from pathlib import Path
import sqlite3
from typing import Mapping


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
