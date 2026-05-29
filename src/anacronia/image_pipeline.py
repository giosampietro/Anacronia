from dataclasses import dataclass
from io import BytesIO
import json
from pathlib import Path
from typing import Callable

from PIL import Image

from anacronia.storage import met_image_derivative_path, met_object_range_folder


STANDARD_1024_SETTINGS = {
    "derivative": "standard-1024",
    "long_edge": 1024,
    "jpeg_quality": 90,
}
THUMB_256_SETTINGS = {
    "derivative": "thumb-256",
    "long_edge": 256,
    "jpeg_quality": 75,
}


@dataclass(frozen=True)
class ImageDerivativeSettings:
    derivative: str
    long_edge: int
    jpeg_quality: int


@dataclass(frozen=True)
class ProcessedMetImageAsset:
    object_id: int
    image_role: str
    image_index: int | None
    source_image_url: str
    primary_image_small_url: str
    original_width: int
    original_height: int
    temporary_original_path: Path
    standard_path: Path
    thumb_path: Path
    standard_settings: ImageDerivativeSettings
    thumb_settings: ImageDerivativeSettings
    imported: bool


def process_met_image_asset(
    *,
    data_root: Path,
    object_id: int,
    image_role: str,
    source_image_url: str,
    primary_image_small_url: str = "",
    download_bytes: Callable[[str], bytes],
    image_index: int | None = None,
) -> ProcessedMetImageAsset:
    standard_settings = ImageDerivativeSettings(**STANDARD_1024_SETTINGS)
    thumb_settings = ImageDerivativeSettings(**THUMB_256_SETTINGS)
    temporary_original_path = met_temporary_original_path(
        data_root=data_root,
        object_id=object_id,
        image_role=image_role,
        image_index=image_index,
    )
    standard_path = met_image_derivative_path(
        data_root=data_root,
        object_id=object_id,
        image_role=image_role,
        image_index=image_index,
        derivative=standard_settings.derivative,
    )
    thumb_path = met_image_derivative_path(
        data_root=data_root,
        object_id=object_id,
        image_role=image_role,
        image_index=image_index,
        derivative=thumb_settings.derivative,
    )

    temporary_original_path.parent.mkdir(parents=True, exist_ok=True)
    source_bytes = download_bytes(source_image_url)
    temporary_original_path.write_bytes(source_bytes)

    try:
        with Image.open(BytesIO(source_bytes)) as source_image:
            source_image.load()
            original_width, original_height = source_image.size
            write_image_derivative(
                source_image=source_image,
                path=standard_path,
                settings=standard_settings,
            )
            write_image_derivative(
                source_image=source_image,
                path=thumb_path,
                settings=thumb_settings,
            )
    finally:
        temporary_original_path.unlink(missing_ok=True)

    imported = validate_image_derivative(
        path=standard_path,
        settings=standard_settings,
    ) and validate_image_derivative(
        path=thumb_path,
        settings=thumb_settings,
    )

    return ProcessedMetImageAsset(
        object_id=object_id,
        image_role=image_role,
        image_index=image_index,
        source_image_url=source_image_url,
        primary_image_small_url=primary_image_small_url,
        original_width=original_width,
        original_height=original_height,
        temporary_original_path=temporary_original_path,
        standard_path=standard_path,
        thumb_path=thumb_path,
        standard_settings=standard_settings,
        thumb_settings=thumb_settings,
        imported=imported,
    )


def write_image_derivative(
    *,
    source_image: Image.Image,
    path: Path,
    settings: ImageDerivativeSettings,
) -> None:
    derivative_image = source_image.convert("RGB").copy()
    derivative_image.thumbnail(
        (settings.long_edge, settings.long_edge),
        Image.Resampling.LANCZOS,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    derivative_image.save(
        path,
        format="JPEG",
        quality=settings.jpeg_quality,
        optimize=True,
    )
    write_image_derivative_settings(path=path, settings=settings)


def validate_image_derivative(*, path: Path, settings: ImageDerivativeSettings) -> bool:
    if not path.is_file():
        return False

    try:
        with Image.open(path) as image:
            image.load()
            width, height = image.size
            return (
                image.format == "JPEG"
                and max(width, height) == settings.long_edge
                and read_image_derivative_settings(path=path) == settings
            )
    except (KeyError, OSError, TypeError, ValueError):
        return False


def write_image_derivative_settings(
    *,
    path: Path,
    settings: ImageDerivativeSettings,
) -> None:
    path.with_suffix(".json").write_text(
        json.dumps(
            {
                "derivative": settings.derivative,
                "long_edge": settings.long_edge,
                "jpeg_quality": settings.jpeg_quality,
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )


def read_image_derivative_settings(*, path: Path) -> ImageDerivativeSettings:
    metadata = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
    return ImageDerivativeSettings(
        derivative=metadata["derivative"],
        long_edge=metadata["long_edge"],
        jpeg_quality=metadata["jpeg_quality"],
    )


def met_temporary_original_path(
    *,
    data_root: Path,
    object_id: int,
    image_role: str,
    image_index: int | None = None,
) -> Path:
    if image_role == "additional":
        if image_index is None:
            raise ValueError("Additional Met image originals require an image index.")
        image_name = f"additional-{image_index:03d}-source-original"
    else:
        image_name = f"{image_role}-source-original"

    return (
        data_root
        / "temp"
        / "met"
        / "images"
        / met_object_range_folder(object_id)
        / str(object_id)
        / image_name
    )
