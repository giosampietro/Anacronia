import json
from datetime import datetime, timezone

from PIL import Image

from anacronia.latent_map_runs import initialize_latent_map_run
from anacronia.latent_map_scan import scan_latent_map_run


def write_image(path, *, size=(320, 180), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def create_run(tmp_path, source_folder):
    return initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )


def read_manifest(run_dir):
    return [
        json.loads(line)
        for line in (run_dir / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]


def test_scans_supported_formats_and_writes_manifest_thumbnails(tmp_path):
    source_folder = tmp_path / "source-images"
    write_image(source_folder / "root.JPG")
    write_image(source_folder / "nested" / "inside.webp")
    (source_folder / "notes.txt").write_text("not an image", encoding="utf-8")
    run = create_run(tmp_path, source_folder)

    summary = scan_latent_map_run(run.run_dir)

    assert summary.supported_file_count == 2
    assert summary.manifest_image_count == 2
    assert [(skip.relative_path, skip.reason) for skip in summary.skipped_files] == [
        ("notes.txt", "unsupported_file_type")
    ]
    manifest = read_manifest(run.run_dir)
    assert [row["relative_path"] for row in manifest] == [
        "nested/inside.webp",
        "root.JPG",
    ]
    assert {row["extension"] for row in manifest} == {"jpg", "webp"}
    for row in manifest:
        thumbnail_path = run.run_dir / row["thumbnail_path"]
        preview_path = run.run_dir / row["preview_path"]
        assert thumbnail_path.is_file()
        assert thumbnail_path.parent == run.run_dir / "thumbnails"
        assert preview_path.is_file()
        assert preview_path.parent == run.run_dir / "previews"
        assert row["width"] > 0
        assert row["height"] > 0
    report = (run.run_dir / "report.md").read_text(encoding="utf-8")
    assert "- Supported files: 2" in report
    assert "- Manifest images: 2" in report
    assert "- Skipped files: 1" in report
    assert "Source folder: `source-images`" in report
    assert str(source_folder.resolve()) not in report


def test_scan_writes_1024_long_edge_hover_previews(tmp_path):
    source_folder = tmp_path / "source-images"
    write_image(source_folder / "large.jpg", size=(2400, 1200))
    run = create_run(tmp_path, source_folder)

    scan_latent_map_run(run.run_dir)

    manifest = read_manifest(run.run_dir)
    thumbnail_path = run.run_dir / manifest[0]["thumbnail_path"]
    preview_path = run.run_dir / manifest[0]["preview_path"]

    with Image.open(thumbnail_path) as thumbnail:
        assert max(thumbnail.size) == 256
    with Image.open(preview_path) as preview:
        assert max(preview.size) == 1024


def test_scan_uses_stable_image_ids_and_does_not_mutate_sources(tmp_path):
    source_folder = tmp_path / "source-images"
    image_path = source_folder / "image.jpg"
    write_image(image_path)
    before_bytes = image_path.read_bytes()
    run = create_run(tmp_path, source_folder)

    first = scan_latent_map_run(run.run_dir)
    first_ids = [row["image_id"] for row in read_manifest(run.run_dir)]
    second = scan_latent_map_run(run.run_dir)
    second_ids = [row["image_id"] for row in read_manifest(run.run_dir)]

    assert first.manifest_image_count == 1
    assert second.manifest_image_count == 1
    assert first_ids == second_ids
    assert image_path.read_bytes() == before_bytes


def test_scan_skips_broken_supported_images(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    (source_folder / "broken.jpg").write_bytes(b"not really a jpg")
    run = create_run(tmp_path, source_folder)

    summary = scan_latent_map_run(run.run_dir)

    assert summary.supported_file_count == 1
    assert summary.manifest_image_count == 0
    assert [(skip.relative_path, skip.reason) for skip in summary.skipped_files] == [
        ("broken.jpg", "image_open_failed")
    ]
    assert read_manifest(run.run_dir) == []
