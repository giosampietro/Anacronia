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
            "image_ids": ["img-a", "img-a-copy"],
            "provenance": {
                "cluster_id": "kmeans_k2_seed42",
                "kind": "cluster-selection",
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
