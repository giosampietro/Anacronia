from anacronia.image_pipeline import (
    ImageDerivativeSettings,
    process_met_image_asset,
    validate_image_derivative,
)
from anacronia.storage import met_image_derivative_path


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
