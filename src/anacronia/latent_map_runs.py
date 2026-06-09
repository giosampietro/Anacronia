from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
from pathlib import Path

from anacronia.latent_map_embedding_recipes import (
    DINO_EMBEDDING_RECIPES,
    PRIMARY_DINO_MODEL,
)


SUPPORTED_LATENT_MAP_FORMATS = ("jpg", "jpeg", "png", "webp")
DINO_MEAN_PADDING_RGB = (124, 116, 104)
RUN_SUBDIRECTORIES = (
    "thumbnails",
    "embeddings",
    "indexes",
    "layouts",
    "clusters",
    "viewer",
)


@dataclass(frozen=True)
class LatentMapRun:
    run_id: str
    run_dir: Path
    source_folder: Path
    config_path: Path
    report_path: Path


def initialize_latent_map_run(
    *,
    source_folder: Path,
    runs_root: Path,
    run_name: str | None = None,
    allow_output_inside_source: bool = False,
    created_at: datetime | None = None,
) -> LatentMapRun:
    resolved_source_folder = source_folder.expanduser().resolve()
    if not resolved_source_folder.is_dir():
        raise ValueError(f"Source image folder does not exist: {source_folder}")

    timestamp = _format_timestamp(created_at or datetime.now(timezone.utc))
    slug = _slugify(run_name or resolved_source_folder.name or "latent-map")
    run_id = f"{timestamp}-{slug}"
    resolved_runs_root = runs_root.expanduser().resolve()
    run_dir = resolved_runs_root / run_id

    if (
        not allow_output_inside_source
        and run_dir.resolve().is_relative_to(resolved_source_folder)
    ):
        raise ValueError(
            "Refusing to write the latent-map run inside the source image folder. "
            "Choose a separate runs root or pass allow_output_inside_source=True."
        )

    if run_dir.exists():
        raise FileExistsError(f"Latent-map run already exists: {run_dir}")

    for directory in RUN_SUBDIRECTORIES:
        (run_dir / directory).mkdir(parents=True, exist_ok=True)

    config_path = run_dir / "config.json"
    report_path = run_dir / "report.md"
    config_path.write_text(
        json.dumps(
            _build_run_config(
                run_id=run_id,
                created_at=timestamp,
                source_folder=resolved_source_folder,
            ),
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    report_path.write_text(
        _build_report_stub(run_id=run_id, source_folder=resolved_source_folder),
        encoding="utf-8",
    )

    return LatentMapRun(
        run_id=run_id,
        run_dir=run_dir,
        source_folder=resolved_source_folder,
        config_path=config_path,
        report_path=report_path,
    )


def _build_run_config(
    *,
    run_id: str,
    created_at: str,
    source_folder: Path,
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "analysis_kind": "latent-map",
        "run_id": run_id,
        "created_at": created_at,
        "source_folder": str(source_folder),
        "supported_formats": list(SUPPORTED_LATENT_MAP_FORMATS),
        "model": {
            "primary": PRIMARY_DINO_MODEL,
            "role": "frozen visual embedding backbone",
        },
        "preprocessing": {
            "preserve_aspect_ratio": True,
            "pad_to_multiple": 16,
            "padding_color_rgb": list(DINO_MEAN_PADDING_RGB),
            "recipes": [
                {
                    "name": recipe.name,
                    "family": recipe.family,
                    "model_id": recipe.model_id,
                    "long_edge": recipe.long_edge,
                }
                for recipe in DINO_EMBEDDING_RECIPES.values()
            ],
        },
        "outputs": {
            name: name for name in RUN_SUBDIRECTORIES
        },
    }


def _build_report_stub(*, run_id: str, source_folder: Path) -> str:
    return "\n".join(
        [
            f"# Latent Map Run: {run_id}",
            "",
            "Status: initialized",
            "",
            f"Source folder: `{source_folder}`",
            "",
            "## Counts",
            "",
            "- Supported images: pending",
            "- Skipped files: pending",
            "",
            "## Timings",
            "",
            "- Scan: pending",
            "- Embedding: pending",
            "- FAISS: pending",
            "- UMAP: pending",
            "- Clustering: pending",
            "",
            "## Notes",
            "",
            "- Source images are read-only.",
            "- Generated files are disposable Analysis Results.",
            "",
        ]
    )


def _format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return normalized or "latent-map"
