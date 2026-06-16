from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Sequence

from anacronia.analysis_result_registry import LocalAnalysisResultRegistry


ANALYSIS_MANIFEST_NAME = "analysis.json"
ANALYSIS_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class AnalysisSourceCollection:
    slug: str
    label: str

    def to_public_dict(self) -> dict[str, object]:
        return {
            "label": self.label,
            "slug": self.slug,
        }


@dataclass(frozen=True)
class AnalysisVariant:
    analysis_result_id: str
    explorer_href: str | None = None
    status: str = "missing"

    def to_public_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "analysis_result_id": self.analysis_result_id,
            "status": self.status,
        }
        if self.explorer_href is not None:
            payload["explorer_href"] = self.explorer_href
        return payload


@dataclass(frozen=True)
class AnalysisRecord:
    analysis_id: str
    title: str
    created_at: str
    updated_at: str
    source_collections: list[AnalysisSourceCollection]
    recipe_ids: list[str]
    analysis_job_ids: list[str] = field(default_factory=list)
    variants: list[AnalysisVariant] = field(default_factory=list)
    status: str = "pending"

    def to_public_dict(self) -> dict[str, object]:
        return {
            "analysis_id": self.analysis_id,
            "analysis_job_ids": self.analysis_job_ids,
            "created_at": self.created_at,
            "recipe_ids": self.recipe_ids,
            "source_collections": [
                collection.to_public_dict() for collection in self.source_collections
            ],
            "status": self.status,
            "title": self.title,
            "updated_at": self.updated_at,
            "variants": [variant.to_public_dict() for variant in self.variants],
        }


