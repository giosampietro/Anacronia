import json
from datetime import datetime, timezone

import pytest

from anacronia.latent_map_runs import (
    DINO_MEAN_PADDING_RGB,
    initialize_latent_map_run,
)


def test_initializes_latent_map_run_contract(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    runs_root = tmp_path / "runs"

    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=runs_root,
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )

    assert run.run_id == "20260609T123000Z-j-shoot"
    assert run.run_dir == runs_root / "20260609T123000Z-j-shoot"
    assert (run.run_dir / "config.json").is_file()
    assert (run.run_dir / "report.md").is_file()
    assert [
        path.name
        for path in sorted(run.run_dir.iterdir())
        if path.is_dir()
    ] == [
        "clusters",
        "embeddings",
        "indexes",
        "layouts",
        "thumbnails",
        "viewer",
    ]

    config = json.loads((run.run_dir / "config.json").read_text(encoding="utf-8"))
    assert config["run_id"] == "20260609T123000Z-j-shoot"
    assert config["analysis_kind"] == "latent-map"
    assert config["source_folder"] == str(source_folder.resolve())
    assert config["supported_formats"] == ["jpg", "jpeg", "png", "webp"]
    assert config["model"]["primary"] == "facebook/dinov3-vits16-pretrain-lvd1689m"
    assert config["preprocessing"]["preserve_aspect_ratio"] is True
    assert config["preprocessing"]["pad_to_multiple"] == 16
    assert config["preprocessing"]["padding_color_rgb"] == list(DINO_MEAN_PADDING_RGB)
    assert config["preprocessing"]["recipes"] == [
        {
            "name": "dinov3_vits_256",
            "family": "dinov3",
            "model_id": "facebook/dinov3-vits16-pretrain-lvd1689m",
            "long_edge": 256,
        },
        {
            "name": "dinov3_vits_384",
            "family": "dinov3",
            "model_id": "facebook/dinov3-vits16-pretrain-lvd1689m",
            "long_edge": 384,
        },
        {
            "name": "dinov3_vits_512",
            "family": "dinov3",
            "model_id": "facebook/dinov3-vits16-pretrain-lvd1689m",
            "long_edge": 512,
        },
    ]

    report = (run.run_dir / "report.md").read_text(encoding="utf-8")
    assert "# Latent Map Run: 20260609T123000Z-j-shoot" in report
    assert "Source folder: `source-images`" in report
    assert str(source_folder.resolve()) not in report


def test_refuses_to_write_run_inside_source_folder(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()

    with pytest.raises(ValueError, match="inside the source image folder"):
        initialize_latent_map_run(
            source_folder=source_folder,
            runs_root=source_folder / "runs",
            created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
        )


def test_can_explicitly_allow_run_inside_source_folder(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()

    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=source_folder / "runs",
        allow_output_inside_source=True,
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )

    assert run.run_dir.is_dir()
