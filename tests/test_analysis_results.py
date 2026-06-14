import json
from datetime import datetime, timezone

from anacronia.analysis_result_contract import assert_analysis_result_manifest_contract
from anacronia.analysis_results import wrap_legacy_latent_map_run_as_analysis_result
from anacronia.latent_map_runs import initialize_latent_map_run
from anacronia.latent_map_viewer_export import export_viewer_data


def create_legacy_latent_map_run(tmp_path):
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
        },
        {
            "image_id": "img-b",
            "source_path": str(source_folder / "b.jpg"),
            "relative_path": "b.jpg",
            "thumbnail_path": "thumbnails/img-b.jpg",
            "preview_path": "previews/img-b.jpg",
        },
    ]
    (run.run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in manifest_rows),
        encoding="utf-8",
    )
    (run.run_dir / "embeddings" / "dinov3_vits_256_embeddings.npy").write_bytes(
        b"embedding-bytes"
    )
    (run.run_dir / "indexes" / "dinov3_vits_256_flat_ip.faiss").write_bytes(
        b"faiss-bytes"
    )
    (run.run_dir / "indexes" / "dinov3_vits_256_faiss_id_map.json").write_text(
        json.dumps({"ids": ["img-a", "img-b"]}),
        encoding="utf-8",
    )
    (run.run_dir / "indexes" / "dinov3_vits_256_neighbors.jsonl").write_text(
        json.dumps(
            {
                "image_id": "img-a",
                "neighbor_rank": 1,
                "neighbor_image_id": "img-b",
                "score": 0.8,
            }
        )
        + "\n",
        encoding="utf-8",
    )
    (run.run_dir / "layouts" / "dinov3_vits_256_umap_n15_seed42.json").write_text(
        json.dumps(
            {
                "layout_id": "umap_n15_seed42",
                "recipe_name": "dinov3_vits_256",
                "points": [
                    {"image_id": "img-a", "x": 0.0, "y": 0.0},
                    {"image_id": "img-b", "x": 1.0, "y": 1.0},
                ],
            }
        ),
        encoding="utf-8",
    )
    (
        run.run_dir
        / "clusters"
        / "dinov3_vits_256_hdbscan_detail_mcs15_ms5_leaf.json"
    ).write_text(
        json.dumps(
            {
                "cluster_id": "hdbscan_detail_mcs15_ms5_leaf",
                "recipe_name": "dinov3_vits_256",
                "method": "hdbscan",
                "points": [
                    {"image_id": "img-a", "cluster_id": 0},
                    {"image_id": "img-b", "cluster_id": -1},
                ],
            }
        ),
        encoding="utf-8",
    )
    (run.run_dir / "viewer" / "map-data.json").write_text(
        json.dumps({"run_id": run.run_id}),
        encoding="utf-8",
    )
    (run.run_dir / "viewer" / "atlases" / "32px").mkdir(parents=True)
    (run.run_dir / "viewer" / "atlases" / "32px" / "atlas-manifest.json").write_text(
        json.dumps(
            {
                "asset_kind": "latent-map-thumbnail-atlas",
                "page_count": 0,
                "tile_size": 32,
            }
        ),
        encoding="utf-8",
    )

    return run


def relative_files(root):
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
    }


