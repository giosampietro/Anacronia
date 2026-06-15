from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import threading
import time
from typing import Protocol, Sequence

from anacronia.analysis_result_contract import (
    analysis_result_artifact_counts,
    analysis_result_artifact_required,
    analysis_result_explorer_readiness,
    assert_analysis_result_manifest_contract,
)
from anacronia.analysis_recipes import (
    CANONICAL_LATENT_MAP_RUNTIME_STAGE_IDS,
    AnalysisRecipe,
    select_analysis_recipes,
)
from anacronia.analysis_scopes import (
    AnalysisScopeSnapshot,
    ResolvedAnalysisScope,
    resolve_analysis_scope,
    save_analysis_scope_snapshot,
)
from anacronia.image_embedding_results import (
    RecipeEmbeddingReusePlan,
    plan_image_embedding_reuse,
)


ANALYSIS_JOB_MANIFEST_NAME = "analysis-job.json"
ANALYSIS_RESULT_MANIFEST_NAME = "analysis-result.json"
ANALYSIS_JOB_STAGE_NAMES = CANONICAL_LATENT_MAP_RUNTIME_STAGE_IDS
ANALYSIS_JOB_ACTIVE_STATUSES = frozenset({"running", "stopping"})
DEFAULT_ANALYSIS_JOB_STALE_AFTER_SECONDS = 6 * 60 * 60
ANALYSIS_JOB_SUBMISSION_LOCK = threading.Lock()


class AnalysisJobBusyError(RuntimeError):
    def __init__(self, active_analysis_job_id: str):
        super().__init__("Another Analysis Job is already active.")
        self.active_analysis_job_id = active_analysis_job_id


@dataclass(frozen=True)
class AnalysisStageArtifact:
    key: str
    role: str
    content_type: str
    retention_class: str
    byte_size: int | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class AnalysisStageResult:
    artifacts: list[AnalysisStageArtifact] = field(default_factory=list)


@dataclass(frozen=True)
class AnalysisStageRequest:
    analysis_job_id: str
    analysis_result_dir: Path
    analysis_result_id: str
    data_root: Path
    embedding_plan: RecipeEmbeddingReusePlan
    recipe: AnalysisRecipe
    resolved_scope: ResolvedAnalysisScope
    scope_snapshot: AnalysisScopeSnapshot
    sibling_group_id: str
    stage_name: str