class LocalAnalysisStore:
    def __init__(self, data_root: Path):
        self.data_root = data_root.expanduser().resolve()
        self.analyses_root = self.data_root / "analyses"

    def create(
        self,
        *,
        title: str,
        source_collections: Sequence[AnalysisSourceCollection],
        recipe_ids: Sequence[str],
        created_at: datetime | None = None,
    ) -> AnalysisRecord:
        normalized_title = _require_title(title)
        created = created_at or datetime.now(timezone.utc)
        timestamp = _format_timestamp(created)
        analysis_id = self._next_analysis_id(created)
        record = AnalysisRecord(
            analysis_id=analysis_id,
            title=normalized_title,
            created_at=timestamp,
            updated_at=timestamp,
            source_collections=list(source_collections),
            recipe_ids=[str(recipe_id) for recipe_id in recipe_ids],
        )
        self._write_record(record)
        return record

    def load(self, analysis_id: str) -> AnalysisRecord:
        return _record_from_manifest(
            _read_json(self._manifest_path(analysis_id)),
            data_root=self.data_root,
        )

    def list(self) -> list[AnalysisRecord]:
        if not self.analyses_root.is_dir():
            return []
        records = [
            self.load(path.parent.name)
            for path in self.analyses_root.glob(f"*/{ANALYSIS_MANIFEST_NAME}")
        ]
        return sorted(records, key=lambda record: record.created_at, reverse=True)

    def rename_title(
        self,
        *,
        analysis_id: str,
        title: str,
        updated_at: datetime | None = None,
    ) -> AnalysisRecord:
        existing = self.load(analysis_id)
        updated = updated_at or datetime.now(timezone.utc)
        record = AnalysisRecord(
            analysis_id=existing.analysis_id,
            analysis_job_ids=existing.analysis_job_ids,
            created_at=existing.created_at,
            recipe_ids=existing.recipe_ids,
            source_collections=existing.source_collections,
            status=existing.status,
            title=_require_title(title),
            updated_at=_format_timestamp(updated),
            variants=existing.variants,
        )
        self._write_record(record)
        return record

    def attach_analysis_job(
        self,
        *,
        analysis_id: str,
        analysis_job_id: str,
        updated_at: datetime | None = None,
    ) -> AnalysisRecord:
        existing = self.load(analysis_id)
        analysis_job_ids = list(existing.analysis_job_ids)
        normalized_job_id = analysis_job_id.strip()
        if normalized_job_id and normalized_job_id not in analysis_job_ids:
            analysis_job_ids.append(normalized_job_id)
        updated = updated_at or datetime.now(timezone.utc)
        record = AnalysisRecord(
            analysis_id=existing.analysis_id,
            analysis_job_ids=analysis_job_ids,
            created_at=existing.created_at,
            recipe_ids=existing.recipe_ids,
            source_collections=existing.source_collections,
            status=existing.status,
            title=existing.title,
            updated_at=_format_timestamp(updated),
            variants=existing.variants,
        )
        self._write_record(record)
        return self.load(analysis_id)

    def attach_analysis_result(
        self,
        *,
        analysis_id: str,
        analysis_result_id: str,
        updated_at: datetime | None = None,
    ) -> AnalysisRecord:
        existing = self.load(analysis_id)
        registry = LocalAnalysisResultRegistry(self.data_root)
        manifest = registry.load(analysis_result_id)
        analysis_job_ids = list(existing.analysis_job_ids)
        result_analysis_job_id = str(manifest.get("analysis_job_id", "")).strip()
        if result_analysis_job_id and result_analysis_job_id not in analysis_job_ids:
            analysis_job_ids.append(result_analysis_job_id)
        variants = [
            variant
            for variant in existing.variants
            if variant.analysis_result_id != analysis_result_id
        ]
        variants.append(_analysis_variant(data_root=self.data_root, value=manifest))
        updated = updated_at or datetime.now(timezone.utc)
        record = AnalysisRecord(
            analysis_id=existing.analysis_id,
            analysis_job_ids=analysis_job_ids,
            created_at=existing.created_at,
            recipe_ids=existing.recipe_ids,
            source_collections=existing.source_collections,
            status=existing.status,
            title=existing.title,
            updated_at=_format_timestamp(updated),
            variants=variants,
        )
        self._write_record(record)
        return self.load(analysis_id)

    def _next_analysis_id(self, created_at: datetime) -> str:
        base_id = f"analysis-{_compact_timestamp(_format_timestamp(created_at))}"
        analysis_id = base_id
        counter = 2
        while self._manifest_path(analysis_id).exists():
            analysis_id = f"{base_id}-{counter}"
            counter += 1
        return analysis_id

    def _write_record(self, record: AnalysisRecord) -> None:
        manifest_path = self._manifest_path(record.analysis_id)
        _write_json(
            manifest_path,
            {
                "analysis_id": record.analysis_id,
                "analysis_job_ids": list(record.analysis_job_ids),
                "created_at": record.created_at,
                "recipe_ids": list(record.recipe_ids),
                "schema_version": ANALYSIS_SCHEMA_VERSION,
                "source_collections": [
                    collection.to_public_dict()
                    for collection in record.source_collections
                ],
                "title": record.title,
                "updated_at": record.updated_at,
                "variants": [variant.to_public_dict() for variant in record.variants],
            },
        )

    def _manifest_path(self, analysis_id: str) -> Path:
        return self.analyses_root / analysis_id / ANALYSIS_MANIFEST_NAME


