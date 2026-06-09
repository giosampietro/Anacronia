import json
from datetime import datetime, timezone

import numpy as np
from PIL import Image

from anacronia.latent_map_embeddings import (
    DINO_EMBEDDING_RECIPES,
    embed_latent_map_run,
    prepare_image_for_embedding,
)
from anacronia.latent_map_runs import DINO_MEAN_PADDING_RGB, initialize_latent_map_run
from anacronia.latent_map_scan import scan_latent_map_run


class FakeEmbedder:
    model_id = "fake-embedder"
    device = "fake"

    def embed_batch(self, images):
        rows = []
        for index, image in enumerate(images, start=1):
            rows.append([float(image.width), float(image.height), float(index)])
        return np.asarray(rows, dtype=np.float32)


def write_image(path, *, size=(320, 180), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def create_scanned_run(tmp_path):
    source_folder = tmp_path / "source-images"
    write_image(source_folder / "a.jpg", size=(320, 180))
    write_image(source_folder / "b.jpg", size=(180, 320))
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )
    scan_latent_map_run(run.run_dir)
    return run


def test_prepares_images_without_square_crop_and_pads_to_patch_multiple():
    source = Image.new("RGB", (100, 300), color=(200, 20, 10))

    prepared = prepare_image_for_embedding(
        source,
        recipe=DINO_EMBEDDING_RECIPES["dinov3_vits_256"],
    )

    assert prepared.resized_size == (85, 256)
    assert prepared.image.size == (96, 256)
    assert prepared.image.size[0] % 16 == 0
    assert prepared.image.size[1] % 16 == 0
    assert prepared.image.size != (256, 256)
    assert prepared.image.getpixel((95, 255)) == DINO_MEAN_PADDING_RGB


def test_embedding_run_writes_normalized_vectors_and_metadata(tmp_path):
    run = create_scanned_run(tmp_path)

    summary = embed_latent_map_run(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        batch_size=1,
        embedder=FakeEmbedder(),
    )

    vectors = np.load(summary.embedding_path)
    metadata = json.loads(summary.metadata_path.read_text(encoding="utf-8"))

    assert vectors.shape == (2, 3)
    assert np.allclose(np.linalg.norm(vectors, axis=1), [1.0, 1.0])
    assert summary.vector_count == 2
    assert summary.vector_dim == 3
    assert metadata["recipe"]["long_edge"] == 256
    assert metadata["model_id"] == "fake-embedder"
    assert metadata["device"] == "fake"
    assert metadata["manifest_image_count"] == 2


def test_embedding_run_can_limit_manifest_rows_for_smoke_checks(tmp_path):
    run = create_scanned_run(tmp_path)

    summary = embed_latent_map_run(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_384",
        batch_size=8,
        limit=1,
        embedder=FakeEmbedder(),
    )

    vectors = np.load(summary.embedding_path)
    metadata = json.loads(summary.metadata_path.read_text(encoding="utf-8"))
    assert vectors.shape == (1, 3)
    assert metadata["recipe"]["long_edge"] == 384
    assert metadata["limit"] == 1
