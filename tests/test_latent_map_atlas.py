import json
from datetime import datetime, timezone

from PIL import Image

from anacronia.latent_map_atlas import generate_latent_map_thumbnail_atlas
from anacronia.latent_map_runs import initialize_latent_map_run


def create_atlas_run(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )
    thumbnail_dir = run.run_dir / "thumbnails"
    manifest_rows = []
    for index, image_id in enumerate(["img-a", "img-b", "img-c", "img-d", "img-e"]):
        thumbnail_path = thumbnail_dir / f"{image_id}.jpg"
        Image.new(
            "RGB",
            (48 + index, 40 + index),
            (120 + index, 80, 60),
        ).save(thumbnail_path, format="JPEG")
        manifest_rows.append(
            {
                "image_id": image_id,
                "source_path": str(source_folder / f"{image_id}.jpg"),
                "relative_path": f"{image_id}.jpg",
                "thumbnail_path": thumbnail_path.relative_to(run.run_dir).as_posix(),
                "width": 100 + index,
                "height": 200 + index,
            }
        )
    (run.run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in manifest_rows),
        encoding="utf-8",
    )
    return run


def test_generates_thumbnail_atlas_manifest_from_generated_thumbnails(tmp_path):
    run = create_atlas_run(tmp_path)

    summary = generate_latent_map_thumbnail_atlas(
        run_dir=run.run_dir,
        tile_size=32,
        atlas_size=64,
    )

    manifest = json.loads(summary.manifest_path.read_text(encoding="utf-8"))
    assert summary.image_count == 5
    assert summary.page_count == 2
    assert summary.tile_size == 32
    assert summary.manifest_path == run.run_dir / "viewer/atlases/32px/atlas-manifest.json"
    assert manifest["asset_kind"] == "latent-map-thumbnail-atlas"
    assert manifest["run_id"] == run.run_id
    assert manifest["tile_size"] == 32
    assert manifest["atlas_size"] == 64
    assert manifest["image_count"] == 5
    assert manifest["page_count"] == 2
    assert manifest["pages"][0] == {
        "index": 0,
        "path": "viewer/atlases/32px/page-000.png",
        "width": 64,
        "height": 64,
    }
    assert (run.run_dir / manifest["pages"][0]["path"]).is_file()
    assert manifest["items"][0] == {
        "image_id": "img-a",
        "page_index": 0,
        "page_path": "viewer/atlases/32px/page-000.png",
        "source_thumbnail_path": "thumbnails/img-a.jpg",
        "tile_rect": [0, 0, 32, 32],
        "uv_rect": [0.0078125, 0.0078125, 0.484375, 0.484375],
        "width": 100,
        "height": 200,
    }
    assert manifest["items"][4]["image_id"] == "img-e"
    assert manifest["items"][4]["page_index"] == 1


def test_atlas_generation_rejects_missing_generated_thumbnail(tmp_path):
    run = create_atlas_run(tmp_path)
    (run.run_dir / "thumbnails/img-c.jpg").unlink()

    try:
        generate_latent_map_thumbnail_atlas(
            run_dir=run.run_dir,
            tile_size=32,
            atlas_size=64,
        )
    except ValueError as error:
        assert "Thumbnail not found: thumbnails/img-c.jpg" in str(error)
    else:
        raise AssertionError("expected missing generated thumbnail to fail")
