import json
from datetime import datetime, timezone

from anacronia.latent_map_result_exports import export_latent_map_results
from anacronia.latent_map_runs import initialize_latent_map_run


def create_result_run(tmp_path):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
        created_at=datetime(2026, 6, 9, 12, 30, tzinfo=timezone.utc),
    )
    manifest_rows = [
        {
            "image_id": "img-a",
            "source_path": str(source_folder / "set-a" / "a.jpg"),
            "relative_path": "set-a/a.jpg",
            "thumbnail_path": "thumbnails/img-a.jpg",
            "sha256": "a" * 64,
        },
        {
            "image_id": "img-a-copy",
            "source_path": str(source_folder / "set-a" / "a-copy.jpg"),
            "relative_path": "set-a/a-copy.jpg",
            "thumbnail_path": "thumbnails/img-a-copy.jpg",
            "sha256": "a" * 64,
        },
        {
            "image_id": "img-b",
            "source_path": str(source_folder / "set-b" / "b.jpg"),
            "relative_path": "set-b/b.jpg",
            "thumbnail_path": "thumbnails/img-b.jpg",
            "sha256": "b" * 64,
        },
    ]
    (run.run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in manifest_rows),
        encoding="utf-8",
    )
    (run.run_dir / "indexes" / "dinov3_vits_256_neighbors.jsonl").write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "image_id": "img-a",
                        "neighbor_rank": 1,
                        "neighbor_image_id": "img-a-copy",
                        "score": 0.999,
                    }
                ),
                json.dumps(
                    {
                        "image_id": "img-a-copy",
                        "neighbor_rank": 1,
                        "neighbor_image_id": "img-a",
                        "score": 0.999,
                    }
                ),
                json.dumps(
                    {
                        "image_id": "img-a",
                        "neighbor_rank": 2,
                        "neighbor_image_id": "img-b",
                        "score": 0.75,
                    }
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (run.run_dir / "layouts" / "dinov3_vits_256_umap.json").write_text(
        json.dumps(
            {
                "layout_id": "umap_n15_mindist0p05_seed42",
                "points": [
                    {"image_id": "img-a", "x": 0.0, "y": 0.0},
                    {"image_id": "img-a-copy", "x": 0.1, "y": 0.1},
                    {"image_id": "img-b", "x": 1.0, "y": 1.0},
                ],
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "clusters" / "dinov3_vits_256_kmeans.json").write_text(
        json.dumps(
            {
                "cluster_id": "kmeans_k2_seed42",
                "points": [
                    {"image_id": "img-a", "cluster_id": 0},
                    {"image_id": "img-a-copy", "cluster_id": 0},
                    {"image_id": "img-b", "cluster_id": 1},
                ],
            }
        ),
        encoding="utf-8",
    )
    return run


def test_exports_duplicate_diagnostics_and_selected_result_provenance(tmp_path):
    run = create_result_run(tmp_path)

    summary = export_latent_map_results(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        selected_image_ids=["img-a"],
        selected_cluster_ids=[0],
        selected_neighbor_image_ids=["img-a"],
        faiss_duplicate_threshold=0.98,
    )

    data = json.loads(summary.result_path.read_text(encoding="utf-8"))
    serialized = json.dumps(data)
    assert data["asset_kind"] == "latent-map-result-export"
    assert data["run_id"] == run.run_id
    assert data["recipe_name"] == "dinov3_vits_256"
    assert data["layout_id"] == "umap_n15_mindist0p05_seed42"
    assert data["cluster_id"] == "kmeans_k2_seed42"
    assert data["diagnostics"]["exact_duplicates"] == [
        {
            "sha256": "a" * 64,
            "images": [
                {"image_id": "img-a", "relative_path": "set-a/a.jpg"},
                {"image_id": "img-a-copy", "relative_path": "set-a/a-copy.jpg"},
            ],
        }
    ]
    assert data["diagnostics"]["perceptual_hash_duplicates"]["status"] == "deferred"
    assert data["diagnostics"]["faiss_duplicate_candidates"] == [
        {
            "image_id": "img-a",
            "neighbor_image_id": "img-a-copy",
            "neighbor_rank": 1,
            "score": 0.999,
            "provenance": {
                "kind": "faiss-neighbor",
                "recipe_name": "dinov3_vits_256",
                "threshold": 0.98,
            },
        }
    ]
    assert data["selections"]["images"] == [
        {"image_id": "img-a", "relative_path": "set-a/a.jpg"}
    ]
    assert data["selections"]["clusters"] == [
        {
            "cluster_id": 0,
            "group_key": "0",
            "image_ids": ["img-a", "img-a-copy"],
            "provenance": {
                "cluster_id": "kmeans_k2_seed42",
                "kind": "cluster-selection",
                "method": "",
            },
        }
    ]
    assert data["selections"]["neighbors"][0]["provenance"]["kind"] == "faiss-neighbor-selection"
    assert data["selections"]["layout"] == {
        "layout_id": "umap_n15_mindist0p05_seed42",
        "point_count": 3,
    }
    assert "source_path" not in serialized
    assert str(run.source_folder) not in serialized
    assert summary.exact_duplicate_group_count == 1
    assert summary.faiss_candidate_count == 1
    assert "Duplicate Diagnostics" in (run.run_dir / "report.md").read_text(
        encoding="utf-8"
    )


def test_exports_hdbscan_group_selections_with_membership(tmp_path):
    run = create_result_run(tmp_path)
    (run.run_dir / "clusters" / "dinov3_vits_256_hdbscan_balanced.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "asset_kind": "latent-map-cluster-result",
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "hdbscan_balanced_mcs25_ms10_eom",
                "label": "HDBSCAN · Balanced",
                "method": "hdbscan",
                "cluster_count": 1,
                "unassigned_count": 1,
                "params": {"preset": "balanced"},
                "groups": [
                    {
                        "group_key": "cluster:0",
                        "cluster_id": 0,
                        "label": "Group 0",
                        "count": 2,
                        "kind": "cluster",
                    },
                    {
                        "group_key": "unassigned",
                        "cluster_id": -1,
                        "label": "Unassigned",
                        "count": 1,
                        "kind": "unassigned",
                    },
                ],
                "points": [
                    {
                        "image_id": "img-a",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                        "membership": 0.91,
                    },
                    {
                        "image_id": "img-a-copy",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                        "membership": 0.87,
                    },
                    {
                        "image_id": "img-b",
                        "cluster_id": -1,
                        "group_key": "unassigned",
                        "membership": 0.0,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )

    summary = export_latent_map_results(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        selected_cluster_ids=["cluster:0", "unassigned"],
    )

    data = json.loads(summary.result_path.read_text(encoding="utf-8"))
    assert data["cluster_result"]["label"] == "HDBSCAN · Balanced"
    assert data["cluster_result"]["unassigned_count"] == 1
    assert data["selections"]["clusters"][0] == {
        "cluster_id": "cluster:0",
        "group_key": "cluster:0",
        "image_ids": ["img-a", "img-a-copy"],
        "provenance": {
            "cluster_id": "hdbscan_balanced_mcs25_ms10_eom",
            "kind": "cluster-selection",
            "method": "hdbscan",
        },
        "label": "Group 0",
        "assignments": [
            {"image_id": "img-a", "membership": 0.91},
            {"image_id": "img-a-copy", "membership": 0.87},
        ],
    }
    assert data["selections"]["clusters"][1]["label"] == "Unassigned"
    assert data["selections"]["clusters"][1]["image_ids"] == ["img-b"]


def test_exports_graph_community_group_selections_with_labels(tmp_path):
    run = create_result_run(tmp_path)
    (run.run_dir / "clusters" / "dinov3_vits_256_graph_balanced.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "asset_kind": "latent-map-cluster-result",
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "graph_communities_balanced_k8_res0p6_min2",
                "label": "Graph communities · Balanced",
                "method": "graph_communities",
                "cluster_count": 1,
                "unassigned_count": 1,
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
                "groups": [
                    {
                        "group_key": "cluster:0",
                        "cluster_id": 0,
                        "label": "Group 0",
                        "count": 2,
                        "kind": "cluster",
                    },
                    {
                        "group_key": "unassigned",
                        "cluster_id": -1,
                        "label": "Unassigned",
                        "count": 1,
                        "kind": "unassigned",
                    },
                ],
                "points": [
                    {
                        "image_id": "img-a",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                    },
                    {
                        "image_id": "img-a-copy",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                    },
                    {
                        "image_id": "img-b",
                        "cluster_id": -1,
                        "group_key": "unassigned",
                    },
                ],
            }
        ),
        encoding="utf-8",
    )

    summary = export_latent_map_results(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        selected_cluster_ids=["cluster:0"],
    )

    data = json.loads(summary.result_path.read_text(encoding="utf-8"))
    assert data["cluster_result"]["label"] == "Graph communities · Balanced"
    assert data["cluster_result"]["params"]["neighbor_source"] == "faiss"
    assert data["selections"]["clusters"] == [
        {
            "cluster_id": "cluster:0",
            "group_key": "cluster:0",
            "image_ids": ["img-a", "img-a-copy"],
            "provenance": {
                "cluster_id": "graph_communities_balanced_k8_res0p6_min2",
                "kind": "cluster-selection",
                "method": "graph_communities",
            },
            "label": "Group 0",
        }
    ]


def test_exports_hierarchy_group_selections_with_granularity_metadata(tmp_path):
    run = create_result_run(tmp_path)
    (run.run_dir / "clusters" / "dinov3_vits_256_hierarchy_balanced.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "asset_kind": "latent-map-cluster-result",
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "hierarchy_balanced_k48_average_cosine_l2",
                "label": "Hierarchy · Balanced",
                "method": "hierarchy",
                "cluster_count": 2,
                "unassigned_count": 0,
                "params": {
                    "preset": "balanced",
                    "granularity_rank": 1,
                    "target_cluster_count": 48,
                    "effective_cluster_count": 2,
                    "algorithm": "agglomerative",
                    "linkage": "average",
                    "metric": "cosine",
                    "vector_normalization": "l2",
                },
                "groups": [
                    {
                        "group_key": "cluster:0",
                        "cluster_id": 0,
                        "label": "Group 0",
                        "count": 2,
                        "kind": "cluster",
                    },
                    {
                        "group_key": "cluster:1",
                        "cluster_id": 1,
                        "label": "Group 1",
                        "count": 1,
                        "kind": "cluster",
                    },
                ],
                "points": [
                    {
                        "image_id": "img-a",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                    },
                    {
                        "image_id": "img-a-copy",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                    },
                    {
                        "image_id": "img-b",
                        "cluster_id": 1,
                        "group_key": "cluster:1",
                    },
                ],
            }
        ),
        encoding="utf-8",
    )

    summary = export_latent_map_results(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        selected_cluster_ids=["cluster:0"],
    )

    data = json.loads(summary.result_path.read_text(encoding="utf-8"))
    assert data["cluster_result"]["label"] == "Hierarchy · Balanced"
    assert data["cluster_result"]["params"]["preset"] == "balanced"
    assert data["cluster_result"]["params"]["target_cluster_count"] == 48
    assert data["selections"]["clusters"] == [
        {
            "cluster_id": "cluster:0",
            "group_key": "cluster:0",
            "image_ids": ["img-a", "img-a-copy"],
            "provenance": {
                "cluster_id": "hierarchy_balanced_k48_average_cosine_l2",
                "kind": "cluster-selection",
                "method": "hierarchy",
            },
            "label": "Group 0",
        }
    ]


def test_result_export_rejects_umap_neighbor_substitution(tmp_path):
    run = create_result_run(tmp_path)
    (run.run_dir / "indexes" / "dinov3_vits_256_neighbors.jsonl").unlink()

    try:
        export_latent_map_results(
            run_dir=run.run_dir,
            recipe_name="dinov3_vits_256",
            selected_neighbor_image_ids=["img-a"],
        )
    except ValueError as error:
        assert "FAISS neighbor file not found" in str(error)
    else:
        raise AssertionError("expected missing FAISS neighbor data to fail")
