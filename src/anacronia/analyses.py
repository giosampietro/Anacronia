from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
from typing import Sequence

from anacronia.analysis_jobs import (
    ANALYSIS_JOB_MANIFEST_NAME,
    AnalysisJobSummary,
)
from anacronia.search_sets import get_search_set


ANALYSIS_MANIFEST_NAME = "analysis.json"


@dataclass(frozen=True)
class AnalysisSourceCollection:
    label: str
    slug: str

    def to_public_dict(self) -> dict[str, object]:
        return {
            "label": self.label,
            "slug": self.slug,
        }


@dataclass(frozen=True)
class AnalysisSummary:
    analysis_id: str
    analysis_job_ids: list[str]
    source_collections: list[AnalysisSourceCollection]
    status: str
    title: str
    variants: list[dict[str, object]]

    def to_public_dict(self) -> dict[str, object]:
        return {
            "analysis_id": self.analysis_id,
            "analysis_job_ids": self.analysis_job_ids,
            "source_collections": [
                source.to_public_dict() for source in self.source_collections
            ],
            "status": self.status,
            "title": self.title,
            "variants": self.variants,
        }


class AnalysisTitleError(ValueError):
    pass


class LocalAnalysisStore:
    def __init__(self, *, data_root: Path, database_path: Path):
        self.data_root = data_root.expanduser().resolve()
        self.database_path = database_path

    def create_for_job(
        self,
        *,
        title: str,
        collection_slugs: Sequence[str],
        job: AnalysisJobSummary,
        created_at: datetime | None = None,
    ) -> AnalysisSummary:
        normalized_title = _normalize_title(title)
        created = created_at or datetime.now(timezone.utc)
        source_collections = self._source_collections(collection_slugs)
        analysis_id = _analysis_id_for_job(job.analysis_job_id)
        analysis_dir = self._analysis_dir(analysis_id)
        analysis_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "schema_version": 1,
            "asset_kind": "analysis",
            "analysis_id": analysis_id,
            "analysis_job_ids": [job.analysis_job_id],
            "collection_slugs": [source.slug for source in source_collections],
            "created_at": _format_timestamp(created),
            "source_collections": [
                source.to_public_dict() for source in source_collections
            ],
            "title": normalized_title,
        }
        _write_json(analysis_dir / ANALYSIS_MANIFEST_NAME, manifest)
        return AnalysisSummary(
            analysis_id=analysis_id,
            analysis_job_ids=[job.analysis_job_id],
            source_collections=source_collections,
            status=job.status,
            title=normalized_title,
            variants=[],
        )

    def list(self) -> list[AnalysisSummary]:
        analyses_root = self.data_root / "analyses"
        if not analyses_root.is_dir():
            return []
        summaries = [
            self.summarize(path.parent.name)
            for path in sorted(analyses_root.glob(f"*/{ANALYSIS_MANIFEST_NAME}"))
        ]
        return summaries

    def summarize(self, analysis_id: str) -> AnalysisSummary:
        manifest = _load_json(self._analysis_dir(analysis_id) / ANALYSIS_MANIFEST_NAME)
        job_ids = _string_list(manifest.get("analysis_job_ids"))
        source_collections = [
            AnalysisSourceCollection(
                label=str(source.get("label", "")).strip()
                or str(source.get("slug", "")).strip(),
                slug=str(source.get("slug", "")).strip(),
            )
            for source in _dict_list(manifest.get("source_collections"))
            if str(source.get("slug", "")).strip()
        ]
        variants: list[dict[str, object]] = []
        job_statuses: list[str] = []
        for job_id in job_ids:
            job_manifest = self._load_job_manifest(job_id)
            if not job_manifest:
                continue
            job_statuses.append(str(job_manifest.get("status", "unknown")))
            for analysis_result_id in _string_list(
                job_manifest.get("analysis_result_ids")
            ):
                variants.append(self._variant_for_result(analysis_result_id))

        return AnalysisSummary(
            analysis_id=str(manifest["analysis_id"]),
            analysis_job_ids=job_ids,
            source_collections=source_collections,
            status=_analysis_status(job_statuses=job_statuses, variants=variants),
            title=str(manifest["title"]),
            variants=variants,
        )

    def rename(self, *, analysis_id: str, title: str) -> AnalysisSummary:
        normalized_title = _normalize_title(title)
        manifest_path = self._analysis_dir(analysis_id) / ANALYSIS_MANIFEST_NAME
        manifest = _load_json(manifest_path)
        manifest["title"] = normalized_title
        _write_json(manifest_path, manifest)
        return self.summarize(analysis_id)

    def _source_collections(
        self,
        collection_slugs: Sequence[str],
    ) -> list[AnalysisSourceCollection]:
        sources: list[AnalysisSourceCollection] = []
        seen: set[str] = set()
        for slug in collection_slugs:
            normalized_slug = str(slug).strip()
            if not normalized_slug or normalized_slug in seen:
                continue
            collection = get_search_set(
                database_path=self.database_path,
                slug=normalized_slug,
            )
            sources.append(
                AnalysisSourceCollection(
                    label=collection.display_name,
                    slug=collection.slug,
                )
            )
            seen.add(collection.slug)
        return sources

    def _load_job_manifest(self, analysis_job_id: str) -> dict[str, object] | None:
        manifest_path = (
            self.data_root
            / "analysis-jobs"
            / analysis_job_id
            / ANALYSIS_JOB_MANIFEST_NAME
        )
        if not manifest_path.is_file():
            return None
        return _load_json(manifest_path)

    def _variant_for_result(self, analysis_result_id: str) -> dict[str, object]:
        manifest_path = (
            self.data_root
            / "analysis-results"
            / analysis_result_id
            / "analysis-result.json"
        )
        if not manifest_path.is_file():
            return {
                "analysis_result_id": analysis_result_id,
                "explorer_href": f"/latent-map?analysisResultId={analysis_result_id}",
                "status": "missing",
            }
        manifest = _load_json(manifest_path)
        viewer = manifest.get("viewer")
        explorer_href = ""
        if isinstance(viewer, dict):
            explorer_href = str(viewer.get("open_href", "")).strip()
        return {
            "analysis_result_id": analysis_result_id,
            "explorer_href": explorer_href
            or f"/latent-map?analysisResultId={analysis_result_id}",
            "status": str(manifest.get("status", "unknown")),
        }

    def _analysis_dir(self, analysis_id: str) -> Path:
        return self.data_root / "analyses" / analysis_id


def validate_analysis_title(title: str) -> str:
    return _normalize_title(title)


def _analysis_status(
    *,
    job_statuses: Sequence[str],
    variants: Sequence[dict[str, object]],
) -> str:
    if any(status in {"running", "stopping"} for status in job_statuses):
        return "running"
    if any(status == "partial_failed" for status in job_statuses):
        return "partial_failed"
    if any(status == "ready" for status in job_statuses):
        return "ready"
    if any(status == "failed" for status in job_statuses):
        return "failed"
    return "ready" if variants else "unknown"


def _analysis_id_for_job(analysis_job_id: str) -> str:
    suffix = analysis_job_id.removeprefix("analysis-job-")
    return f"analysis-{suffix}"


def _normalize_title(title: str) -> str:
    normalized = title.strip()
    if not normalized:
        raise AnalysisTitleError("Analysis title is required.")
    return normalized


def _format_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00",
        "Z",
    )


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item)]


def _dict_list(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(
        f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp"
    )
    temp_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temp_path.replace(path)
