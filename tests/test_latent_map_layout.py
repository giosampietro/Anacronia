import json
from datetime import datetime, timezone

import numpy as np

from anacronia.latent_map_layout import build_latent_map_layout
from anacronia.latent_map_runs import initialize_latent_map_run


class FakeReducer:
    def fit_transform(self, vectors):
        return vectors[:, :2]


class FakeClusterer:
    def fit_predict(self, vectors):
        return np.arange(vectors.shape[0]) % 3


def create_layout_run(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )
    rows = []
    for index in range(6):
        rows.append(
            {
                "image_id": f"img-{index}",
                "source_path": str(source_folder / f"{index}.jpg"),
                "relative_path": f"{index}.jpg",
                "thumbnail_path": f"thumbnails/img-{index}.jpg",
            }
        )
    (run.run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in rows),
        encoding="utf-8",
    )
    embeddings_dir = run.run_dir / "embeddings"
    embeddings_dir.mkdir(exist_ok=True)
    np.save(
        embeddings_dir / "dinov3_vits_256.npy",
        np.asarray(
            [
                [1.0, 0.0, 0.0],
                [0.9, 0.1, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.9, 0.1],
                [0.0, 0.0, 1.0],
                [0.1, 0.0, 0.9],
            ],
            dtype=np.float32,
        ),
    )
    return run


def test_builds_umap_layout_and_kmeans_clusters_with_image_ids(tmp_path):
    run = create_layout_run(tmp_path)

    summary = build_latent_map_layout(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        n_neighbors=4,
        min_dist=0.05,
        cluster_count=3,
        random_state=42,
        reducer=FakeReducer(),
        clusterer=FakeClusterer(),
    )

    layout = json.loads(summary.layout_path.read_text(encoding="utf-8"))
    clusters = json.loads(summary.cluster_path.read_text(encoding="utf-8"))
    assert summary.point_count == 6
    assert summary.cluster_count == 3
    assert layout["layout_id"] == summary.layout_id
    assert layout["params"]["requested_n_neighbors"] == 4
    assert [point["image_id"] for point in layout["points"]] == [
        "img-0",
        "img-1",
        "img-2",
        "img-3",
        "img-4",
        "img-5",
    ]
    assert {point["cluster_id"] for point in clusters["points"]} <= {0, 1, 2}
    assert {point["image_id"] for point in clusters["points"]} == {
        "img-0",
        "img-1",
        "img-2",
        "img-3",
        "img-4",
        "img-5",
    }


def test_layout_uses_effective_neighbors_bounded_by_vector_count(tmp_path):
    run = create_layout_run(tmp_path)

    summary = build_latent_map_layout(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        n_neighbors=40,
        min_dist=0.05,
        cluster_count=20,
        random_state=42,
        reducer=FakeReducer(),
        clusterer=FakeClusterer(),
    )

    layout = json.loads(summary.layout_path.read_text(encoding="utf-8"))
    clusters = json.loads(summary.cluster_path.read_text(encoding="utf-8"))
    assert layout["params"]["effective_n_neighbors"] == 5
    assert clusters["cluster_count"] == 6
