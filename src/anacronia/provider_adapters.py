from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol, Sequence

from anacronia.collection_runs import CandidateRun
from anacronia.provider_identity import ProviderObjectIdValue


@dataclass(frozen=True)
class ProviderIngestRequest:
    database_path: Path
    data_root: Path
    run_id: int
    max_images_per_object: int
    batch_target: int | None = None
    start_run_position: int = 0
    on_candidate_processed: Callable[[int], None] | None = None
    should_stop: Callable[[], bool] | None = None


@dataclass(frozen=True)
class ProviderAdapterCapabilities:
    provider: str
    raw_record_policy: str
    source_image_id_policy: str
    rights_eligibility_policy: str
    accepted_reusability_values: tuple[str, ...] = ()
    rejected_reusability_values: tuple[str, ...] = ()
    per_image_rights_metadata: bool = False
    provider_notice: str = ""


MET_CAPABILITIES = ProviderAdapterCapabilities(
    provider="met",
    raw_record_policy="write_full_record_after_at_least_one_image_asset_imports",
    source_image_id_policy="source_image_url",
    rights_eligibility_policy="require_isPublicDomain_true",
)

VAM_CAPABILITIES = ProviderAdapterCapabilities(
    provider="vam",
    raw_record_policy="write_full_record_after_at_least_one_image_asset_imports",
    source_image_id_policy="record.images assetRef",
    rights_eligibility_policy="private_local_testing_notice_no_public_domain_gate",
    per_image_rights_metadata=True,
    provider_notice=(
        "V&A images are imported for private local testing in Anacronia. "
        "Check V&A terms before publication or commercial reuse."
    ),
)

EUROPEANA_FUTURE_CAPABILITIES = ProviderAdapterCapabilities(
    provider="europeana",
    raw_record_policy="write_full_record_after_at_least_one_image_asset_imports",
    source_image_id_policy="EDM WebResource about/edmIsShownBy or provider media id",
    rights_eligibility_policy="accept_yes_and_yes_with_conditions_reject_maybe",
    accepted_reusability_values=("open", "restricted"),
    rejected_reusability_values=("permission",),
    per_image_rights_metadata=True,
)


class ProviderSkippedCandidate(Protocol):
    object_id: ProviderObjectIdValue
    reason: str


class ProviderIngestSummary(Protocol):
    run_id: int
    fetched_object_ids: list[ProviderObjectIdValue]
    imported_object_ids: list[ProviderObjectIdValue]
    imported_image_count: int
    skipped_candidates: Sequence[ProviderSkippedCandidate]


class OnlineProviderAdapter(Protocol):
    provider: str
    display_name: str
    capabilities: ProviderAdapterCapabilities

    def discover_candidate_run(
        self,
        *,
        database_path: Path,
        search_set_slug: str,
        candidate_offset: int,
        candidate_limit: int,
        batch_target: int,
    ) -> CandidateRun:
        pass

    def ingest_run(self, request: ProviderIngestRequest) -> ProviderIngestSummary:
        pass
