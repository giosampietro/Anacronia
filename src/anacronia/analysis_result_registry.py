from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from anacronia.analysis_result_contract import (
    analysis_result_artifact_counts,
    analysis_result_explorer_readiness,
    assert_analysis_result_manifest_contract,
)
from anacronia.analysis_results import ANALYSIS_RESULT_MANIFEST_NAME
from anacronia.artifact_store import (
    ArtifactState,
    LocalFilesystemArtifactStore,
    validate_artifact_namespace,
)


@dataclass(frozen=True)
class AnalysisResultSummary:
    analysis_result_id: str
    analysis_job_id: str
    sibling_group_id: str
    scope_snapshot_id: str
    scope_label: str
    recipe_ids: list[str]
    recipe_names: list[str]
    item_count: int
    status: str
    result_state: dict[str, object]
    artifact_health: dict[str, object]
    storage_by_role: dict[str, int]
    storage_totals: dict[str, int]
    staleness: dict[str, object]
    explorer_readiness: dict[str, object]
    export_readiness: dict[str, object]

    def to_public_dict(self) -> dict[str, object]:
        return {
            "analysis_job_id": self.analysis_job_id,
            "analysis_result_id": self.analysis_result_id,
            "artifact_health": self.artifact_health,
            "explorer_readiness": self.explorer_readiness,
            "export_readiness": self.export_readiness,
            "item_count": self.item_count,
            "recipe_ids": self.recipe_ids,
            "recipe_names": self.recipe_names,
            "result_state": self.result_state,
            "scope_label": self.scope_label,
            "scope_snapshot_id": self.scope_snapshot_id,
            "sibling_group_id": self.sibling_group_id,
            "status": self.status,
            "staleness": self.staleness,
            "storage_by_role": self.storage_by_role,
            "storage_totals": self.storage_totals,
        }


@dataclass(frozen=True)
class AnalysisResultSiblingGroup:
    sibling_group_id: str
    analysis_job_id: str
    scope_snapshot_id: str
    analysis_result_ids: list[str]
    recipe_ids: list[str]
    recipe_names: list[str]
    status_counts: dict[str, int]

    def to_public_dict(self) -> dict[str, object]:
        return {
            "analysis_job_id": self.analysis_job_id,
            "analysis_result_ids": self.analysis_result_ids,
            "recipe_ids": self.recipe_ids,
            "recipe_names": self.recipe_names,
            "scope_snapshot_id": self.scope_snapshot_id,
            "sibling_group_id": self.sibling_group_id,
            "status_counts": self.status_counts,
        }


@dataclass(frozen=True)
class AnalysisResultValidation:
    analysis_result_id: str
    manifest_valid: bool
    artifact_health: dict[str, object]
    storage_totals: dict[str, int]

    def to_public_dict(self) -> dict[str, object]:
        return {
            "analysis_result_id": self.analysis_result_id,
            "artifact_health": self.artifact_health,
            "manifest_valid": self.manifest_valid,
            "storage_totals": self.storage_totals,
        }


