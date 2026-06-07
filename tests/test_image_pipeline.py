from anacronia.image_pipeline import (
    ImageDerivativeSettings,
    process_image_derivatives_from_bytes,
    process_met_image_asset,
    validate_image_derivative,
    write_image_derivative_settings,
)
from anacronia.storage import met_image_derivative_path
from PIL import Image


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([180, 40, 120]) * width
    return header + row * height


def test_processes_met_source_image_into_valid_derivatives_and_deletes_original(tmp_path):
    downloaded_urls: list[str] = []

    def download_bytes(url: str) -> bytes:
        downloaded_urls.append(url)
        return ppm_image_bytes(width=1600, height=800)

    result = process_met_image_asset(
        data_root=tmp_path / "data",
        object_id=436535,
        image_role="primary",
        source_image_url="https://images.metmuseum.org/original.jpg",
        primary_image_small_url="https://images.metmuseum.org/small.jpg",
        download_bytes=download_bytes,
    )

    assert downloaded_urls == ["https://images.metmuseum.org/original.jpg"]
    assert result.imported is True
    assert result.source_image_url == "https://images.metmuseum.org/original.jpg"
    assert result.primary_image_small_url == "https://images.metmuseum.org/small.jpg"
    assert result.original_width == 1600
    assert result.original_height == 800
    assert result.temporary_original_path.exists() is False

    standard_path = met_image_derivative_path(
        data_root=tmp_path / "data",
        object_id=436535,
        image_role="primary",
        derivative="standard-1024",
    )
    thumb_path = met_image_derivative_path(
        data_root=tmp_path / "data",
        object_id=436535,
        image_role="primary",
        derivative="thumb-256",
    )
    assert result.standard_path == standard_path
    assert result.thumb_path == thumb_path
    assert result.standard_settings == ImageDerivativeSettings(
        derivative="standard-1024",
        long_edge=1024,
        jpeg_quality=90,
    )
    assert result.thumb_settings == ImageDerivativeSettings(
        derivative="thumb-256",
        long_edge=256,
        jpeg_quality=75,
    )
    assert validate_image_derivative(path=standard_path, settings=result.standard_settings)
    assert validate_image_derivative(path=thumb_path, settings=result.thumb_settings)


def test_processes_generic_source_bytes_into_valid_derivatives_and_deletes_original(tmp_path):
    standard_path = tmp_path / "vam" / "images" / "O-10" / "primary-standard-1024.jpg"
    thumb_path = tmp_path / "vam" / "images" / "O-10" / "primary-thumb-256.jpg"
    temporary_original_path = tmp_path / "temp" / "vam" / "O-10-source-original"

    result = process_image_derivatives_from_bytes(
        source_bytes=ppm_image_bytes(width=1600, height=800),
        temporary_original_path=temporary_original_path,
        standard_path=standard_path,
        thumb_path=thumb_path,
    )

    assert result.imported is True
    assert result.original_width == 1600
    assert result.original_height == 800
    assert temporary_original_path.exists() is False
    assert validate_image_derivative(path=standard_path, settings=result.standard_settings)
    assert validate_image_derivative(path=thumb_path, settings=result.thumb_settings)


def test_validation_rejects_derivative_with_wrong_processing_settings(tmp_path):
    result = process_met_image_asset(
        data_root=tmp_path / "data",
        object_id=436535,
        image_role="primary",
        source_image_url="https://images.metmuseum.org/original.jpg",
        download_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert validate_image_derivative(
        path=result.standard_path,
        settings=ImageDerivativeSettings(
            derivative="standard-1024",
            long_edge=1024,
            jpeg_quality=75,
        ),
    ) is False


def test_validation_rejects_unreadable_or_wrong_dimension_derivatives(tmp_path):
    settings = ImageDerivativeSettings(
        derivative="standard-1024",
        long_edge=1024,
        jpeg_quality=90,
    )
    corrupt_path = tmp_path / "corrupt-standard-1024.jpg"
    wrong_dimension_path = tmp_path / "small-standard-1024.jpg"

    corrupt_path.write_bytes(b"not an image")
    write_image_derivative_settings(path=corrupt_path, settings=settings)

    Image.new("RGB", (512, 256), color=(180, 40, 120)).save(
        wrong_dimension_path,
        format="JPEG",
        quality=90,
    )
    write_image_derivative_settings(path=wrong_dimension_path, settings=settings)

    assert validate_image_derivative(path=tmp_path / "missing.jpg", settings=settings) is False
    assert validate_image_derivative(path=corrupt_path, settings=settings) is False
    assert validate_image_derivative(path=wrong_dimension_path, settings=settings) is False
