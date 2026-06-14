from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Protocol, Sequence

from anacronia.analysis_recipes import AnalysisRecipe, select_analysis_recipes
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
ANALYSIS_JOB_STAGE_NAMES = (
    "embedding_computation",
    "faiss",
    "umap",
    "clustering",
    "baseline_atlas",
)


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


def run_analysis_job(
    *,
    database_path: Path,
    data_root: Path,
    collection_slugs: Sequence[str],
    stage_runner: AnalysisStageRunner,
    recipe_ids: Sequence[str] | None = None,
    created_at: datetime | None = None,
) -> AnalysisJobSummary:
    created = created_at or datetime.now(timezone.utc)
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

    stages: list[dict[str, object]] = []
    analysis_result_ids: list[str] = []
    status = "ready"

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

    for recipe in selected_recipes:
        analysis_result_id = f"analysis-result-{compact_timestamp}-{recipe.recipe_id}"
        result_dir = resolved_data_root / "analysis-results" / analysis_result_id
        result_dir.mkdir(parents=True, exist_ok=True)
        recipe_plan = embedding_reuse_plan.recipe_plans[recipe.recipe_id]
        artifacts = [_write_image_manifest(result_dir, resolved_scope)]
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
                stage_name="analysis_result",
                status="ready",
                output_artifact_count=1,
                recipe_id=recipe.recipe_id,
                started_at=created_timestamp,
            )
        )

    job_manifest = {
        "schema_version": 1,
        "asset_kind": "analysis-job",
        "analysis_job_id": analysis_job_id,
        "analysis_result_ids": analysis_result_ids,
        "created_at": created_timestamp,
        "recipe_ids": recipe_id_values,
        "scope_snapshot": {
            "snapshot_id": scope_snapshot.snapshot_id,
            "snapshot_key": _relative_key(
                scope_snapshot.snapshot_path,
                resolved_data_root,
            ),
            "item_count": scope_snapshot.item_count,
            "counts": scope_snapshot.counts,
        },
        "sibling_group_id": sibling_group_id,
        "stages": stages,
        "status": status,
    }
    _write_json(job_manifest_path, job_manifest)
    return AnalysisJobSummary(
        analysis_job_id=analysis_job_id,
        analysis_result_ids=analysis_result_ids,
        manifest_path=job_manifest_path,
        recipe_ids=recipe_id_values,
        scope_snapshot_id=scope_snapshot.snapshot_id,
        sibling_group_id=sibling_group_id,
        status=status,
    )


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
    return {
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
        "viewer": {
            "open_href": f"/latent-map?analysisResultId={analysis_result_id}",
        },
    }


def _write_image_manifest(
    result_dir: Path,
    resolved_scope: ResolvedAnalysisScope,
) -> AnalysisStageArtifact:
    manifest_path = result_dir / "manifest.jsonl"
    rows = []
    for item in _scope_items(resolved_scope):
        image_asset_id = int(item["image_asset_id"])
        display = item.get("display", {})
        if not isinstance(display, dict):
            display = {}
        rows.append(
            {
                "height": int(display.get("original_height", 0) or 0),
                "image_id": f"image-asset-{image_asset_id}",
                "image_asset_id": image_asset_id,
                "width": int(display.get("original_width", 0) or 0),
            }
        )
    manifest_path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    return AnalysisStageArtifact(
        key="manifest.jsonl",
        role="image-manifest",
        content_type="application/x-jsonlines",
        retention_class="durable",
        byte_size=manifest_path.stat().st_size,
    )


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


def _format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _compact_timestamp(timestamp: str) -> str:
    return timestamp.replace("-", "").replace(":", "")