def _record_from_manifest(
    manifest: dict[str, object],
    *,
    data_root: Path,
) -> AnalysisRecord:
    analysis_id = str(manifest["analysis_id"])
    analysis_job_ids = [
        str(analysis_job_id)
        for analysis_job_id in manifest.get("analysis_job_ids", [])
    ]
    source_collections = [
        AnalysisSourceCollection(
            label=str(collection.get("label", "")),
            slug=str(collection.get("slug", "")),
        )
        for collection in _dict_list(manifest.get("source_collections"))
    ]
    variants = _dedupe_variants([
        _analysis_variant(data_root=data_root, value=variant)
        for variant in _dict_list(manifest.get("variants"))
    ])
    variant_ids = {variant.analysis_result_id for variant in variants}
    for analysis_job_id in analysis_job_ids:
        for analysis_result_id in _analysis_job_result_ids(
            data_root=data_root,
            analysis_job_id=analysis_job_id,
        ):
            if analysis_result_id in variant_ids:
                continue
            variants.append(
                _analysis_variant(
                    data_root=data_root,
                    value={"analysis_result_id": analysis_result_id},
                )
            )
            variant_ids.add(analysis_result_id)
    return AnalysisRecord(
        analysis_id=analysis_id,
        analysis_job_ids=analysis_job_ids,
        created_at=str(manifest.get("created_at", "")),
        recipe_ids=[str(recipe_id) for recipe_id in manifest.get("recipe_ids", [])],
        source_collections=source_collections,
        status=_analysis_status(
            analysis_job_ids=analysis_job_ids,
            data_root=data_root,
            variants=variants,
        ),
        title=str(manifest["title"]),
        updated_at=str(manifest.get("updated_at", manifest.get("created_at", ""))),
        variants=variants,
    )


def _dict_list(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _dedupe_variants(variants: list[AnalysisVariant]) -> list[AnalysisVariant]:
    deduped: list[AnalysisVariant] = []
    seen: set[str] = set()
    for variant in variants:
        if not variant.analysis_result_id or variant.analysis_result_id in seen:
            continue
        deduped.append(variant)
        seen.add(variant.analysis_result_id)
    return deduped


def _analysis_status(
    *,
    analysis_job_ids: list[str],
    data_root: Path,
    variants: list[AnalysisVariant],
) -> str:
    job_statuses = [
        _analysis_job_status(data_root=data_root, analysis_job_id=analysis_job_id)
        for analysis_job_id in analysis_job_ids
    ]
    if any(status in {"queued", "running", "stopping"} for status in job_statuses):
        return "running"
    if variants:
        return "ready"
    if any(status == "failed" for status in job_statuses):
        return "failed"
    return "pending"


def _analysis_variant(*, data_root: Path, value: dict[str, object]) -> AnalysisVariant:
    analysis_result_id = str(value.get("analysis_result_id", "")).strip()
    if not analysis_result_id:
        return AnalysisVariant(analysis_result_id="", status="missing")
    try:
        summary = LocalAnalysisResultRegistry(data_root).summarize(analysis_result_id)
    except FileNotFoundError:
        return AnalysisVariant(
            analysis_result_id=analysis_result_id,
            status="missing",
        )
    return AnalysisVariant(
        analysis_result_id=analysis_result_id,
        explorer_href=f"/latent-map?analysisResultId={analysis_result_id}",
        status=summary.status,
    )


def _analysis_job_status(*, data_root: Path, analysis_job_id: str) -> str:
    manifest_path = data_root / "analysis-jobs" / analysis_job_id / "analysis-job.json"
    if not manifest_path.is_file():
        return "missing"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return str(manifest.get("status", "missing"))


def _analysis_job_result_ids(*, data_root: Path, analysis_job_id: str) -> list[str]:
    manifest_path = data_root / "analysis-jobs" / analysis_job_id / "analysis-job.json"
    if not manifest_path.is_file():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return [
        str(analysis_result_id).strip()
        for analysis_result_id in manifest.get("analysis_result_ids", [])
        if str(analysis_result_id).strip()
    ]


def _require_title(title: str) -> str:
    normalized = " ".join(title.split())
    if not normalized:
        raise ValueError("Analysis title is required.")
    return normalized


def _read_json(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise FileNotFoundError(f"Analysis not found: {path.parent.name}")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temp_path.replace(path)


def _format_timestamp(value: datetime) -> str:
    normalized = value
    if normalized.tzinfo is None:
        normalized = normalized.replace(tzinfo=timezone.utc)
    normalized = normalized.astimezone(timezone.utc)
    return normalized.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _compact_timestamp(value: str) -> str:
    return (
        value.replace("-", "")
        .replace(":", "")
        .replace(".", "")
        .replace("+0000", "Z")
    )
