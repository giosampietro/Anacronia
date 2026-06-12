import json
from datetime import datetime, timezone

from PIL import Image

from anacronia.latent_map_atlas import generate_latent_map_thumbnail_atlas
from anacronia.latent_map_runs import initialize_latent_map_run
from anacronia.latent_map_viewer_export import export_viewer_data


def create_viewer_run(tmp_path):
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
            "source_path": str(source_folder / "a.jpg"),
            "relative_path": "a.jpg",
            "thumbnail_path": "thumbnails/img-a.jpg",
            "preview_path": "previews/img-a.jpg",
            "width": 100,
            "height": 200,
        },
        {
            "image_id": "img-b",
            "source_path": str(source_folder / "b.jpg"),
            "relative_path": "b.jpg",
            "thumbnail_path": "thumbnails/img-b.jpg",
            "preview_path": "previews/img-b.jpg",
            "width": 300,
            "height": 200,
        },
    ]
    for row in manifest_rows:
        thumbnail_path = run.run_dir / str(row["thumbnail_path"])
        Image.new("RGB", (48, 48), (160, 120, 80)).save(
            thumbnail_path,
            format="JPEG",
        )
    (run.run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in manifest_rows),
        encoding="utf-8",
    )
    layout = {
        "run_id": run.run_id,
        "recipe_name": "dinov3_vits_256",
        "layout_id": "umap_n4_mindist0p05_seed42",
        "points": [
            {"image_id": "img-a", "x": 1.0, "y": 2.0},
            {"image_id": "img-b", "x": 3.0, "y": 4.0},
        ],
    }
    cluster = {
        "run_id": run.run_id,
        "recipe_name": "dinov3_vits_256",
        "cluster_id": "kmeans_k2_seed42",
        "cluster_count": 2,
        "points": [
            {"image_id": "img-a", "cluster_id": 0},
            {"image_id": "img-b", "cluster_id": 1},
        ],
    }
    (run.run_dir / "layouts" / "dinov3_vits_256_umap_n4_mindist0p05_seed42.json").write_text(
        json.dumps(layout),
        encoding="utf-8",
    )
    (run.run_dir / "clusters" / "dinov3_vits_256_kmeans_k2_seed42.json").write_text(
        json.dumps(cluster),
        encoding="utf-8",
    )
    (run.run_dir / "indexes" / "dinov3_vits_256_neighbors.jsonl").write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "image_id": "img-a",
                        "neighbor_rank": 1,
                        "neighbor_image_id": "img-b",
                        "score": 0.8,
                    }
                ),
                json.dumps(
                    {
                        "image_id": "img-b",
                        "neighbor_rank": 1,
                        "neighbor_image_id": "img-a",
                        "score": 0.8,
                    }
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return run


def test_exports_compact_viewer_data_with_separate_neighbor_index(tmp_path):
    run = create_viewer_run(tmp_path)

    summary = export_viewer_data(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
    )

    data = json.loads(summary.viewer_data_path.read_text(encoding="utf-8"))
    assert summary.point_count == 2
    assert data["run_id"] == run.run_id
    assert data["recipe_name"] == "dinov3_vits_256"
    assert data["layout_id"] == "umap_n4_mindist0p05_seed42"
    assert data["cluster_id"] == "kmeans_k2_seed42"
    assert data["neighbor_index_path"] == "viewer/neighbors.json"
    assert data["points"][0] == {
        "image_id": "img-a",
        "x": 1.0,
        "y": 2.0,
        "cluster_id": 0,
        "cluster_group_key": "0",
        "thumbnail_path": "thumbnails/img-a.jpg",
        "preview_path": "previews/img-a.jpg",
        "relative_path": "a.jpg",
        "width": 100,
        "height": 200,
    }
    assert "source_path" not in data["points"][0]
    assert "neighbors" not in data["points"][0]
    assert summary.neighbor_data_path == run.run_dir / "viewer" / "neighbors.json"
    assert summary.map_payload_bytes > 0
    assert summary.neighbor_payload_bytes > 0

    neighbor_data = json.loads(summary.neighbor_data_path.read_text(encoding="utf-8"))
    assert neighbor_data["asset_kind"] == "latent-map-neighbors"
    assert neighbor_data["neighbors_by_image_id"]["img-a"] == [
        {
            "rank": 1,
            "image_id": "img-b",
            "score": 0.8,
        }
    ]
    assert "Estimated initial map payload at 10k images" in (
        run.run_dir / "report.md"
    ).read_text(encoding="utf-8")


def test_exports_viewer_data_with_generated_atlas_manifest_path(tmp_path):
    run = create_viewer_run(tmp_path)
    atlas_summary = generate_latent_map_thumbnail_atlas(
        run_dir=run.run_dir,
        tile_size=32,
        atlas_size=64,
    )

    summary = export_viewer_data(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        thumbnail_atlas_manifest_path=atlas_summary.manifest_path,
    )

    data = json.loads(summary.viewer_data_path.read_text(encoding="utf-8"))
    assert data["thumbnail_atlas_manifest_path"] == (
        "viewer/atlases/32px/atlas-manifest.json"
    )


def test_exports_selected_comparison_layout_and_cluster_metadata(tmp_path):
    run = create_viewer_run(tmp_path)
    (run.run_dir / "layouts" / "dinov3_vits_256_umap_n8_mindist0p3_seed7.json").write_text(
        json.dumps(
            {
                "run_id": run.run_id,
                "recipe_name": "dinov3_vits_256",
                "layout_id": "umap_n8_mindist0p3_seed7",
                "method": "umap",
                "params": {
                    "effective_n_neighbors": 8,
                    "min_dist": 0.3,
                    "metric": "cosine",
                    "random_state": 7,
                },
                "points": [
                    {"image_id": "img-a", "x": 10.0, "y": 20.0},
                    {"image_id": "img-b", "x": 30.0, "y": 40.0},
                ],
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "clusters" / "dinov3_vits_256_kmeans_k1_seed7.json").write_text(
        json.dumps(
            {
                "run_id": run.run_id,
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "kmeans_k1_seed7",
                "method": "kmeans",
                "cluster_count": 1,
                "random_state": 7,
                "points": [
                    {"image_id": "img-a", "cluster_id": 0},
                    {"image_id": "img-b", "cluster_id": 0},
                ],
            }
        ),
        encoding="utf-8",
    )

    summary = export_viewer_data(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        layout_id="umap_n8_mindist0p3_seed7",
        cluster_id="kmeans_k1_seed7",
    )

    data = json.loads(summary.viewer_data_path.read_text(encoding="utf-8"))
    assert summary.layout_id == "umap_n8_mindist0p3_seed7"
    assert summary.cluster_id == "kmeans_k1_seed7"
    assert data["layout_id"] == "umap_n8_mindist0p3_seed7"
    assert data["cluster_id"] == "kmeans_k1_seed7"
    assert data["points"][0]["x"] == 10.0
    assert data["points"][0]["cluster_id"] == 0
    assert data["available_layouts"] == [
        {
            "layout_id": "umap_n4_mindist0p05_seed42",
            "method": "",
            "params": {},
        },
        {
            "layout_id": "umap_n8_mindist0p3_seed7",
            "method": "umap",
            "params": {
                "effective_n_neighbors": 8,
                "min_dist": 0.3,
                "metric": "cosine",
                "random_state": 7,
            },
        },
    ]
    assert data["available_clusters"] == [
        {
            "cluster_id": "kmeans_k1_seed7",
            "cluster_count": 1,
            "method": "kmeans",
            "random_state": 7,
        },
        {
            "cluster_id": "kmeans_k2_seed42",
            "cluster_count": 2,
            "method": "",
            "random_state": None,
        },
    ]


def test_exports_hdbscan_group_metadata_to_viewer_data(tmp_path):
    run = create_viewer_run(tmp_path)
    (run.run_dir / "clusters" / "dinov3_vits_256_hdbscan_balanced.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "asset_kind": "latent-map-cluster-result",
                "run_id": run.run_id,
                "recipe_name": "dinov3_vits_256",
                "cluster_id": "hdbscan_balanced_mcs25_ms10_eom",
                "label": "HDBSCAN · Balanced",
                "method": "hdbscan",
                "cluster_count": 1,
                "unassigned_count": 1,
                "params": {
                    "preset": "balanced",
                    "min_cluster_size": 25,
                    "min_samples": 10,
                    "cluster_selection_method": "eom",
                    "metric": "euclidean",
                    "vector_normalization": "l2",
                },
                "groups": [
                    {
                        "group_key": "unassigned",
                        "cluster_id": -1,
                        "label": "Unassigned",
                        "count": 1,
                        "kind": "unassigned",
                    },
                    {
                        "group_key": "cluster:0",
                        "cluster_id": 0,
                        "label": "Group 0",
                        "count": 1,
                        "kind": "cluster",
                    },
                ],
                "points": [
                    {
                        "image_id": "img-a",
                        "cluster_id": 0,
                        "group_key": "cluster:0",
                        "membership": 0.9,
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

    summary = export_viewer_data(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        cluster_id="hdbscan_balanced_mcs25_ms10_eom",
    )

    data = json.loads(summary.viewer_data_path.read_text(encoding="utf-8"))
    assert data["cluster_result"]["label"] == "HDBSCAN · Balanced"
    assert data["cluster_result"]["unassigned_count"] == 1
    assert data["cluster_result"]["groups"][0]["group_key"] == "unassigned"
    assert data["available_clusters"][0]["cluster_id"] == (
        "hdbscan_balanced_mcs25_ms10_eom"
    )
    assert data["points"][0]["cluster_group_key"] == "cluster:0"
    assert data["points"][0]["cluster_membership"] == 0.9
    assert data["points"][1]["cluster_id"] == -1
    assert data["points"][1]["cluster_group_key"] == "unassigned"


def test_export_rejects_missing_neighbor_references(tmp_path):
    run = create_viewer_run(tmp_path)
    (run.run_dir / "indexes" / "dinov3_vits_256_neighbors.jsonl").write_text(
        json.dumps(
            {
                "image_id": "img-a",
                "neighbor_rank": 1,
                "neighbor_image_id": "missing",
                "score": 0.8,
            }
        )
        + "\n",
        encoding="utf-8",
    )

    try:
        export_viewer_data(run_dir=run.run_dir, recipe_name="dinov3_vits_256")
    except ValueError as error:
        assert "unknown image ID" in str(error)
    else:
        raise AssertionError("expected missing neighbor reference to fail")
