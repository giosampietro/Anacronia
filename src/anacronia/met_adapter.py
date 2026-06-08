from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from anacronia.collection_runs import (
    CandidateRun,
    MetCandidateClient,
    discover_provider_candidates,
)
from anacronia.met_ingest import (
    DEFAULT_MAX_IMAGES_PER_OBJECT,
    MET_PROVIDER,
    MetIngestSummary,
    MetRecordClient,
    ingest_met_run,
)
from anacronia.provider_adapters import ProviderIngestRequest


@dataclass(frozen=True)
class MetProviderAdapter:
    candidate_client: MetCandidateClient
    record_client: MetRecordClient
    download_image_bytes: Callable[[str], bytes] | None = None
    provider: str = MET_PROVIDER
    display_name: str = "Met"

    def discover_candidate_run(
        self,
        *,
        database_path: Path,
        search_set_slug: str,
        candidate_offset: int,
        candidate_limit: int,
        batch_target: int,
    ) -> CandidateRun:
        return discover_provider_candidates(
            database_path=database_path,
            search_set_slug=search_set_slug,
            provider=self.provider,
            candidate_offset=candidate_offset,
            candidate_limit=candidate_limit,
            candidate_client=self.candidate_client,
            batch_target=batch_target,
        )

    def ingest_run(self, request: ProviderIngestRequest) -> MetIngestSummary:
        return ingest_met_run(
            database_path=request.database_path,
            data_root=request.data_root,
            run_id=request.run_id,
            met_client=self.record_client,
            download_image_bytes=self.download_image_bytes,
            max_images_per_object=request.max_images_per_object
            or DEFAULT_MAX_IMAGES_PER_OBJECT,
            batch_target=request.batch_target,
            start_run_position=request.start_run_position,
            on_candidate_processed=request.on_candidate_processed,
            should_stop=request.should_stop,
        )
