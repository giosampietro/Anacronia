import json
from datetime import datetime, timezone

import numpy as np

from anacronia.latent_map_faiss import (
    build_faiss_index,
    query_faiss_neighbors,
    query_faiss_opposites,
    query_faiss_relations,
)
from anacronia.latent_map_runs import initialize_latent_map_run


def create_vector_run(tmp_path):
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
            "image_id": "img-a",
            "source_path": str(source_folder / "a.jpg"),
            "relative_path": "a.jpg",
            "thumbnail_path": "thumbnails/img-a.jpg",
        },
        {
            "image_id": "img-b",
            "source_path": str(source_folder / "b.jpg"),
            "relative_path": "b.jpg",
            "thumbnail_path": "thumbnails/img-b.jpg",
        },
        {
            "image_id": "img-c",
            "source_path": str(source_folder / "c.jpg"),
            "relative_path": "c.jpg",
            "thumbnail_path": "thumbnails/img-c.jpg",
        },
    ]
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
                [1.0, 0.0],
                [0.9, 0.1],
                [0.0, 1.0],
            ],
            dtype=np.float32,
        ),
    )
    (embeddings_dir / "dinov3_vits_256.json").write_text(
        json.dumps(
            {
                "recipe_name": "dinov3_vits_256",
                "vector_count": 3,
                "vector_dim": 2,
                "manifest_image_count": 3,
            }
        ),
        encoding="utf-8",
    )
    return run


def test_builds_flat_ip_index_with_explicit_id_map(tmp_path):
    run = create_vector_run(tmp_path)

    summary = build_faiss_index(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )

    assert summary.index_kind == "IndexFlatIP"
    assert summary.vector_count == 3
    assert summary.index_path.is_file()
    assert summary.id_map_path.is_file()
    assert summary.neighbors_path.is_file()
    id_map = json.loads(summary.id_map_path.read_text(encoding="utf-8"))
    assert id_map[0]["faiss_id"] == 0
    assert id_map[0]["image_id"] == "img-a"
    assert id_map[1]["image_id"] == "img-b"


def test_query_returns_cosine_neighbors_by_image_id(tmp_path):
    run = create_vector_run(tmp_path)
    build_faiss_index(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )

    neighbors = query_faiss_neighbors(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        image_id="img-a",
        top_k=2,
    )

    assert [neighbor.image_id for neighbor in neighbors] == ["img-b", "img-c"]
    assert neighbors[0].score > neighbors[1].score
    assert neighbors[0].faiss_id == 1


def test_query_uses_faiss_index_without_embedding_matrix(tmp_path):
    run = create_vector_run(tmp_path)
    build_faiss_index(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )
    (run.run_dir / "embeddings" / "dinov3_vits_256.npy").unlink()

    neighbors = query_faiss_neighbors(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        image_id="img-a",
        top_k=2,
    )

    assert [neighbor.image_id for neighbor in neighbors] == ["img-b", "img-c"]


def test_query_returns_opposites_from_faiss_index(tmp_path):
    run = create_vector_run(tmp_path)
    build_faiss_index(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )

    opposites = query_faiss_opposites(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        image_id="img-a",
        top_k=2,
    )

    assert [neighbor.image_id for neighbor in opposites] == ["img-c", "img-b"]
    assert opposites[0].score < opposites[1].score


def test_query_relations_returns_closest_and_opposites(tmp_path):
    run = create_vector_run(tmp_path)
    build_faiss_index(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )

    relations = query_faiss_relations(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        image_id="img-a",
        top_k=2,
        relation="both",
    )

    assert [neighbor.image_id for neighbor in relations["neighbors"]] == [
        "img-b",
        "img-c",
    ]
    assert [neighbor.image_id for neighbor in relations["opposites"]] == [
        "img-c",
        "img-b",
    ]


def test_query_can_include_self_when_requested(tmp_path):
    run = create_vector_run(tmp_path)
    build_faiss_index(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )

    neighbors = query_faiss_neighbors(
        run_dir=run.run_dir,
        recipe_name="dinov3_vits_256",
        image_id="img-a",
        top_k=1,
        include_self=True,
    )

    assert neighbors[0].image_id == "img-a"
    assert neighbors[0].score == 1.0
