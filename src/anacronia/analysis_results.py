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
        run_dir=resolved_run_dir,
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
    run_dir: Path,
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
            summary: dict[str, object] = {
                "recipe_name": recipe_name,
                "artifact_counts": counts,
            }
            artifact_keys = _recipe_artifact_keys(
                artifacts=artifacts,
                recipe_name=recipe_name,
                run_dir=run_dir,
            )
            vector_id_map_key = artifact_keys.get("vector_id_map")

            if artifact_keys:
                summary["artifact_keys"] = artifact_keys
            if isinstance(vector_id_map_key, str):
                summary["vector_mapping"] = {
                    "image_id_order_format": "faiss-id-map-json",
                    "image_id_order_key": vector_id_map_key,
                }

            recipe_summaries.append(summary)
    return recipe_summaries


def _count_recipe_artifacts(
    *,
    artifacts: list[dict[str, object]],
    directory: str,
    recipe_name: str,
) -> int:
    prefix = f"{directory}/{recipe_name}_"
    return sum(1 for artifact in artifacts if str(artifact["key"]).startswith(prefix))


def _recipe_artifact_keys(
    *,
    artifacts: list[dict[str, object]],
    recipe_name: str,
    run_dir: Path,
) -> dict[str, object]:
    keys = {str(artifact["key"]) for artifact in artifacts}
    artifact_keys: dict[str, object] = {}
    image_manifest_key = "manifest.jsonl" if "manifest.jsonl" in keys else ""
    embedding_vector_key = _first_key_with_prefix_and_suffix(
        keys=keys,
        prefix=f"embeddings/{recipe_name}_",
        suffix=".npy",
    )
    embedding_metadata_key = _first_key_with_prefix_and_suffix(
        keys=keys,
        prefix=f"embeddings/{recipe_name}",
        suffix=".json",
    )
    faiss_index_key = (
        f"indexes/{recipe_name}_flat_ip.faiss"
        if f"indexes/{recipe_name}_flat_ip.faiss" in keys
        else ""
    )
    faiss_id_map_key = (
        f"indexes/{recipe_name}_faiss_id_map.json"
        if f"indexes/{recipe_name}_faiss_id_map.json" in keys
        else ""
    )
    viewer_data_key = "viewer/map-data.json" if "viewer/map-data.json" in keys else ""
    layouts = _recipe_json_outputs(
        id_field="layout_id",
        keys=keys,
        prefix=f"layouts/{recipe_name}_",
        run_dir=run_dir,
    )
    clusters = _recipe_json_outputs(
        id_field="cluster_id",
        keys=keys,
        prefix=f"clusters/{recipe_name}_",
        run_dir=run_dir,
    )
    thumbnail_atlas_manifests = _thumbnail_atlas_manifest_keys(keys)
    baseline_atlas_manifest = _baseline_atlas_manifest_key(thumbnail_atlas_manifests)

    if baseline_atlas_manifest:
        artifact_keys["baseline_atlas_manifest"] = baseline_atlas_manifest
    if clusters:
        artifact_keys["clusters"] = clusters
    if embedding_metadata_key:
        artifact_keys["embedding_metadata"] = embedding_metadata_key
    if embedding_vector_key:
        artifact_keys["embedding_vectors"] = embedding_vector_key
    if faiss_id_map_key:
        artifact_keys["faiss_id_map"] = faiss_id_map_key
        artifact_keys["vector_id_map"] = faiss_id_map_key
    if faiss_index_key:
        artifact_keys["faiss_index"] = faiss_index_key
    if image_manifest_key:
        artifact_keys["image_manifest"] = image_manifest_key
    if layouts:
        artifact_keys["layouts"] = layouts
    if thumbnail_atlas_manifests:
        artifact_keys["thumbnail_atlas_manifests"] = thumbnail_atlas_manifests
    if viewer_data_key:
        artifact_keys["viewer_data"] = viewer_data_key

    return artifact_keys


def _first_key_with_prefix_and_suffix(
    *,
    keys: set[str],
    prefix: str,
    suffix: str,
) -> str:
    return next(
        (key for key in sorted(keys) if key.startswith(prefix) and key.endswith(suffix)),
        "",
    )


def _recipe_json_outputs(
    *,
    id_field: str,
    keys: set[str],
    prefix: str,
    run_dir: Path,
) -> list[dict[str, str]]:
    outputs = []
    for key in sorted(keys):
        if not key.startswith(prefix) or not key.endswith(".json"):
            continue

        payload = _load_json_if_present(run_dir / key)
        output_id = str(
            payload.get(id_field) or Path(key).stem.removeprefix(Path(prefix).name)
        )
        if output_id:
            outputs.append({"key": key, id_field: output_id})

    return outputs


def _thumbnail_atlas_manifest_keys(keys: set[str]) -> dict[str, str]:
    manifests = {}
    prefix = "viewer/atlases/"
    suffix = "px/atlas-manifest.json"
    for key in sorted(keys):
        if key.startswith(prefix) and key.endswith(suffix):
            tile_size = key[len(prefix) : -len(suffix)]
            if tile_size.isdigit():
                manifests[tile_size] = key

    return dict(sorted(manifests.items(), key=lambda item: int(item[0])))


def _baseline_atlas_manifest_key(thumbnail_atlas_manifests: dict[str, str]) -> str:
    if "32" in thumbnail_atlas_manifests:
        return thumbnail_atlas_manifests["32"]
    if thumbnail_atlas_manifests:
        return next(iter(thumbnail_atlas_manifests.values()))
    return ""


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


def _load_json_if_present(path: Path) -> dict[str, object]:
    if not path.is_file():
        return {}
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