def test_wraps_legacy_run_as_path_clean_analysis_result_manifest(tmp_path):
    run = create_legacy_latent_map_run(tmp_path)
    before_files = relative_files(run.run_dir)

    summary = wrap_legacy_latent_map_run_as_analysis_result(
        run_dir=run.run_dir,
        wrapped_at=datetime(2026, 6, 14, 10, 0, tzinfo=timezone.utc),
    )

    after_files = relative_files(run.run_dir)
    manifest = json.loads(summary.manifest_path.read_text(encoding="utf-8"))
    serialized = json.dumps(manifest)
    artifact_keys = {artifact["key"] for artifact in manifest["artifacts"]}

    assert after_files - before_files == {"analysis-result.json"}
    assert summary.analysis_result_id == "latent-map-20260609T123000Z-j-shoot"
    assert summary.item_count == 2
    assert manifest["asset_kind"] == "analysis-result-manifest"
    assert manifest["analysis_result_id"] == "latent-map-20260609T123000Z-j-shoot"
    assert manifest["status"] == "ready"
    assert manifest["source"]["kind"] == "legacy-latent-map-run"
    assert manifest["source"]["run_id"] == run.run_id
    assert manifest["source"]["source_folder_name"] == "source-images"
    assert manifest["item_count"] == 2
    assert manifest["recipes"] == [
        {
            "recipe_name": "dinov3_vits_256",
            "artifact_counts": {
                "clusters": 1,
                "embeddings": 1,
                "indexes": 3,
                "layouts": 1,
            },
            "artifact_keys": {
                "baseline_atlas_manifest": "viewer/atlases/32px/atlas-manifest.json",
                "clusters": [
                    {
                        "cluster_id": "hdbscan_detail_mcs15_ms5_leaf",
                        "key": "clusters/dinov3_vits_256_hdbscan_detail_mcs15_ms5_leaf.json",
                    }
                ],
                "embedding_vectors": "embeddings/dinov3_vits_256_embeddings.npy",
                "faiss_id_map": "indexes/dinov3_vits_256_faiss_id_map.json",
                "faiss_index": "indexes/dinov3_vits_256_flat_ip.faiss",
                "image_manifest": "manifest.jsonl",
                "layouts": [
                    {
                        "key": "layouts/dinov3_vits_256_umap_n15_seed42.json",
                        "layout_id": "umap_n15_seed42",
                    }
                ],
                "thumbnail_atlas_manifests": {
                    "32": "viewer/atlases/32px/atlas-manifest.json"
                },
                "vector_id_map": "indexes/dinov3_vits_256_faiss_id_map.json",
                "viewer_data": "viewer/map-data.json",
            },
            "vector_mapping": {
                "image_id_order_format": "faiss-id-map-json",
                "image_id_order_key": "indexes/dinov3_vits_256_faiss_id_map.json",
            },
        }
    ]
    assert "config.json" in artifact_keys
    assert "manifest.jsonl" in artifact_keys
    assert "layouts/dinov3_vits_256_umap_n15_seed42.json" in artifact_keys
    assert "clusters/dinov3_vits_256_hdbscan_detail_mcs15_ms5_leaf.json" in artifact_keys
    assert "viewer/atlases/32px/atlas-manifest.json" in artifact_keys
    assert all(artifact["byte_size"] > 0 for artifact in manifest["artifacts"])
    assert all("required" in artifact for artifact in manifest["artifacts"])
    assert_analysis_result_manifest_contract(manifest)
    assert str(run.source_folder) not in serialized
    assert "source_path" not in serialized


def test_wrap_legacy_run_reuses_existing_manifest_without_rewriting(tmp_path):
    run = create_legacy_latent_map_run(tmp_path)

    first = wrap_legacy_latent_map_run_as_analysis_result(
        run_dir=run.run_dir,
        wrapped_at=datetime(2026, 6, 14, 10, 0, tzinfo=timezone.utc),
    )
    first_payload = first.manifest_path.read_text(encoding="utf-8")

    second = wrap_legacy_latent_map_run_as_analysis_result(
        run_dir=run.run_dir,
        wrapped_at=datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc),
    )

    assert second.analysis_result_id == first.analysis_result_id
    assert second.manifest_path == first.manifest_path
    assert second.manifest_path.read_text(encoding="utf-8") == first_payload


def test_wrapped_legacy_run_still_exports_existing_viewer_data(tmp_path):
    run = create_legacy_latent_map_run(tmp_path)

    wrap_legacy_latent_map_run_as_analysis_result(
        run_dir=run.run_dir,
        wrapped_at=datetime(2026, 6, 14, 10, 0, tzinfo=timezone.utc),
    )
    summary = export_viewer_data(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
    )

    data = json.loads(summary.viewer_data_path.read_text(encoding="utf-8"))
    assert summary.point_count == 2
    assert data["run_id"] == run.run_id
    assert data["recipe_name"] == "dinov3_vits_256"
    assert data["points"][0]["image_id"] == "img-a"
    assert "analysis-result.json" in relative_files(run.run_dir)
