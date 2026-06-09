from anacronia.image_pipeline import (
    ImageDerivativeSettings,
    STANDARD_1024_SETTINGS,
    THUMB_256_SETTINGS,
    validate_image_derivative,
)
from anacronia.provider_image_import import (
    ProviderImageImportCandidate,
    import_provider_image_candidates,
)


def ppm_image_bytes(*, width: int, height: int) -> bytes:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    row = bytes([40, 130, 180]) * width
    return header + row * height


def test_imports_provider_image_candidate_with_metadata(tmp_path):
    result = import_provider_image_candidates(
        candidates=[
            ProviderImageImportCandidate(
                provider="vam",
                object_id="O9138",
                source_image_url="https://framemark.vam.ac.uk/collections/2006AL3614/full/full/0/default.jpg",
                source_image_id="2006AL3614",
                image_role="primary",
                image_index=None,
                primary_image_small_url="https://framemark.vam.ac.uk/collections/2006AL3614/full/!100,100/0/default.jpg",
                temporary_original_path=tmp_path / "temp" / "source-original",
                standard_path=tmp_path / "standard.jpg",
                thumb_path=tmp_path / "thumb.jpg",
                source_file_path="/private/source.jpg",
                source_rights_statement="© Victoria and Albert Museum, London",
                source_rights_uri="https://rights.example/vam",
                source_license_name="Example License",
                source_license_uri="https://license.example/vam",
                source_iiif_service_url="https://framemark.vam.ac.uk/collections/2006AL3614",
                source_metadata={"sensitive_image": False},
            )
        ],
        download_image_bytes=lambda _url: ppm_image_bytes(width=1600, height=800),
    )

    assert result.skipped_image_references == []
    assert len(result.imported_image_assets) == 1
    image_asset = result.imported_image_assets[0]
    assert image_asset.provider == "vam"
    assert image_asset.object_id == "O9138"
    assert image_asset.source_image_id == "2006AL3614"
    assert image_asset.original_width == 1600
    assert image_asset.original_height == 800
    assert validate_image_derivative(
        path=image_asset.standard_path,
        settings=ImageDerivativeSettings(**STANDARD_1024_SETTINGS),
    )
    assert validate_image_derivative(
        path=image_asset.thumb_path,
        settings=ImageDerivativeSettings(**THUMB_256_SETTINGS),
    )
    assert image_asset.source_file_path == "/private/source.jpg"
    assert image_asset.source_rights_statement == (
        "© Victoria and Albert Museum, London"
    )
    assert image_asset.source_rights_uri == "https://rights.example/vam"
    assert image_asset.source_license_name == "Example License"
    assert image_asset.source_license_uri == "https://license.example/vam"
    assert image_asset.source_iiif_service_url == (
        "https://framemark.vam.ac.uk/collections/2006AL3614"
    )
    assert image_asset.source_metadata == {"sensitive_image": False}
    assert not (tmp_path / "temp" / "source-original").exists()


def test_records_skipped_reference_when_image_processing_fails(tmp_path):
    result = import_provider_image_candidates(
        candidates=[
            ProviderImageImportCandidate(
                provider="met",
                object_id=40,
                source_image_url="https://images.metmuseum.org/not-an-image.jpg",
                source_image_id="https://images.metmuseum.org/not-an-image.jpg",
                image_role="primary",
                image_index=None,
                primary_image_small_url="",
                temporary_original_path=tmp_path / "temp" / "source-original",
                standard_path=tmp_path / "standard.jpg",
                thumb_path=tmp_path / "thumb.jpg",
            )
        ],
        download_image_bytes=lambda _url: b"not an image",
    )

    assert result.imported_image_assets == []
    assert [
        (
            reference.provider,
            reference.object_id,
            reference.source_image_url,
            reference.image_role,
            reference.image_index,
            reference.reason,
        )
        for reference in result.skipped_image_references
    ] == [
        (
            "met",
            40,
            "https://images.metmuseum.org/not-an-image.jpg",
            "primary",
            None,
            "image_processing_failed",
        )
    ]


def test_keeps_processing_after_one_candidate_fails(tmp_path):
    def download_image_bytes(url: str) -> bytes:
        if url.endswith("broken.jpg"):
            raise RuntimeError("download failed")
        return ppm_image_bytes(width=1200, height=900)

    result = import_provider_image_candidates(
        candidates=[
            ProviderImageImportCandidate(
                provider="met",
                object_id=40,
                source_image_url="https://images.metmuseum.org/primary.jpg",
                source_image_id="https://images.metmuseum.org/primary.jpg",
                image_role="primary",
                image_index=None,
                primary_image_small_url="",
                temporary_original_path=tmp_path / "primary-source",
                standard_path=tmp_path / "primary-standard.jpg",
                thumb_path=tmp_path / "primary-thumb.jpg",
            ),
            ProviderImageImportCandidate(
                provider="met",
                object_id=40,
                source_image_url="https://images.metmuseum.org/broken.jpg",
                source_image_id="https://images.metmuseum.org/broken.jpg",
                image_role="additional",
                image_index=1,
                primary_image_small_url="",
                temporary_original_path=tmp_path / "broken-source",
                standard_path=tmp_path / "broken-standard.jpg",
                thumb_path=tmp_path / "broken-thumb.jpg",
            ),
            ProviderImageImportCandidate(
                provider="met",
                object_id=40,
                source_image_url="https://images.metmuseum.org/detail.jpg",
                source_image_id="https://images.metmuseum.org/detail.jpg",
                image_role="additional",
                image_index=2,
                primary_image_small_url="",
                temporary_original_path=tmp_path / "detail-source",
                standard_path=tmp_path / "detail-standard.jpg",
                thumb_path=tmp_path / "detail-thumb.jpg",
            ),
        ],
        download_image_bytes=download_image_bytes,
    )

    assert [
        (image.source_image_url, image.image_role, image.image_index)
        for image in result.imported_image_assets
    ] == [
        ("https://images.metmuseum.org/primary.jpg", "primary", None),
        ("https://images.metmuseum.org/detail.jpg", "additional", 2),
    ]
    assert [
        (
            reference.provider,
            reference.object_id,
            reference.source_image_url,
            reference.image_role,
            reference.image_index,
            reference.reason,
        )
        for reference in result.skipped_image_references
    ] == [
        (
            "met",
            40,
            "https://images.metmuseum.org/broken.jpg",
            "additional",
            1,
            "image_processing_failed",
        )
    ]
