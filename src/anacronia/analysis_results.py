from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path


ANALYSIS_RESULT_MANIFEST_NAME = "analysis-result.json"


@dataclass(frozen=True)
class AnalysisResultManifestSummary:
    analysis_result_id: str
    manifest_path: Path
    item_count: int
    artifact_count: int


def wrap_legacy_latent_map_run_as_analysis_result(
    *,
    run_dir: Path,
    wrapped_at: datetime | None = None,
) -> AnalysisResultManifestSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    manifest_path = resolved_run_dir / ANALYSIS_RESULT_MANIFEST_NAME
    if manifest_path.is_file():
        return _summary_from_manifest(manifest_path)

    config = _load_json(resolved_run_dir / "config.json")
    run_id = str(config["run_id"])
    analysis_result_id = f"latent-map-{run_id}"
    manifest_rows = _load_jsonl_if_present(resolved_run_dir / "manifest.jsonl")
    artifacts = _list_legacy_run_artifacts(resolved_run_dir)
    recipes = _summarize_recipes(
        artifacts=artifacts,
        configured_recipe_names=[
            str(recipe["name"])
            for recipe in config.get("preprocessing", {}).get("recipes", [])
            if isinstance(recipe, dict) and recipe.get("name")
        ],
    )
    manifest = {
        "schema_version": 1,
        "asset_kind": "analysis-result-manifest",
        "analysis_kind": "latent-map",
        "analysis_result_id": analysis_result_id,
        "status": "ready" if manifest_rows else "incomplete",
        "created_at": str(config.get("created_at", "")),
        "wrapped_at": _format_timestamp(wrapped_at or datetime.now(timezone.utc)),
        "source": {
            "kind": "legacy-latent-map-run",
            "run_id": run_id,
            "source_folder_name": Path(str(config.get("source_folder", ""))).name,
        },
        "item_count": len(manifest_rows),
        "recipes": recipes,
        "artifacts": artifacts,
        "provenance": {
            "legacy_run_config_schema_version": config.get("schema_version"),
            "wrapper": "legacy-latent-map-run",
        },
    }

    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return AnalysisResultManifestSummary(
        analysis_result_id=analysis_result_id,
        artifact_count=len(artifacts),
        item_count=len(manifest_rows),
        manifest_path=manifest_path,
    )


def _summary_from_manifest(manifest_path: Path) -> AnalysisResultManifestSummary:
    manifest = _load_json(manifest_path)
    return AnalysisResultManifestSummary(
        analysis_result_id=str(manifest["analysis_result_id"]),
        artifact_count=len(manifest.get("artifacts", [])),
        item_count=int(manifest.get("item_count", 0)),
        manifest_path=manifest_path,
    )


def _list_legacy_run_artifacts(run_dir: Path) -> list[dict[str, object]]:
    artifacts = []
    for path in sorted(run_dir.rglob("*")):
        if not path.is_file() or path.name == ANALYSIS_RESULT_MANIFEST_NAME:
            continue
        key = path.relative_to(run_dir).as_posix()
        artifacts.append(
            {
                "key": key,
                "role": _artifact_role(key),
                "content_type": _content_type(key),
                "byte_size": path.stat().st_size,
                "retention_class": _retention_class(key),
            }
        )
    return artifacts


def _summarize_recipes(
    *,
    artifacts: list[dict[str, object]],
    configured_recipe_names: list[str],
) -> list[dict[str, object]]:
    recipe_summaries = []
    for recipe_name in sorted(configured_recipe_names):
        counts = {
            "clusters": _count_recipe_artifacts(
                artifacts=artifacts,
                directory="clusters",
                recipe_name=recipe_name,
            ),
            "embeddings": _count_recipe_artifacts(
                artifacts=artifacts,
                directory="embeddings",
                recipe_name=recipe_name,
            ),
            "indexes": _count_recipe_artifacts(
                artifacts=artifacts,
                directory="indexes",
                recipe_name=recipe_name,
            ),
            "layouts": _count_recipe_artifacts(
                artifacts=artifacts,
                directory="layouts",
                recipe_name=recipe_name,
            ),
        }
        if any(counts.values()):
            recipe_summaries.append(
                {
                    "recipe_name": recipe_name,
                    "artifact_counts": counts,
                }
            )
    return recipe_summaries


def _count_recipe_artifacts(
    *,
    artifacts: list[dict[str, object]],
    directory: str,
    recipe_name: str,
) -> int:
    prefix = f"{directory}/{recipe_name}_"
    return sum(1 for artifact in artifacts if str(artifact["key"]).startswith(prefix))


def _artifact_role(key: str) -> str:
    if key == "config.json":
        return "legacy-run-config"
    if key == "manifest.jsonl":
        return "image-manifest"
    if key.startswith("embeddings/"):
        return "embedding"
    if key.startswith("indexes/"):
        return "faiss-index"
    if key.startswith("layouts/"):
        return "layout"
    if key.startswith("clusters/"):
        return "cluster-result"
    if key.startswith("viewer/atlases/"):
        return "thumbnail-atlas"
    if key.startswith("viewer/"):
        return "viewer-cache"
    if key.startswith("thumbnails/"):
        return "thumbnail"
    if key.startswith("previews/"):
        return "preview"
    return "supporting-artifact"


def _retention_class(key: str) -> str:
    if (
        key.startswith("thumbnails/")
        or key.startswith("previews/")
        or key.startswith("viewer/atlases/")
    ):
        return "render-cache"
    if key.startswith("viewer/"):
        return "viewer-cache"
    return "durable"


def _content_type(key: str) -> str:
    suffix = Path(key).suffix.casefold()
    if suffix == ".json":
        return "application/json"
    if suffix == ".jsonl":
        return "application/x-jsonlines"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".npy":
        return "application/octet-stream"
    if suffix == ".faiss":
        return "application/octet-stream"
    if suffix == ".md":
        return "text/markdown"
    return "application/octet-stream"


def _load_json(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise ValueError(f"Required Analysis Result source file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _load_jsonl_if_present(path: Path) -> list[dict[str, object]]:
    if not path.is_file():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
