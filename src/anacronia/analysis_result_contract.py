"""Canonical Analysis Result manifest checks and browser-safe projections."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import PurePosixPath
import re
from typing import Any


REQUIRED_MANIFEST_FIELDS = (
    "analysis_kind",
    "analysis_result_id",
    "asset_kind",
    "created_at",
    "item_count",
    "recipes",
    "schema_version",
    "status",
)
REQUIRED_NEW_RESULT_FIELDS = (
    "analysis_job_id",
    "artifacts",
    "explorer_readiness",
    "export_safety",
    "output_counts",
    "scope_snapshot",
    "sibling_group_id",
    "staleness",
    "viewer",
)
RETENTION_CLASSES = {"durable", "render-cache", "viewer-cache"}
LOCAL_PATH_PATTERNS = (
    re.compile(r"^file://", re.IGNORECASE),
    re.compile(r"^/[Uu]sers/"),
    re.compile(r"^/private/"),
    re.compile(r"^/tmp/"),
    re.compile(r"^/var/folders/"),
    re.compile(r"^[A-Za-z]:\\"),
)


class AnalysisResultContractError(ValueError):
    pass


def assert_analysis_result_manifest_contract(manifest: Mapping[str, Any]) -> None:
    if manifest.get("asset_kind") != "analysis-result-manifest":
        raise AnalysisResultContractError(
            "Analysis Result manifest must use asset_kind analysis-result-manifest."
        )

    _require_fields(manifest, REQUIRED_MANIFEST_FIELDS, "manifest")
    if _is_new_result_manifest(manifest):
        _require_fields(manifest, REQUIRED_NEW_RESULT_FIELDS, "manifest")

    artifacts = _manifest_artifacts(manifest)
    for index, artifact in enumerate(artifacts):
        _assert_artifact_contract(artifact, index=index)

    _assert_no_local_path_leaks(manifest)
    _assert_no_local_path_leaks(browser_safe_analysis_result_summary(manifest))


def browser_safe_analysis_result_summary(
    manifest: Mapping[str, Any],
) -> dict[str, object]:
    artifacts = _manifest_artifacts(manifest)
    recipe_names = [
        str(recipe.get("recipe_name", ""))
        for recipe in _manifest_records(manifest.get("recipes"))
        if recipe.get("recipe_name")
    ]
    viewer = manifest.get("viewer", {})
    if not isinstance(viewer, Mapping):
        viewer = {}

    return {
        "analysis_kind": str(manifest.get("analysis_kind", "")),
        "analysis_result_id": str(manifest.get("analysis_result_id", "")),
        "artifact_counts": analysis_result_artifact_counts(artifacts),
        "artifacts": [
            {
                "byte_size": artifact.get("byte_size"),
                "content_type": str(artifact.get("content_type", "")),
                "key": str(artifact.get("key", "")),
                "required": analysis_result_artifact_required(artifact),
                "retention_class": str(artifact.get("retention_class", "")),
                "role": str(artifact.get("role", "")),
            }
            for artifact in artifacts
        ],
        "explorer_readiness": manifest.get(
            "explorer_readiness",
            analysis_result_explorer_readiness(artifacts=artifacts),
        ),
        "export_safety": manifest.get("export_safety", {}),
        "item_count": int(manifest.get("item_count", 0) or 0),
        "recipe_names": recipe_names,
        "status": str(manifest.get("status", "")),
        "staleness": manifest.get("staleness", {}),
        "viewer": {
            "open_href": str(viewer.get("open_href", "")),
        },
    }


def analysis_result_artifact_counts(
    artifacts: Sequence[Mapping[str, Any]],
) -> dict[str, int]:
    counts = {"durable": 0, "render-cache": 0, "total": len(artifacts)}
    for artifact in artifacts:
        retention_class = str(artifact.get("retention_class", ""))
        if retention_class == "render-cache":
            counts["render-cache"] += 1
        else:
            counts["durable"] += 1
    return counts


def analysis_result_explorer_readiness(
    *,
    artifacts: Sequence[Mapping[str, Any]],
    existing_artifact_keys: set[str] | None = None,
) -> dict[str, object]:
    required_keys = {
        str(artifact.get("key", ""))
        for artifact in artifacts
        if analysis_result_artifact_required(artifact)
    }
    optional_keys = {
        str(artifact.get("key", ""))
        for artifact in artifacts
        if not analysis_result_artifact_required(artifact)
    }
    if existing_artifact_keys is None:
        missing_required: list[str] = []
        missing_optional: list[str] = []
    else:
        missing_required = sorted(required_keys - existing_artifact_keys)
        missing_optional = sorted(optional_keys - existing_artifact_keys)

    return {
        "missing_optional_artifact_keys": missing_optional,
        "missing_required_artifact_keys": missing_required,
        "ready": len(missing_required) == 0,
    }


def analysis_result_artifact_required(artifact: Mapping[str, Any]) -> bool:
    required = artifact.get("required")
    if isinstance(required, bool):
        return required
    return str(artifact.get("retention_class", "")) != "render-cache"


def _require_fields(
    payload: Mapping[str, Any],
    required_fields: Sequence[str],
    label: str,
) -> None:
    missing = [field for field in required_fields if field not in payload]
    if missing:
        raise AnalysisResultContractError(
            f"{label} is missing required fields: {', '.join(missing)}."
        )


def _is_new_result_manifest(manifest: Mapping[str, Any]) -> bool:
    source = manifest.get("source", {})
    if isinstance(source, Mapping) and source.get("kind") == "legacy-latent-map-run":
        return False
    return True


def _assert_artifact_contract(artifact: Mapping[str, Any], *, index: int) -> None:
    _require_fields(
        artifact,
        ("content_type", "key", "retention_class", "role"),
        f"artifact[{index}]",
    )
    key = str(artifact.get("key", ""))
    if _is_unsafe_artifact_key(key):
        raise AnalysisResultContractError(
            f"artifact[{index}] has unsafe artifact key: {key}."
        )
    if str(artifact.get("retention_class", "")) not in RETENTION_CLASSES:
        raise AnalysisResultContractError(
            f"artifact[{index}] has unsupported retention_class."
        )
    if "required" in artifact and not isinstance(artifact.get("required"), bool):
        raise AnalysisResultContractError(
            f"artifact[{index}] required must be a boolean when present."
        )
    if "byte_size" in artifact:
        byte_size = artifact.get("byte_size")
        if not isinstance(byte_size, int) or byte_size < 0:
            raise AnalysisResultContractError(
                f"artifact[{index}] byte_size must be a non-negative integer."
            )


def _is_unsafe_artifact_key(key: str) -> bool:
    path = PurePosixPath(key)
    return (
        not key
        or "\\" in key
        or key.startswith("/")
        or ".." in path.parts
        or str(path) != key
    )


def _assert_no_local_path_leaks(payload: object) -> None:
    for value in _walk_strings(payload):
        if _looks_like_local_path(value):
            raise AnalysisResultContractError(
                "Browser-safe Analysis Result payload contains a local path."
            )


def _looks_like_local_path(value: str) -> bool:
    return any(pattern.search(value) for pattern in LOCAL_PATH_PATTERNS)


def _manifest_artifacts(manifest: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    return _manifest_records(manifest.get("artifacts"))


def _manifest_records(value: object) -> list[Mapping[str, Any]]:
    if not isinstance(value, list):
        return []
    return [
        item
        for item in value
        if isinstance(item, Mapping)
    ]


def _walk_strings(value: object):
    if isinstance(value, str):
        yield value
    elif isinstance(value, Mapping):
        for nested in value.values():
            yield from _walk_strings(nested)
    elif isinstance(value, list | tuple):
        for nested in value:
            yield from _walk_strings(nested)
