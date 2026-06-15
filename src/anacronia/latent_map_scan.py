from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


THUMBNAIL_SIZE = (256, 256)
PREVIEW_SIZE = (1024, 1024)


@dataclass(frozen=True)
class LatentMapSkippedFile:
    relative_path: str
    reason: str


@dataclass(frozen=True)
class LatentMapScanSummary:
    run_id: str
    source_folder: Path
    supported_file_count: int
    manifest_image_count: int
    skipped_files: list[LatentMapSkippedFile]
    manifest_path: Path
    skipped_path: Path


def scan_latent_map_run(run_dir: Path) -> LatentMapScanSummary:
    resolved_run_dir = run_dir.expanduser().resolve()
    config_path = resolved_run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    run_id = str(config["run_id"])
    source_folder = Path(str(config["source_folder"])).expanduser().resolve()
    supported_formats = {
        str(extension).casefold().lstrip(".")
        for extension in config.get("supported_formats", [])
    }
    if not source_folder.is_dir():
        raise ValueError(f"Source image folder does not exist: {source_folder}")

    manifest_rows: list[dict[str, object]] = []
    skipped_files: list[LatentMapSkippedFile] = []
    supported_file_count = 0
    thumbnail_dir = resolved_run_dir / "thumbnails"
    preview_dir = resolved_run_dir / "previews"
    thumbnail_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    for path in _discover_files(source_folder):
        relative_path = path.relative_to(source_folder).as_posix()
        extension = path.suffix.casefold().lstrip(".")
        if extension not in supported_formats:
            skipped_files.append(
                LatentMapSkippedFile(
                    relative_path=relative_path,
                    reason="unsupported_file_type",
                )
            )
            continue

        supported_file_count += 1
        try:
            file_hash = _sha256_file(path)
            with Image.open(path) as image:
                image = ImageOps.exif_transpose(image)
                width, height = image.size
                image_id = _image_id(relative_path=relative_path, file_hash=file_hash)
                thumbnail_path = thumbnail_dir / f"{image_id}.jpg"
                preview_path = preview_dir / f"{image_id}.jpg"
                rgb_image = image.convert("RGB")
                thumbnail = rgb_image.copy()
                thumbnail.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                thumbnail.save(thumbnail_path, format="JPEG", quality=85)
                preview = rgb_image.copy()
                preview.thumbnail(PREVIEW_SIZE, Image.Resampling.LANCZOS)
                preview.save(preview_path, format="JPEG", quality=90)
        except (OSError, UnidentifiedImageError, ValueError):
            skipped_files.append(
                LatentMapSkippedFile(
                    relative_path=relative_path,
                    reason="image_open_failed",
                )
            )
            continue

        subfolder = Path(relative_path).parent.as_posix()
        manifest_rows.append(
            {
                "image_id": image_id,
                "source_path": str(path),
                "relative_path": relative_path,
                "filename": path.name,
                "extension": extension,
                "file_size": path.stat().st_size,
                "sha256": file_hash,
                "width": width,
                "height": height,
                "subfolder": "" if subfolder == "." else subfolder,
                "thumbnail_path": thumbnail_path.relative_to(resolved_run_dir).as_posix(),
                "preview_path": preview_path.relative_to(resolved_run_dir).as_posix(),
            }
        )

    manifest_path = resolved_run_dir / "manifest.jsonl"
    skipped_path = resolved_run_dir / "skipped-files.jsonl"
    _write_jsonl(manifest_path, manifest_rows)
    _write_jsonl(
        skipped_path,
        [
            {
                "relative_path": skipped.relative_path,
                "reason": skipped.reason,
            }
            for skipped in skipped_files
        ],
    )
    _write_scan_report(
        run_dir=resolved_run_dir,
        run_id=run_id,
        source_folder=source_folder,
        supported_file_count=supported_file_count,
        manifest_image_count=len(manifest_rows),
        skipped_files=skipped_files,
    )

    return LatentMapScanSummary(
        run_id=run_id,
        source_folder=source_folder,
        supported_file_count=supported_file_count,
        manifest_image_count=len(manifest_rows),
        skipped_files=skipped_files,
        manifest_path=manifest_path,
        skipped_path=skipped_path,
    )


def _discover_files(source_folder: Path) -> list[Path]:
    return sorted(
        [path for path in source_folder.rglob("*") if path.is_file()],
        key=lambda path: path.relative_to(source_folder).as_posix().casefold(),
    )


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _image_id(*, relative_path: str, file_hash: str) -> str:
    digest = hashlib.sha256()
    digest.update(relative_path.encode("utf-8"))
    digest.update(b"\0")
    digest.update(file_hash.encode("ascii"))
    return "img_" + digest.hexdigest()[:20]


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _write_scan_report(
    *,
    run_dir: Path,
    run_id: str,
    source_folder: Path,
    supported_file_count: int,
    manifest_image_count: int,
    skipped_files: list[LatentMapSkippedFile],
) -> None:
    report_lines = [
        f"# Latent Map Run: {run_id}",
        "",
        "Status: scanned",
        "",
        f"Source folder: `{source_folder.name}`",
        "",
        "## Counts",
        "",
        f"- Supported files: {supported_file_count}",
        f"- Manifest images: {manifest_image_count}",
        f"- Skipped files: {len(skipped_files)}",
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
    if skipped_files:
        report_lines.extend(
            [
                "## Skipped Files",
                "",
                *[
                    f"- `{skipped.relative_path}`: {skipped.reason}"
                    for skipped in skipped_files
                ],
                "",
            ]
        )
    (run_dir / "report.md").write_text("\n".join(report_lines), encoding="utf-8")
