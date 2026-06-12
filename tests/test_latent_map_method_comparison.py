import json
from datetime import datetime, timezone

from anacronia.latent_map_method_comparison import export_method_comparison
from anacronia.latent_map_runs import initialize_latent_map_run


def create_comparison_run(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )
    (run.run_dir / "embeddings" / "dinov3_vits_256.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "recipe": {
                    "family": "dinov3",
                    "model_id": "facebook/dinov3-vits16-pretrain-lvd1689m",
                    "long_edge": 256,
                },
                "vector_count": 6,
                "vector_dim": 384,
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "embeddings" / "dinov3_vits_384.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_384",
                "recipe": {
                    "model_id": "facebook/dinov3-vits16-pretrain-lvd1689m",
                    "long_edge": 384,
                },
                "vector_count": 6,
                "vector_dim": 384,
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "layouts" / "dinov3_vits_256_umap_n4_mindist0p05_seed42.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "layout_id": "umap_n4_mindist0p05_seed42",
                "method": "umap",
                "params": {"effective_n_neighbors": 4, "min_dist": 0.05},
                "points": [{"image_id": "img-a", "x": 0.0, "y": 0.0}],
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "layouts" / "dinov3_vits_256_umap_n8_mindist0p3_seed7.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "layout_id": "umap_n8_mindist0p3_seed7",
                "method": "umap",
                "params": {"effective_n_neighbors": 8, "min_dist": 0.3},
                "points": [{"image_id": "img-a", "x": 1.0, "y": 1.0}],
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "clusters" / "dinov3_vits_256_kmeans_k2_seed42.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "kmeans_k2_seed42",
                "method": "kmeans",
                "cluster_count": 2,
                "points": [{"image_id": "img-a", "cluster_id": 0}],
            }
        ),
        encoding="utf-8",
    )
    return run


def test_exports_method_comparison_without_overwriting_analysis_results(tmp_path):
    run = create_comparison_run(tmp_path)
    layout_paths_before = sorted(path.name for path in (run.run_dir / "layouts").iterdir())

    summary = export_method_comparison(run_dir=run.run_dir)

    data = json.loads(summary.comparison_path.read_text(encoding="utf-8"))
    assert data["asset_kind"] == "latent-map-method-comparison"
    assert data["run_id"] == run.run_id
    assert [embedding["recipe_name"] for embedding in data["embeddings"]] == [
        "dinov3_vits_256",
        "dinov3_vits_384",
    ]
    assert [embedding["family"] for embedding in data["embeddings"]] == [
        "dinov3",
        "dinov3",
    ]
    assert data["embeddings"][1]["long_edge"] == 384
    assert [layout["layout_id"] for layout in data["layouts"]] == [
        "umap_n4_mindist0p05_seed42",
        "umap_n8_mindist0p3_seed7",
    ]
    assert data["layouts"][1]["params"]["min_dist"] == 0.3
    assert data["clusters"] == [
        {
            "cluster_id": "kmeans_k2_seed42",
            "cluster_count": 2,
            "method": "kmeans",
            "recipe_name": "dinov3_vits_256",
        }
    ]
    assert data["hdbscan"] == {
        "status": "deferred",
        "reason": "No precomputed HDBSCAN cluster artifacts found.",
    }
    assert sorted(path.name for path in (run.run_dir / "layouts").iterdir()) == layout_paths_before
    assert summary.embedding_count == 2
    assert summary.layout_count == 2
    assert summary.cluster_count == 1
    report = (run.run_dir / "report.md").read_text(encoding="utf-8")
    assert "## Method Comparison" in report
    assert "HDBSCAN: deferred" in report


def test_exports_available_hdbscan_presets_in_method_comparison(tmp_path):
    run = create_comparison_run(tmp_path)
    (run.run_dir / "clusters" / "dinov3_vits_256_hdbscan_balanced.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "hdbscan_balanced_mcs25_ms10_eom",
                "label": "HDBSCAN · Balanced",
                "method": "hdbscan",
                "cluster_count": 3,
                "unassigned_count": 2,
                "params": {
                    "preset": "balanced",
                    "min_cluster_size": 25,
                    "min_samples": 10,
                },
                "points": [{"image_id": "img-a", "cluster_id": 0}],
            }
        ),
        encoding="utf-8",
    )

    summary = export_method_comparison(run_dir=run.run_dir)

    data = json.loads(summary.comparison_path.read_text(encoding="utf-8"))
    assert summary.hdbscan_status == "available"
    assert data["hdbscan"] == {
        "status": "available",
        "preset_count": 1,
        "presets": [
            {
                "cluster_id": "hdbscan_balanced_mcs25_ms10_eom",
                "label": "HDBSCAN · Balanced",
                "recipe_name": "dinov3_vits_256",
                "cluster_count": 3,
                "unassigned_count": 2,
                "params": {
                    "preset": "balanced",
                    "min_cluster_size": 25,
                    "min_samples": 10,
                },
            }
        ],
    }


def test_exports_available_graph_community_presets_in_method_comparison(tmp_path):
    run = create_comparison_run(tmp_path)
    (run.run_dir / "clusters" / "dinov3_vits_256_graph_balanced.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "graph_communities_balanced_k8_res0p6_min2",
                "label": "Graph communities · Balanced",
                "method": "graph_communities",
                "cluster_count": 4,
                "unassigned_count": 12,
                "params": {
                    "preset": "balanced",
                    "min_group_size": 2,
                    "k": 8,
                    "min_score": 0.0,
                    "resolution": 0.6,
                    "max_iterations": 30,
                    "neighbor_source": "faiss",
                    "algorithm": "weighted_label_propagation",
                },
                "points": [{"image_id": "img-a", "cluster_id": 0}],
            }
        ),
        encoding="utf-8",
    )

    summary = export_method_comparison(run_dir=run.run_dir)

    data = json.loads(summary.comparison_path.read_text(encoding="utf-8"))
    assert data["graph_communities"] == {
        "status": "available",
        "preset_count": 1,
        "presets": [
            {
                "cluster_id": "graph_communities_balanced_k8_res0p6_min2",
                "label": "Graph communities · Balanced",
                "recipe_name": "dinov3_vits_256",
                "cluster_count": 4,
                "unassigned_count": 12,
                "params": {
                    "preset": "balanced",
                    "min_group_size": 2,
                    "k": 8,
                    "min_score": 0.0,
                    "resolution": 0.6,
                    "max_iterations": 30,
                    "neighbor_source": "faiss",
                    "algorithm": "weighted_label_propagation",
                },
            }
        ],
    }
    assert summary.cluster_count == 2