class AnalysisStageRunner(Protocol):
    def run_stage(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        ...


class UnavailableAnalysisStageRunner:
    def run_stage(self, request: AnalysisStageRequest) -> AnalysisStageResult:
        raise RuntimeError(
            "No production AnalysisStageRunner is configured for "
            f"{request.stage_name}."
        )


@dataclass(frozen=True)
class AnalysisJobSummary:
    analysis_job_id: str
    analysis_result_ids: list[str]
    manifest_path: Path
    recipe_ids: list[str]
    scope_snapshot_id: str
    sibling_group_id: str
    status: str


def submit_analysis_job(
    *,
    database_path: Path,
    data_root: Path,
    collection_slugs: Sequence[str],
    stage_runner: AnalysisStageRunner,
    recipe_ids: Sequence[str] | None = None,
    created_at: datetime | None = None,
    stale_after_seconds: int = DEFAULT_ANALYSIS_JOB_STALE_AFTER_SECONDS,
) -> AnalysisJobSummary:
    with ANALYSIS_JOB_SUBMISSION_LOCK:
        return _submit_analysis_job_unlocked(
            database_path=database_path,
            data_root=data_root,
            collection_slugs=collection_slugs,
            stage_runner=stage_runner,
            recipe_ids=recipe_ids,
            created_at=created_at,
            stale_after_seconds=stale_after_seconds,
        )


def _submit_analysis_job_unlocked(
    *,
    database_path: Path,
    data_root: Path,
    collection_slugs: Sequence[str],
    stage_runner: AnalysisStageRunner,
    recipe_ids: Sequence[str] | None = None,
    created_at: datetime | None = None,
    stale_after_seconds: int = DEFAULT_ANALYSIS_JOB_STALE_AFTER_SECONDS,
) -> AnalysisJobSummary:
    created = created_at or datetime.now(timezone.utc)
    recover_stale_analysis_jobs(
        data_root=data_root,
        now=created,
        stale_after_seconds=stale_after_seconds,
    )
    active_manifest = get_active_analysis_job_manifest_path(data_root)
    if active_manifest is not None:
        active_manifest_payload = _read_json(active_manifest)
        active_analysis_job_id = str(
            active_manifest_payload.get("analysis_job_id", active_manifest.parent.name)
        )
        raise AnalysisJobBusyError(active_analysis_job_id)

    created_timestamp = _format_timestamp(created)
    compact_timestamp = _compact_timestamp(created_timestamp)
    resolved_data_root = data_root.expanduser().resolve()
    selected_recipes = select_analysis_recipes(recipe_ids)
    recipe_id_values = [recipe.recipe_id for recipe in selected_recipes]
    analysis_job_id = f"analysis-job-{compact_timestamp}"
    sibling_group_id = f"analysis-sibling-{compact_timestamp}"
    job_dir = resolved_data_root / "analysis-jobs" / analysis_job_id
    job_manifest_path = job_dir / ANALYSIS_JOB_MANIFEST_NAME
    job_dir.mkdir(parents=True, exist_ok=True)

    resolved_scope = resolve_analysis_scope(
        database_path=database_path,
        collection_slugs=collection_slugs,
    )
    scope_snapshot = save_analysis_scope_snapshot(
        data_root=resolved_data_root,
        resolved_scope=resolved_scope,
        created_at=created,
    )
    _write_json(
        job_manifest_path,
        _analysis_job_manifest(
            analysis_job_id=analysis_job_id,
            analysis_result_ids=[],
            created_at=created_timestamp,
            recipe_ids=recipe_id_values,
            scope_snapshot=scope_snapshot,
            sibling_group_id=sibling_group_id,
            stages=[],
            status="running",
            data_root=resolved_data_root,
        ),
    )

    worker = threading.Thread(
        target=_execute_submitted_analysis_job,
        kwargs={
            "database_path": database_path,
            "data_root": resolved_data_root,
            "collection_slugs": list(collection_slugs),
            "stage_runner": stage_runner,
            "recipe_ids": recipe_id_values,
            "created_at": created,
            "job_manifest_path": job_manifest_path,
        },
        daemon=True,
        name=f"anacronia-{analysis_job_id}",
    )
    worker.start()
    return AnalysisJobSummary(
        analysis_job_id=analysis_job_id,
        analysis_result_ids=[],
        manifest_path=job_manifest_path,
        recipe_ids=recipe_id_values,
        scope_snapshot_id=scope_snapshot.snapshot_id,
        sibling_group_id=sibling_group_id,
        status="running",
    )


def run_analysis_job(
    *,
    database_path: Path,
    data_root: Path,
    collection_slugs: Sequence[str],
    stage_runner: AnalysisStageRunner,
    recipe_ids: Sequence[str] | None = None,
    created_at: datetime | None = None,
    skip_active_job_check: bool = False,
) -> AnalysisJobSummary:
    created = created_at or datetime.now(timezone.utc)
    created_timestamp = _format_timestamp(created)
    compact_timestamp = _compact_timestamp(created_timestamp)
    resolved_data_root = data_root.expanduser().resolve()
    if not skip_active_job_check:
        recover_stale_analysis_jobs(data_root=resolved_data_root, now=created)
        active_manifest = get_active_analysis_job_manifest_path(resolved_data_root)
        if active_manifest is not None:
            active_manifest_payload = _read_json(active_manifest)
            active_analysis_job_id = str(
                active_manifest_payload.get(
                    "analysis_job_id",
                    active_manifest.parent.name,
                )
            )
            raise AnalysisJobBusyError(active_analysis_job_id)

    selected_recipes = select_analysis_recipes(recipe_ids)
    recipe_id_values = [recipe.recipe_id for recipe in selected_recipes]
    analysis_job_id = f"analysis-job-{compact_timestamp}"
    sibling_group_id = f"analysis-sibling-{compact_timestamp}"
    job_dir = resolved_data_root / "analysis-jobs" / analysis_job_id
    job_manifest_path = job_dir / ANALYSIS_JOB_MANIFEST_NAME
    job_dir.mkdir(parents=True, exist_ok=True)

    stages: list[dict[str, object]] = []
    analysis_result_ids: list[str] = []
    failed_recipe_count = 0
    status = "ready"
    scope_snapshot: AnalysisScopeSnapshot | None = None

    def persist_job_manifest(*, status_value: str) -> None:
        _write_json(
            job_manifest_path,
            _analysis_job_manifest(
                analysis_job_id=analysis_job_id,
                analysis_result_ids=analysis_result_ids,
                created_at=created_timestamp,
                recipe_ids=recipe_id_values,
                scope_snapshot=scope_snapshot,
                sibling_group_id=sibling_group_id,
                stages=stages,
                status=status_value,
                data_root=resolved_data_root,
            ),
        )

    resolved_scope = resolve_analysis_scope(
        database_path=database_path,
        collection_slugs=collection_slugs,
    )
    scope_snapshot = save_analysis_scope_snapshot(
        data_root=resolved_data_root,
        resolved_scope=resolved_scope,
        created_at=created,
    )
    stages.append(
        _stage_record(
            stage_name="scope_snapshot",
            status="ready",
            output_artifact_count=1,
            started_at=created_timestamp,
        )
    )
    persist_job_manifest(status_value="running")

    embedding_reuse_plan = plan_image_embedding_reuse(
        data_root=resolved_data_root,
        resolved_scope=resolved_scope,
        recipes=selected_recipes,
    )
    stages.append(
        _stage_record(
            stage_name="embedding_planning",
            status="ready",
            output_counts={
                "missing_embeddings": embedding_reuse_plan.total_missing_embeddings,
                "reusable_embeddings": embedding_reuse_plan.total_reusable_embeddings,
            },
            started_at=created_timestamp,
        )
    )
    persist_job_manifest(status_value="running")

    for recipe in selected_recipes:
        analysis_result_id = f"analysis-result-{compact_timestamp}-{recipe.recipe_id}"
        result_dir = resolved_data_root / "analysis-results" / analysis_result_id
        result_dir.mkdir(parents=True, exist_ok=True)
        recipe_plan = embedding_reuse_plan.recipe_plans[recipe.recipe_id]
        artifacts = _write_latent_map_run_contract(
            data_root=resolved_data_root,
            result_dir=result_dir,
            run_id=analysis_result_id,
            resolved_scope=resolved_scope,
            recipe=recipe,
        )
        recipe_failed = False

        for stage_name in ANALYSIS_JOB_STAGE_NAMES:
            stage_started = time.perf_counter()
            try:
                stage_result = stage_runner.run_stage(
                    AnalysisStageRequest(
                        analysis_job_id=analysis_job_id,
                        analysis_result_dir=result_dir,
                        analysis_result_id=analysis_result_id,
                        data_root=resolved_data_root,
                        embedding_plan=recipe_plan,
                        recipe=recipe,
                        resolved_scope=resolved_scope,
                        scope_snapshot=scope_snapshot,
                        sibling_group_id=sibling_group_id,
                        stage_name=stage_name,
                    )
                )
            except Exception as error:
                failed_recipe_count += 1
                status = "failed" if not analysis_result_ids else "partial_failed"
                recipe_failed = True
                stages.append(
                    _stage_record(
                        stage_name=stage_name,
                        status="failed",
                        error=str(error),
                        elapsed_ms=_elapsed_ms(stage_started),
                        recipe_id=recipe.recipe_id,
                    )
                )
                persist_job_manifest(status_value=status)
                break

            normalized_artifacts = [
                _normalize_stage_artifact(artifact, result_dir=result_dir)
                for artifact in stage_result.artifacts
            ]
            artifacts.extend(normalized_artifacts)
            stages.append(
                _stage_record(
                    stage_name=stage_name,
                    status="ready",
                    elapsed_ms=_elapsed_ms(stage_started),
                    output_artifact_count=len(normalized_artifacts),
                    recipe_id=recipe.recipe_id,
                )
            )
            persist_job_manifest(status_value="running")

        if recipe_failed:
            continue

        result_manifest = _build_analysis_result_manifest(
            analysis_job_id=analysis_job_id,
            analysis_result_id=analysis_result_id,
            artifacts=artifacts,
            created_at=created_timestamp,
            recipe=recipe,
            recipe_plan=recipe_plan,
            resolved_scope=resolved_scope,
            scope_snapshot=scope_snapshot,
            sibling_group_id=sibling_group_id,
        )
        _write_json(result_dir / ANALYSIS_RESULT_MANIFEST_NAME, result_manifest)
        analysis_result_ids.append(analysis_result_id)
        stages.append(
            _stage_record(
                stage_name="result_registration",
                status="ready",
                output_artifact_count=1,
                recipe_id=recipe.recipe_id,
                started_at=created_timestamp,
            )
        )
        persist_job_manifest(status_value="running")

    if failed_recipe_count > 0:
        status = "partial_failed" if analysis_result_ids else "failed"
    persist_job_manifest(status_value=status)
    return AnalysisJobSummary(
        analysis_job_id=analysis_job_id,
        analysis_result_ids=analysis_result_ids,
        manifest_path=job_manifest_path,
        recipe_ids=recipe_id_values,
        scope_snapshot_id=scope_snapshot.snapshot_id if scope_snapshot else "",
        sibling_group_id=sibling_group_id,
        status=status,
    )


def _execute_submitted_analysis_job(
    *,
    database_path: Path,
    data_root: Path,
    collection_slugs: Sequence[str],
    stage_runner: AnalysisStageRunner,
    recipe_ids: Sequence[str],
    created_at: datetime,
    job_manifest_path: Path,
) -> None:
    try:
        run_analysis_job(
            database_path=database_path,
            data_root=data_root,
            collection_slugs=collection_slugs,
            recipe_ids=recipe_ids,
            stage_runner=stage_runner,
            created_at=created_at,
            skip_active_job_check=True,
        )
    except Exception as error:
        _mark_analysis_job_failed(
            manifest_path=job_manifest_path,
            error=f"Analysis Job failed before runtime stages: {error}",
        )


def get_active_analysis_job_manifest_path(data_root: Path) -> Path | None:
    for manifest_path in _list_analysis_job_manifest_paths(data_root):
        try:
            manifest = _read_json(manifest_path)
        except (OSError, json.JSONDecodeError):
            continue
        if str(manifest.get("status")) in ANALYSIS_JOB_ACTIVE_STATUSES:
            return manifest_path
    return None


def recover_stale_analysis_jobs(
    *,
    data_root: Path,
    now: datetime | None = None,
    stale_after_seconds: int = DEFAULT_ANALYSIS_JOB_STALE_AFTER_SECONDS,
) -> list[Path]:
    current = now or datetime.now(timezone.utc)
    recovered: list[Path] = []
    for manifest_path in _list_analysis_job_manifest_paths(data_root):
        try:
            manifest = _read_json(manifest_path)
        except (OSError, json.JSONDecodeError):
            continue
        if str(manifest.get("status")) not in ANALYSIS_JOB_ACTIVE_STATUSES:
            continue
        created_at = _parse_datetime(str(manifest.get("created_at", "")))
        if created_at is None:
            continue
        if (current - created_at).total_seconds() <= stale_after_seconds:
            continue
        _mark_analysis_job_failed(
            manifest_path=manifest_path,
            error="Analysis Job was marked failed after stale running state.",
        )
        recovered.append(manifest_path)
    return recovered


def _analysis_job_manifest(
    *,
    analysis_job_id: str,
    analysis_result_ids: Sequence[str],
    created_at: str,
    recipe_ids: Sequence[str],
    scope_snapshot: AnalysisScopeSnapshot | None,
    sibling_group_id: str,
    stages: Sequence[dict[str, object]],
    status: str,
    data_root: Path,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "schema_version": 1,
        "asset_kind": "analysis-job",
        "analysis_job_id": analysis_job_id,
        "analysis_result_ids": list(analysis_result_ids),
        "created_at": created_at,
        "recipe_ids": list(recipe_ids),
        "sibling_group_id": sibling_group_id,
        "stages": list(stages),
        "status": status,
    }
    if scope_snapshot is not None:
        payload["scope_snapshot"] = {
            "snapshot_id": scope_snapshot.snapshot_id,
            "snapshot_key": _relative_key(
                scope_snapshot.snapshot_path,
                data_root,
            ),
            "item_count": scope_snapshot.item_count,
            "counts": scope_snapshot.counts,
        }
    return payload


def _mark_analysis_job_failed(*, manifest_path: Path, error: str) -> None:
    try:
        manifest = _read_json(manifest_path)
    except (OSError, json.JSONDecodeError):
        return
    stages = list(manifest.get("stages", []))
    stages.append(
        _stage_record(
            stage_name="job_runtime",
            status="failed",
            error=error,
        )
    )
    manifest["stages"] = stages
    manifest["status"] = "failed"
    _write_json(manifest_path, manifest)


def _build_analysis_result_manifest(
    *,
    analysis_job_id: str,
    analysis_result_id: str,
    artifacts: list[AnalysisStageArtifact],
    created_at: str,
    recipe: AnalysisRecipe,
    recipe_plan: RecipeEmbeddingReusePlan,
    resolved_scope: ResolvedAnalysisScope,
    scope_snapshot: AnalysisScopeSnapshot,
    sibling_group_id: str,
) -> dict[str, object]:
    artifact_payloads = [_artifact_payload(artifact) for artifact in artifacts]
    manifest = {
        "schema_version": 1,
        "asset_kind": "analysis-result-manifest",
        "analysis_kind": "latent-map",
        "analysis_job_id": analysis_job_id,
        "analysis_result_id": analysis_result_id,
        "created_at": created_at,
        "embedding_reuse": {
            "missing_count": len(recipe_plan.missing_items),
            "reusable_count": len(recipe_plan.reusable),
            "reusable_image_embedding_result_ids": [
                result.image_embedding_result_id for result in recipe_plan.reusable
            ],
        },
        "item_count": resolved_scope.item_count,
        "output_counts": {
            "artifacts": analysis_result_artifact_counts(artifact_payloads),
        },
        "recipes": [
            {
                "recipe_name": recipe.recipe_id,
                "recipe": recipe.to_provenance_payload(),
                "artifact_keys": _recipe_artifact_keys(artifacts),
            }
        ],
        "source": {
            "kind": "analysis-scope-snapshot",
            "source_folder_name": _source_label(resolved_scope),
        },
        "scope_snapshot": {
            "counts": scope_snapshot.counts,
            "item_count": scope_snapshot.item_count,
            "snapshot_id": scope_snapshot.snapshot_id,
            "snapshot_key": _relative_key(
                scope_snapshot.snapshot_path,
                scope_snapshot.snapshot_path.parents[2],
            ),
        },
        "sibling_group_id": sibling_group_id,
        "status": "ready",
        "artifacts": artifact_payloads,
        "explorer_readiness": analysis_result_explorer_readiness(
            artifacts=artifact_payloads,
        ),
        "staleness": {
            "added_image_count": 0,
            "removed_image_count": 0,
            "state": "current",
        },
        "export_safety": {
            "contains_local_absolute_paths": False,
            "contains_secrets": False,
            "contains_temporary_paths": False,
        },
        "viewer": {
            "open_href": f"/latent-map?analysisResultId={analysis_result_id}",
        },
    }
    assert_analysis_result_manifest_contract(manifest)
    return manifest


def _write_latent_map_run_contract(
    *,
    data_root: Path,
    result_dir: Path,
    run_id: str,
    resolved_scope: ResolvedAnalysisScope,
    recipe: AnalysisRecipe,
) -> list[AnalysisStageArtifact]:
    for directory in (
        "clusters",
        "embeddings",
        "indexes",
        "layouts",
        "previews",
        "thumbnails",
        "viewer",
    ):
        (result_dir / directory).mkdir(parents=True, exist_ok=True)

    config_path = result_dir / "config.json"
    config = {
        "schema_version": 1,
        "analysis_kind": "latent-map",
        "run_id": run_id,
        "source_folder": _source_label(resolved_scope),
        "preprocessing": {
            "recipes": [
                {
                    "name": recipe.recipe_id,
                    "family": recipe.model_family,
                    "model_id": recipe.model_id,
                    "long_edge": recipe.input_size,
                }
            ],
        },
    }
    _write_json(config_path, config)
    report_path = result_dir / "report.md"
    report_path.write_text(
        "\n".join(
            [
                f"# Latent Map Run: {run_id}",
                "",
                "Status: materialized from Analysis Scope",
                "",
                f"Source: {_source_label(resolved_scope)}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    manifest_path = result_dir / "manifest.jsonl"
    rows = []
    derivative_artifacts: list[AnalysisStageArtifact] = []
    for item in _scope_items(resolved_scope):
        image_asset_id = int(item["image_asset_id"])
        display = item.get("display", {})
        if not isinstance(display, dict):
            display = {}
        derivatives = item.get("derivatives", {})
        if not isinstance(derivatives, dict):
            derivatives = {}
        standard_key = _derivative_artifact_key(
            derivatives=derivatives,
            derivative="standard-1024",
        )
        thumb_key = _derivative_artifact_key(
            derivatives=derivatives,
            derivative="thumb-256",
        )
        image_id = f"image-asset-{image_asset_id}"
        preview_key = f"previews/{image_id}.jpg"
        thumbnail_key = f"thumbnails/{image_id}.jpg"
        _link_or_copy_file(
            source_path=data_root / standard_key,
            destination_path=result_dir / preview_key,
        )
        _link_or_copy_file(
            source_path=data_root / thumb_key,
            destination_path=result_dir / thumbnail_key,
        )
        rows.append(
            {
                "height": int(display.get("original_height", 0) or 0),
                "image_id": image_id,
                "image_asset_id": image_asset_id,
                "preview_path": preview_key,
                "relative_path": f"{image_id}.jpg",
                "source_derivative_key": standard_key,
                "source_path": preview_key,
                "thumbnail_path": thumbnail_key,
                "width": int(display.get("original_width", 0) or 0),
            }
        )
        derivative_artifacts.extend(
            [
                _artifact_for_file(
                    key=thumbnail_key,
                    result_dir=result_dir,
                    role="generated-thumbnail",
                    content_type="image/jpeg",
                    retention_class="render-cache",
                ),
                _artifact_for_file(
                    key=preview_key,
                    result_dir=result_dir,
                    role="generated-preview",
                    content_type="image/jpeg",
                    retention_class="render-cache",
                ),
            ]
        )
    manifest_path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    return [
        _artifact_for_file(
            key="config.json",
            result_dir=result_dir,
            role="run-config",
            content_type="application/json",
            retention_class="durable",
        ),
        _artifact_for_file(
            key="report.md",
            result_dir=result_dir,
            role="analysis-report",
            content_type="text/markdown",
            retention_class="durable",
        ),
        _artifact_for_file(
            key="manifest.jsonl",
            result_dir=result_dir,
            role="image-manifest",
            content_type="application/x-jsonlines",
            retention_class="durable",
        ),
        *derivative_artifacts,
    ]


def _normalize_stage_artifact(
    artifact: AnalysisStageArtifact,
    *,
    result_dir: Path,
) -> AnalysisStageArtifact:
    key = artifact.key.strip()
    if not key or _is_unsafe_artifact_key(key):
        raise ValueError("Analysis stage artifact keys must be relative artifact keys.")
    artifact_path = result_dir / key
    byte_size = artifact.byte_size
    if byte_size is None and artifact_path.is_file():
        byte_size = artifact_path.stat().st_size
    return AnalysisStageArtifact(
        key=key,
        role=artifact.role,
        content_type=artifact.content_type,
        retention_class=artifact.retention_class,
        byte_size=byte_size,
        metadata=dict(artifact.metadata),
    )


def _recipe_artifact_keys(artifacts: list[AnalysisStageArtifact]) -> dict[str, object]:
    artifact_keys: dict[str, object] = {}
    layouts: list[dict[str, str]] = []
    clusters: list[dict[str, str]] = []
    thumbnail_atlas_manifests: dict[str, str] = {}

    for artifact in artifacts:
        if artifact.role == "image-manifest":
            artifact_keys["image_manifest"] = artifact.key
        elif artifact.role == "embedding":
            artifact_keys["embedding_vectors"] = artifact.key
        elif artifact.role == "faiss-index":
            artifact_keys["faiss_index"] = artifact.key
        elif artifact.role == "faiss-id-map":
            artifact_keys["faiss_id_map"] = artifact.key
            artifact_keys["vector_id_map"] = artifact.key
        elif artifact.role == "layout":
            layouts.append(
                {
                    "key": artifact.key,
                    "layout_id": str(
                        artifact.metadata.get("layout_id", Path(artifact.key).stem)
                    ),
                }
            )
        elif artifact.role == "cluster-result":
            clusters.append(
                {
                    "cluster_id": str(
                        artifact.metadata.get("cluster_id", Path(artifact.key).stem)
                    ),
                    "key": artifact.key,
                }
            )
        elif artifact.role == "thumbnail-atlas":
            tile_size = _atlas_tile_size(artifact.key)
            if tile_size:
                thumbnail_atlas_manifests[tile_size] = artifact.key

    if clusters:
        artifact_keys["clusters"] = clusters
    if layouts:
        artifact_keys["layouts"] = layouts
    if thumbnail_atlas_manifests:
        artifact_keys["thumbnail_atlas_manifests"] = dict(
            sorted(thumbnail_atlas_manifests.items(), key=lambda item: int(item[0]))
        )
        artifact_keys["baseline_atlas_manifest"] = (
            thumbnail_atlas_manifests.get("32")
            or next(iter(artifact_keys["thumbnail_atlas_manifests"].values()))
        )

    return artifact_keys


def _artifact_payload(artifact: AnalysisStageArtifact) -> dict[str, object]:
    payload: dict[str, object] = {
        "key": artifact.key,
        "role": artifact.role,
        "content_type": artifact.content_type,
        "retention_class": artifact.retention_class,
    }
    payload["required"] = analysis_result_artifact_required(payload)
    if artifact.byte_size is not None:
        payload["byte_size"] = artifact.byte_size
    if artifact.metadata:
        payload["metadata"] = artifact.metadata
    return payload


def _stage_record(
    *,
    stage_name: str,
    status: str,
    elapsed_ms: int = 0,
    error: str | None = None,
    output_artifact_count: int = 0,
    output_counts: dict[str, int] | None = None,
    recipe_id: str | None = None,
    started_at: str | None = None,
) -> dict[str, object]:
    record: dict[str, object] = {
        "stage_name": stage_name,
        "status": status,
        "elapsed_ms": elapsed_ms,
        "output_artifact_count": output_artifact_count,
    }
    if error:
        record["error"] = error
    if output_counts is not None:
        record["output_counts"] = output_counts
    if recipe_id:
        record["recipe_id"] = recipe_id
    if started_at:
        record["started_at"] = started_at
        record["completed_at"] = started_at
    return record


def _source_label(resolved_scope: ResolvedAnalysisScope) -> str:
    scope = resolved_scope.payload.get("scope", {})
    collection_slugs = []
    if isinstance(scope, dict):
        raw_slugs = scope.get("collection_slugs", [])
        if isinstance(raw_slugs, list):
            collection_slugs = [str(slug) for slug in raw_slugs]

    labels: list[str] = []
    for item in _scope_items(resolved_scope):
        contributing_collections = item.get("contributing_collections", [])
        if not isinstance(contributing_collections, list):
            continue
        for collection in contributing_collections:
            if not isinstance(collection, dict):
                continue
            label = str(collection.get("display_name") or collection.get("slug") or "")
            if label and label not in labels:
                labels.append(label)

    if labels:
        return ", ".join(labels)
    if collection_slugs:
        return ", ".join(collection_slugs)
    return "Analysis Scope"


def _scope_items(resolved_scope: ResolvedAnalysisScope) -> list[dict[str, object]]:
    items = resolved_scope.payload.get("items", [])
    if not isinstance(items, list):
        raise ValueError("Resolved Analysis Scope payload has invalid items.")
    return [item for item in items if isinstance(item, dict)]


def _derivative_artifact_key(
    *,
    derivatives: dict[object, object],
    derivative: str,
) -> str:
    derivative_payload = derivatives.get(derivative, {})
    if not isinstance(derivative_payload, dict):
        raise ValueError(f"Analysis Scope item is missing {derivative}.")
    artifact_key = str(derivative_payload.get("artifact_key", "")).strip()
    if not artifact_key or _is_unsafe_artifact_key(artifact_key):
        raise ValueError(f"Analysis Scope item has an invalid {derivative} key.")
    return artifact_key


def _link_or_copy_file(*, source_path: Path, destination_path: Path) -> None:
    if not source_path.is_file():
        raise ValueError(f"Analysis Scope derivative not found: {source_path}")
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if destination_path.exists():
        destination_path.unlink()
    try:
        os.link(source_path, destination_path)
    except OSError:
        shutil.copy2(source_path, destination_path)


def _artifact_for_file(
    *,
    key: str,
    result_dir: Path,
    role: str,
    content_type: str,
    retention_class: str,
    metadata: dict[str, object] | None = None,
) -> AnalysisStageArtifact:
    path = result_dir / key
    return AnalysisStageArtifact(
        key=key,
        role=role,
        content_type=content_type,
        retention_class=retention_class,
        byte_size=path.stat().st_size if path.is_file() else None,
        metadata=metadata or {},
    )


def _atlas_tile_size(key: str) -> str:
    parts = key.split("/")
    if len(parts) >= 4 and parts[-1] == "atlas-manifest.json":
        tile = parts[-2]
        if tile.endswith("px") and tile[:-2].isdigit():
            return tile[:-2]
    return ""


def _is_unsafe_artifact_key(artifact_key: str) -> bool:
    path = Path(artifact_key)
    return path.is_absolute() or ".." in path.parts


def _relative_key(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _elapsed_ms(start: float) -> int:
    return max(0, round((time.perf_counter() - start) * 1000))


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _read_json(path: Path) -> dict[str, object]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object in {path}.")
    return payload


def _list_analysis_job_manifest_paths(data_root: Path) -> list[Path]:
    jobs_root = data_root.expanduser().resolve() / "analysis-jobs"
    if not jobs_root.is_dir():
        return []
    return sorted(
        jobs_root.glob(f"*/{ANALYSIS_JOB_MANIFEST_NAME}"),
        key=lambda path: path.parent.name,
        reverse=True,
    )


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _compact_timestamp(timestamp: str) -> str:
    return timestamp.replace("-", "").replace(":", "")