class LocalAnalysisResultRegistry:
    def __init__(self, data_root: Path):
        self.data_root = data_root.expanduser().resolve()
        self.artifact_store = LocalFilesystemArtifactStore(self.data_root)

    def register(self, manifest: dict[str, object]) -> AnalysisResultSummary:
        assert_analysis_result_manifest_contract(manifest)
        analysis_result_id = str(manifest["analysis_result_id"])
        result_dir = self._result_dir(analysis_result_id)
        result_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = result_dir / ANALYSIS_RESULT_MANIFEST_NAME
        manifest_path.write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return self.summarize(analysis_result_id)

    def load(self, analysis_result_id: str) -> dict[str, object]:
        manifest = _with_historical_manifest_defaults(
            _load_json(self._manifest_path(analysis_result_id))
        )
        assert_analysis_result_manifest_contract(manifest)
        return manifest

    def list(self) -> list[AnalysisResultSummary]:
        results_dir = self.data_root / "analysis-results"
        if not results_dir.is_dir():
            return []
        return [
            self.summarize(path.parent.name)
            for path in sorted(results_dir.glob(f"*/{ANALYSIS_RESULT_MANIFEST_NAME}"))
        ]

    def list_sibling_groups(self) -> list[AnalysisResultSiblingGroup]:
        groups: dict[str, list[AnalysisResultSummary]] = {}
        for summary in self.list():
            group_id = summary.sibling_group_id or summary.analysis_result_id
            groups.setdefault(group_id, []).append(summary)

        sibling_groups = [
            _sibling_group(group_id, summaries)
            for group_id, summaries in sorted(groups.items())
        ]
        return sibling_groups

    def validate_result(self, analysis_result_id: str) -> AnalysisResultValidation:
        summary = self.summarize(analysis_result_id)
        return AnalysisResultValidation(
            analysis_result_id=summary.analysis_result_id,
            artifact_health=summary.artifact_health,
            manifest_valid=True,
            storage_totals=summary.storage_totals,
        )

    def summarize(self, analysis_result_id: str) -> AnalysisResultSummary:
        manifest = self.load(analysis_result_id)
        artifacts = _manifest_artifacts(manifest)
        namespace = _analysis_result_namespace(str(manifest["analysis_result_id"]))
        artifact_states = [
            self.artifact_store.stat(
                namespace,
                str(artifact["key"]),
                metadata={
                    "content_type": str(artifact.get("content_type", "")),
                    "retention_class": str(artifact["retention_class"]),
                },
            )
            for artifact in artifacts
        ]
        existing_artifact_keys = {
            state.key for state in artifact_states if state.exists
        }
        artifact_health = _artifact_health(
            artifacts=artifacts,
            existing_artifact_keys=existing_artifact_keys,
        )
        status = str(manifest.get("status", ""))
        explorer_readiness = dict(artifact_health)
        if status != "ready":
            explorer_readiness["ready"] = False
        export_safety = _mapping(manifest.get("export_safety"))

        return AnalysisResultSummary(
            analysis_result_id=str(manifest["analysis_result_id"]),
            analysis_job_id=str(manifest.get("analysis_job_id", "")),
            artifact_health=artifact_health,
            explorer_readiness=explorer_readiness,
            export_readiness={
                "export_safety": export_safety,
                "ready": False,
                "state": "not_validated",
            },
            item_count=int(manifest.get("item_count", 0) or 0),
            recipe_ids=_recipe_ids(manifest),
            recipe_names=_recipe_names(manifest),
            result_state={
                "complete": status == "ready",
                "state": status,
            },
            scope_label=_scope_label(manifest),
            scope_snapshot_id=_scope_snapshot_id(manifest),
            sibling_group_id=str(manifest.get("sibling_group_id", "")),
            status=status,
            staleness=_mapping(manifest.get("staleness")),
            storage_by_role=_storage_by_role(artifacts, artifact_states),
            storage_totals=_storage_totals(artifact_states),
        )

    def _result_dir(self, analysis_result_id: str) -> Path:
        return self.data_root / _analysis_result_namespace(analysis_result_id)

    def _manifest_path(self, analysis_result_id: str) -> Path:
        return self._result_dir(analysis_result_id) / ANALYSIS_RESULT_MANIFEST_NAME


def _analysis_result_namespace(analysis_result_id: str) -> str:
    return validate_artifact_namespace(f"analysis-results/{analysis_result_id}")


def _manifest_artifacts(manifest: dict[str, object]) -> list[dict[str, object]]:
    artifacts = manifest.get("artifacts", [])
    if not isinstance(artifacts, list):
        return []
    return [
        artifact
        for artifact in artifacts
        if isinstance(artifact, dict)
        and artifact.get("key")
        and artifact.get("retention_class")
    ]


def _with_historical_manifest_defaults(
    manifest: dict[str, object],
) -> dict[str, object]:
    normalized = dict(manifest)
    analysis_result_id = str(normalized.get("analysis_result_id", ""))
    artifacts = _manifest_artifacts(normalized)
    normalized.setdefault("analysis_job_id", "")
    normalized.setdefault(
        "explorer_readiness",
        analysis_result_explorer_readiness(artifacts=artifacts),
    )
    normalized.setdefault(
        "export_safety",
        {
            "contains_local_absolute_paths": False,
            "contains_secrets": False,
            "contains_temporary_paths": False,
        },
    )
    normalized.setdefault(
        "output_counts",
        {"artifacts": analysis_result_artifact_counts(artifacts)},
    )
    normalized.setdefault("scope_snapshot", {})
    normalized.setdefault("sibling_group_id", analysis_result_id)
    normalized.setdefault(
        "staleness",
        {
            "added_image_count": 0,
            "removed_image_count": 0,
            "state": "current",
        },
    )
    normalized.setdefault(
        "viewer",
        {"open_href": f"/latent-map?analysisResultId={analysis_result_id}"},
    )
    return normalized


