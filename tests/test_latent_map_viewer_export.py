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
            "width": 100,
            "height": 200,
        },
        {
            "image_id": "img-b",
            "source_path": str(source_folder / "b.jpg"),
            "relative_path": "b.jpg",
            "thumbnail_path": "thumbnails/img-b.jpg",
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


def test_exports_compact_viewer_data_with_neighbors(tmp_path):
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
    assert data["points"][0] == {
        "image_id": "img-a",
        "x": 1.0,
        "y": 2.0,
        "cluster_id": 0,
        "thumbnail_path": "thumbnails/img-a.jpg",
        "source_path": str((tmp_path / "source-images" / "a.jpg").resolve()),
        "relative_path": "a.jpg",
        "width": 100,
        "height": 200,
        "neighbors": [
            {
                "rank": 1,
                "image_id": "img-b",
                "score": 0.8,
            }
        ],
    }


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
