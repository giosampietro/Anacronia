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
