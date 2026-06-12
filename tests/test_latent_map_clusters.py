import json
from datetime import datetime, timezone

import numpy as np

from anacronia.latent_map_clusters import (
    GRAPH_COMMUNITY_PRESETS,
    HDBSCAN_PRESETS,
    build_graph_community_cluster_result,
    build_hdbscan_cluster_result,
    get_graph_community_presets,
    get_hdbscan_presets,
)
from anacronia.latent_map_runs import initialize_latent_map_run


class CaptureClusterer:
    def __init__(self):
        self.fitted_vectors = None
        self.probabilities_ = np.asarray([0.96, 0.88, 0.0, 0.77, 0.65, 0.0])

    def fit_predict(self, vectors):
        self.fitted_vectors = vectors
        return np.asarray([0, 0, -1, 1, 1, -1])


def create_cluster_run(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )
    rows = [
        {
            "image_id": f"img-{index}",
            "source_path": str(source_folder / f"{index}.jpg"),
            "relative_path": f"{index}.jpg",
            "thumbnail_path": f"thumbnails/img-{index}.jpg",
        }
        for index in range(6)
    ]
    (run.run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in rows),
        encoding="utf-8",
    )
    np.save(
        run.run_dir / "embeddings" / "dinov3_vits_256.npy",
        np.asarray(
            [
                [10.0, 0.0, 0.0],
                [0.0, 2.0, 0.0],
                [0.0, 0.0, 5.0],
                [3.0, 4.0, 0.0],
                [0.0, 6.0, 8.0],
                [7.0, 0.0, 24.0],
            ],
            dtype=np.float32,
        ),
    )
    return run


def test_hdbscan_presets_are_ordered_for_the_ui():
    assert [preset.slug for preset in HDBSCAN_PRESETS] == [
        "fine",
        "detail",
        "balanced",
        "broad",
    ]
    assert get_hdbscan_presets("balanced")[0].label == "HDBSCAN · Balanced"


def test_builds_graph_community_cluster_result_from_faiss_neighbors(tmp_path):
    run = create_cluster_run(tmp_path)
    (run.run_dir / "indexes" / "dinov3_vits_256_neighbors.jsonl").write_text(
        "\n".join(
            json.dumps(row)
            for row in [
                {
                    "image_id": "img-0",
                    "neighbor_rank": 1,
                    "neighbor_image_id": "img-1",
                    "score": 0.94,
                },
                {
                    "image_id": "img-1",
                    "neighbor_rank": 1,
                    "neighbor_image_id": "img-0",
                    "score": 0.94,
                },
                {
                    "image_id": "img-1",
                    "neighbor_rank": 2,
                    "neighbor_image_id": "img-2",
                    "score": 0.82,
                },
                {
                    "image_id": "img-2",
                    "neighbor_rank": 1,
                    "neighbor_image_id": "img-1",
                    "score": 0.82,
                },
                {
                    "image_id": "img-3",
                    "neighbor_rank": 1,
                    "neighbor_image_id": "img-4",
                    "score": 0.91,
                },
                {
                    "image_id": "img-4",
                    "neighbor_rank": 1,
                    "neighbor_image_id": "img-3",
                    "score": 0.91,
                },
                {
                    "image_id": "img-5",
                    "neighbor_rank": 1,
                    "neighbor_image_id": "img-0",
                    "score": 0.62,
                },
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    summary = build_graph_community_cluster_result(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        preset=get_graph_community_presets("balanced")[0],
    )

    payload = json.loads(summary.cluster_path.read_text(encoding="utf-8"))
    assert [preset.slug for preset in GRAPH_COMMUNITY_PRESETS] == [
        "broad",
        "balanced",
        "detail",
        "fine",
    ]
    assert summary.cluster_id == "graph_communities_balanced_k8_res0p6_min2"
    assert payload["asset_kind"] == "latent-map-cluster-result"
    assert payload["method"] == "graph_communities"
    assert payload["label"] == "Graph communities · Balanced"
    assert payload["cluster_count"] == 2
    assert payload["unassigned_count"] == 0
    assert payload["params"] == {
        "preset": "balanced",
        "k": 8,
        "min_score": 0.0,
        "min_group_size": 2,
        "resolution": 0.6,
        "max_iterations": 30,
        "neighbor_source": "faiss",
        "algorithm": "weighted_label_propagation",
    }
    assert [group["group_key"] for group in payload["groups"]] == [
        "cluster:0",
        "cluster:1",
    ]
    assert payload["points"] == [
        {"image_id": "img-0", "cluster_id": 0, "group_key": "cluster:0"},
        {"image_id": "img-1", "cluster_id": 0, "group_key": "cluster:0"},
        {"image_id": "img-2", "cluster_id": 0, "group_key": "cluster:0"},
        {"image_id": "img-3", "cluster_id": 1, "group_key": "cluster:1"},
        {"image_id": "img-4", "cluster_id": 1, "group_key": "cluster:1"},
        {"image_id": "img-5", "cluster_id": 0, "group_key": "cluster:0"},
    ]


def test_builds_hdbscan_cluster_result_with_groups_and_membership(tmp_path):
    run = create_cluster_run(tmp_path)
    clusterer = CaptureClusterer()

    summary = build_hdbscan_cluster_result(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        preset=get_hdbscan_presets("balanced")[0],
        clusterer=clusterer,
    )

    payload = json.loads(summary.cluster_path.read_text(encoding="utf-8"))
    fitted_norms = np.linalg.norm(clusterer.fitted_vectors, axis=1)
    assert np.allclose(fitted_norms, np.ones(6))
    assert summary.cluster_id == "hdbscan_balanced_mcs25_ms10_eom"
    assert payload["asset_kind"] == "latent-map-cluster-result"
    assert payload["method"] == "hdbscan"
    assert payload["label"] == "HDBSCAN · Balanced"
    assert payload["cluster_count"] == 2
    assert payload["unassigned_count"] == 2
    assert payload["params"] == {
        "preset": "balanced",
        "min_cluster_size": 25,
        "min_samples": 10,
        "cluster_selection_method": "eom",
        "metric": "euclidean",
        "vector_normalization": "l2",
    }
    assert [group["group_key"] for group in payload["groups"]] == [
        "unassigned",
        "cluster:0",
        "cluster:1",
    ]
    assert payload["points"][0] == {
        "image_id": "img-0",
        "cluster_id": 0,
        "group_key": "cluster:0",
        "membership": 0.9599999785423279,
    }
    assert payload["points"][2] == {
        "image_id": "img-2",
        "cluster_id": -1,
        "group_key": "unassigned",
        "membership": 0.0,
    }