def _mapping(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _recipe_names(manifest: dict[str, object]) -> list[str]:
    recipes = manifest.get("recipes", [])
    if not isinstance(recipes, list):
        return []
    return [
        str(recipe["recipe_name"])
        for recipe in recipes
        if isinstance(recipe, dict) and recipe.get("recipe_name")
    ]


def _recipe_ids(manifest: dict[str, object]) -> list[str]:
    recipes = manifest.get("recipes", [])
    if not isinstance(recipes, list):
        return []
    recipe_ids: list[str] = []
    for recipe in recipes:
        if not isinstance(recipe, dict):
            continue
        recipe_id = str(recipe.get("recipe_id") or recipe.get("recipe_name") or "")
        if recipe_id and recipe_id not in recipe_ids:
            recipe_ids.append(recipe_id)
    return recipe_ids


def _scope_label(manifest: dict[str, object]) -> str:
    source = _mapping(manifest.get("source"))
    label = str(source.get("source_folder_name", "")).strip()
    if label:
        return label
    return "Analysis Result"


def _scope_snapshot_id(manifest: dict[str, object]) -> str:
    scope_snapshot = _mapping(manifest.get("scope_snapshot"))
    return str(scope_snapshot.get("snapshot_id", ""))


def _storage_totals(states: list[ArtifactState]) -> dict[str, int]:
    totals = {"durable": 0, "render-cache": 0, "total": 0, "viewer-cache": 0}
    for state in states:
        if not state.exists:
            continue
        byte_size = int(state.byte_size or 0)
        totals["total"] += byte_size
        retention_class = state.retention_class or "durable"
        if retention_class in totals:
            totals[retention_class] += byte_size
        else:
            totals["durable"] += byte_size
    return totals


def _storage_by_role(
    artifacts: list[dict[str, object]],
    states: list[ArtifactState],
) -> dict[str, int]:
    totals: dict[str, int] = {}
    for artifact, state in zip(artifacts, states, strict=False):
        if not state.exists:
            continue
        role = str(artifact.get("role", "")).strip()
        if not role:
            continue
        totals[role] = totals.get(role, 0) + int(state.byte_size or 0)
    return dict(sorted(totals.items()))


def _sibling_group(
    group_id: str,
    summaries: list[AnalysisResultSummary],
) -> AnalysisResultSiblingGroup:
    ordered = sorted(summaries, key=lambda summary: summary.analysis_result_id)
    status_counts: dict[str, int] = {}
    recipe_ids: list[str] = []
    recipe_names: list[str] = []
    for summary in ordered:
        status_counts[summary.status] = status_counts.get(summary.status, 0) + 1
        for recipe_id in summary.recipe_ids:
            if recipe_id not in recipe_ids:
                recipe_ids.append(recipe_id)
        for recipe_name in summary.recipe_names:
            if recipe_name not in recipe_names:
                recipe_names.append(recipe_name)

    first = ordered[0]
    return AnalysisResultSiblingGroup(
        sibling_group_id=group_id,
        analysis_job_id=first.analysis_job_id,
        scope_snapshot_id=first.scope_snapshot_id,
        analysis_result_ids=[summary.analysis_result_id for summary in ordered],
        recipe_ids=recipe_ids,
        recipe_names=recipe_names,
        status_counts=dict(sorted(status_counts.items())),
    )


def _artifact_health(
    *,
    artifacts: list[dict[str, object]],
    existing_artifact_keys: set[str],
) -> dict[str, object]:
    health = analysis_result_explorer_readiness(
        artifacts=artifacts,
        existing_artifact_keys=existing_artifact_keys,
    )
    health["missing_optional_render_cache_artifact_keys"] = [
        str(artifact["key"])
        for artifact in artifacts
        if str(artifact["retention_class"]) == "render-cache"
        and artifact["key"] not in existing_artifact_keys
        and not bool(artifact.get("required"))
    ]
    return health


def _load_json(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise FileNotFoundError(f"Analysis Result manifest not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))
