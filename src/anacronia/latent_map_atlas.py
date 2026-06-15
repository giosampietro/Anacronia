from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


@dataclass(frozen=True)
class LatentMapThumbnailAtlasSummary:
    run_id: str
    tile_size: int
    atlas_size: int
    image_count: int
    page_count: int
    manifest_path: Path
    total_page_bytes: int


def generate_latent_map_thumbnail_atlas(
    *,
    run_dir: Path,
    tile_size: int,
    atlas_size: int = 2048,
) -> LatentMapThumbnailAtlasSummary:
    if tile_size <= 0:
        raise ValueError("tile_size must be greater than zero.")
    if atlas_size < tile_size:
        raise ValueError("atlas_size must be at least tile_size.")

    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    manifest_rows = _load_jsonl(resolved_run_dir / "manifest.jsonl")
    columns = max(1, atlas_size // tile_size)
    page_capacity = columns * columns
    page_count = math.ceil(len(manifest_rows) / page_capacity) if manifest_rows else 0
    atlas_dir = resolved_run_dir / "viewer" / "atlases" / f"{tile_size}px"
    atlas_dir.mkdir(parents=True, exist_ok=True)

    pages: list[dict[str, object]] = []
    items: list[dict[str, object]] = []

    for page_index in range(page_count):
        page_path = atlas_dir / f"page-{page_index:03d}.png"
        atlas = Image.new("RGB", (atlas_size, atlas_size), (16, 17, 19))
        page_rows = manifest_rows[
            page_index * page_capacity : (page_index + 1) * page_capacity
        ]

        for item_index, row in enumerate(page_rows):
            global_index = page_index * page_capacity + item_index
            column = global_index % page_capacity % columns
            row_index = (global_index % page_capacity) // columns
            x = column * tile_size
            y = row_index * tile_size
            source_thumbnail_path = str(row.get("thumbnail_path", ""))
            source_thumbnail = _load_source_thumbnail(
                run_dir=resolved_run_dir,
                relative_path=source_thumbnail_path,
            )
            tile, content_rect = _fit_thumbnail_tile(
                source_thumbnail,
                tile_size=tile_size,
            )
            atlas.paste(tile, (x, y))
            content_rect_on_page = [
                x + content_rect[0],
                y + content_rect[1],
                content_rect[2],
                content_rect[3],
            ]
            items.append(
                {
                    "image_id": str(row["image_id"]),
                    "page_index": page_index,
                    "page_path": page_path.relative_to(resolved_run_dir).as_posix(),
                    "source_thumbnail_path": source_thumbnail_path,
                    "tile_rect": [x, y, tile_size, tile_size],
                    "content_rect": content_rect_on_page,
                    "uv_rect": _uv_rect(
                        atlas_size=atlas_size,
                        rect=content_rect_on_page,
                    ),
                    "width": int(row.get("width", 0) or 0),
                    "height": int(row.get("height", 0) or 0),
                }
            )

        atlas.save(page_path, format="PNG")
        pages.append(
            {
                "index": page_index,
                "path": page_path.relative_to(resolved_run_dir).as_posix(),
                "width": atlas_size,
                "height": atlas_size,
            }
        )

    manifest_path = atlas_dir / "atlas-manifest.json"
    manifest = {
        "schema_version": 1,
        "asset_kind": "latent-map-thumbnail-atlas",
        "run_id": run_id,
        "tile_size": tile_size,
        "atlas_size": atlas_size,
        "image_count": len(manifest_rows),
        "page_count": page_count,
        "pages": pages,
        "items": items,
        "provenance": {
            "source_manifest_path": "manifest.jsonl",
            "source_thumbnail_tier": "generated-256px",
            "generator": "anacronia.latent_map_atlas.generate_latent_map_thumbnail_atlas",
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    total_page_bytes = sum(
        (resolved_run_dir / str(page["path"])).stat().st_size for page in pages
    )
    _append_atlas_report(
        run_dir=resolved_run_dir,
        tile_size=tile_size,
        page_count=page_count,
        image_count=len(manifest_rows),
        total_page_bytes=total_page_bytes,
        manifest_path=manifest_path,
    )

    return LatentMapThumbnailAtlasSummary(
        run_id=run_id,
        tile_size=tile_size,
        atlas_size=atlas_size,
        image_count=len(manifest_rows),
        page_count=page_count,
        manifest_path=manifest_path,
        total_page_bytes=total_page_bytes,
    )


def _fit_thumbnail_tile(
    image: Image.Image,
    *,
    tile_size: int,
) -> tuple[Image.Image, list[int]]:
    thumbnail = ImageOps.contain(
        ImageOps.exif_transpose(image).convert("RGB"),
        (tile_size, tile_size),
        Image.Resampling.LANCZOS,
    )
    tile = Image.new("RGB", (tile_size, tile_size))
    x = (tile_size - thumbnail.width) // 2
    y = (tile_size - thumbnail.height) // 2
    tile.paste(thumbnail, (x, y))
    _extend_thumbnail_edges(
        tile=tile,
        thumbnail=thumbnail,
        x=x,
        y=y,
        tile_size=tile_size,
    )

    return tile, [x, y, thumbnail.width, thumbnail.height]


def _extend_thumbnail_edges(
    *,
    tile: Image.Image,
    thumbnail: Image.Image,
    x: int,
    y: int,
    tile_size: int,
) -> None:
    if x > 0:
        left_edge = thumbnail.crop((0, 0, 1, thumbnail.height)).resize(
            (x, thumbnail.height)
        )
        tile.paste(left_edge, (0, y))

    right_width = tile_size - x - thumbnail.width
    if right_width > 0:
        right_edge = thumbnail.crop(
            (thumbnail.width - 1, 0, thumbnail.width, thumbnail.height)
        ).resize((right_width, thumbnail.height))
        tile.paste(right_edge, (x + thumbnail.width, y))

    if y > 0:
        top_edge = tile.crop((0, y, tile_size, y + 1)).resize((tile_size, y))
        tile.paste(top_edge, (0, 0))

    bottom_height = tile_size - y - thumbnail.height
    if bottom_height > 0:
        bottom_edge = tile.crop(
            (0, y + thumbnail.height - 1, tile_size, y + thumbnail.height)
        ).resize((tile_size, bottom_height))
        tile.paste(bottom_edge, (0, y + thumbnail.height))


def _load_source_thumbnail(*, run_dir: Path, relative_path: str) -> Image.Image:
    thumbnail_path = (run_dir / relative_path).resolve()
    if thumbnail_path != run_dir and not thumbnail_path.is_relative_to(run_dir):
        raise ValueError(f"Thumbnail path is outside the latent-map run: {relative_path}")
    if not thumbnail_path.is_file():
        raise ValueError(f"Thumbnail not found: {relative_path}")
    try:
        with Image.open(thumbnail_path) as image:
            return image.copy()
    except (OSError, UnidentifiedImageError) as error:
        raise ValueError(f"Thumbnail could not be opened: {relative_path}") from error


def _uv_rect(
    *,
    atlas_size: int,
    rect: list[int],
) -> list[float]:
    x, y, width, height = rect
    pixel_inset = 0.5 / atlas_size
    u0 = x / atlas_size + pixel_inset
    v0 = y / atlas_size + pixel_inset
    u1 = (x + width) / atlas_size - pixel_inset
    v1 = (y + height) / atlas_size - pixel_inset

    return [u0, v0, u1 - u0, v1 - v0]


def _load_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.is_file():
        raise ValueError(f"Required JSONL file not found: {path}")
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _append_atlas_report(
    *,
    run_dir: Path,
    tile_size: int,
    page_count: int,
    image_count: int,
    total_page_bytes: int,
    manifest_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## Thumbnail Atlas",
            "",
            f"- Tile size: {tile_size}px",
            f"- Images: {image_count}",
            f"- Atlas pages: {page_count}",
            f"- Atlas disk bytes: {total_page_bytes}",
            f"- Manifest: `{_relative_key(manifest_path, run_dir)}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")


def _relative_key(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()
