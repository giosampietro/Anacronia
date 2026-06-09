from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from anacronia.image_pipeline import process_image_derivatives_from_bytes
from anacronia.local_material import LocalImageAsset, LocalSkippedImageReference
from anacronia.provider_identity import ProviderObjectIdValue


IMAGE_PROCESSING_FAILED_REASON = "image_processing_failed"


@dataclass(frozen=True)
class ProviderImageImportCandidate:
    provider: str
    object_id: ProviderObjectIdValue
    source_image_url: str
    source_image_id: str
    image_role: str
    image_index: int | None
    primary_image_small_url: str
    temporary_original_path: Path
    standard_path: Path
    thumb_path: Path
    source_file_path: str = ""
    source_rights_statement: str = ""
    source_rights_uri: str = ""
    source_license_name: str = ""
    source_license_uri: str = ""
    source_iiif_service_url: str = ""
    source_metadata: dict[str, object] | None = None

    def skipped_reference(self, reason: str) -> LocalSkippedImageReference:
        return LocalSkippedImageReference(
            provider=self.provider,
            object_id=self.object_id,
            source_image_url=self.source_image_url,
            image_role=self.image_role,
            image_index=self.image_index,
            reason=reason,
        )


@dataclass(frozen=True)
class ProviderImageImportResult:
    imported_image_assets: list[LocalImageAsset]
    skipped_image_references: list[LocalSkippedImageReference]


def import_provider_image_candidates(
    *,
    candidates: list[ProviderImageImportCandidate],
    download_image_bytes: Callable[[str], bytes],
) -> ProviderImageImportResult:
    imported_image_assets: list[LocalImageAsset] = []
    skipped_image_references: list[LocalSkippedImageReference] = []

    for candidate in candidates:
        try:
            processed = process_image_derivatives_from_bytes(
                source_bytes=download_image_bytes(candidate.source_image_url),
                temporary_original_path=candidate.temporary_original_path,
                standard_path=candidate.standard_path,
                thumb_path=candidate.thumb_path,
            )
        except Exception:
            skipped_image_references.append(
                candidate.skipped_reference(IMAGE_PROCESSING_FAILED_REASON)
            )
            continue

        if not processed.imported:
            skipped_image_references.append(
                candidate.skipped_reference(IMAGE_PROCESSING_FAILED_REASON)
            )
            continue

        imported_image_assets.append(
            LocalImageAsset(
                provider=candidate.provider,
                object_id=candidate.object_id,
                source_image_url=candidate.source_image_url,
                source_image_id=candidate.source_image_id,
                image_role=candidate.image_role,
                image_index=candidate.image_index,
                primary_image_small_url=candidate.primary_image_small_url,
                original_width=processed.original_width,
                original_height=processed.original_height,
                standard_path=processed.standard_path,
                thumb_path=processed.thumb_path,
                imported=processed.imported,
                source_file_path=candidate.source_file_path,
                source_rights_statement=candidate.source_rights_statement,
                source_rights_uri=candidate.source_rights_uri,
                source_license_name=candidate.source_license_name,
                source_license_uri=candidate.source_license_uri,
                source_iiif_service_url=candidate.source_iiif_service_url,
                source_metadata=candidate.source_metadata,
            )
        )

    return ProviderImageImportResult(
        imported_image_assets=imported_image_assets,
        skipped_image_references=skipped_image_references,
    )
