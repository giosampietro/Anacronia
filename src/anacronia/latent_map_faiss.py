from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import faiss
import numpy as np


@dataclass(frozen=True)
class FaissIndexSummary:
    run_id: str
    recipe_name: str
    index_kind: str
    vector_count: int
    vector_dim: int
    index_path: Path
    id_map_path: Path
    neighbors_path: Path


@dataclass(frozen=True)
class FaissNeighbor:
    faiss_id: int
    image_id: str
    score: float
    source_path: str
    relative_path: str


def build_faiss_index(
    *,
    run_dir: Path,
    recipe_name: str,
    top_k: int = 20,
) -> FaissIndexSummary:
    if top_k < 1:
        raise ValueError("top_k must be at least 1")

    resolved_run_dir = run_dir.expanduser().resolve()
    run_id = _read_run_id(resolved_run_dir)
    vectors = _load_vectors(resolved_run_dir=resolved_run_dir, recipe_name=recipe_name)
    manifest_rows = _load_manifest_rows(resolved_run_dir)
    if vectors.shape[0] > len(manifest_rows):
        raise ValueError("Embedding vector count exceeds manifest image count.")
    mapped_rows = manifest_rows[: vectors.shape[0]]

    normalized_vectors = _l2_normalize(vectors)
    index = faiss.IndexFlatIP(int(normalized_vectors.shape[1]))
    index.add(normalized_vectors)

    indexes_dir = resolved_run_dir / "indexes"
    indexes_dir.mkdir(parents=True, exist_ok=True)
    index_path = indexes_dir / f"{recipe_name}_flat_ip.faiss"
    id_map_path = indexes_dir / f"{recipe_name}_faiss_id_map.json"
    neighbors_path = indexes_dir / f"{recipe_name}_neighbors.jsonl"
    faiss.write_index(index, str(index_path))

    id_map = [
        {
            "faiss_id": faiss_id,
            "image_id": str(row["image_id"]),
            "source_path": str(row.get("source_path", "")),
            "relative_path": str(row.get("relative_path", "")),
        }
        for faiss_id, row in enumerate(mapped_rows)
    ]
    id_map_path.write_text(json.dumps(id_map, indent=2) + "\n", encoding="utf-8")
    _write_neighbors(
        index=index,
        vectors=normalized_vectors,
        id_map=id_map,
        neighbors_path=neighbors_path,
        top_k=top_k,
    )
    _append_faiss_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        vector_count=int(normalized_vectors.shape[0]),
        vector_dim=int(normalized_vectors.shape[1]),
        index_path=index_path,
    )

    return FaissIndexSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        index_kind="IndexFlatIP",
        vector_count=int(normalized_vectors.shape[0]),
        vector_dim=int(normalized_vectors.shape[1]),
        index_path=index_path,
        id_map_path=id_map_path,
        neighbors_path=neighbors_path,
    )


def query_faiss_neighbors(
    *,
    run_dir: Path,
    recipe_name: str,
    image_id: str,
    top_k: int = 20,
    include_self: bool = False,
) -> list[FaissNeighbor]:
    if top_k < 1:
        raise ValueError("top_k must be at least 1")

    resolved_run_dir = run_dir.expanduser().resolve()
    indexes_dir = resolved_run_dir / "indexes"
    index_path = indexes_dir / f"{recipe_name}_flat_ip.faiss"
    id_map_path = indexes_dir / f"{recipe_name}_faiss_id_map.json"
    if not index_path.is_file():
        raise ValueError(f"FAISS index not found: {index_path}")
    if not id_map_path.is_file():
        raise ValueError(f"FAISS ID map not found: {id_map_path}")

    id_map = json.loads(id_map_path.read_text(encoding="utf-8"))
    faiss_id = _faiss_id_for_image_id(id_map=id_map, image_id=image_id)
    vectors = _l2_normalize(
        _load_vectors(resolved_run_dir=resolved_run_dir, recipe_name=recipe_name)
    )
    if faiss_id >= vectors.shape[0]:
        raise ValueError(f"FAISS ID is outside the embedding matrix: {faiss_id}")
    index = faiss.read_index(str(index_path))
    search_count = min(index.ntotal, top_k + (0 if include_self else 1))
    scores, ids = index.search(vectors[faiss_id : faiss_id + 1], search_count)

    neighbors: list[FaissNeighbor] = []
    for score, neighbor_id in zip(scores[0], ids[0], strict=True):
        if neighbor_id < 0:
            continue
        neighbor_faiss_id = int(neighbor_id)
        if not include_self and neighbor_faiss_id == faiss_id:
            continue
        row = id_map[neighbor_faiss_id]
        neighbors.append(
            FaissNeighbor(
                faiss_id=neighbor_faiss_id,
                image_id=str(row["image_id"]),
                score=float(score),
                source_path=str(row.get("source_path", "")),
                relative_path=str(row.get("relative_path", "")),
            )
        )
        if len(neighbors) == top_k:
            break
    return neighbors


def _load_vectors(*, resolved_run_dir: Path, recipe_name: str) -> np.ndarray:
    embedding_path = resolved_run_dir / "embeddings" / f"{recipe_name}.npy"
    if not embedding_path.is_file():
        raise ValueError(f"Embedding file not found: {embedding_path}")
    vectors = np.load(embedding_path).astype(np.float32)
    if vectors.ndim != 2 or vectors.shape[0] == 0 or vectors.shape[1] == 0:
        raise ValueError("Embedding matrix must be non-empty and two-dimensional.")
    return vectors


def _load_manifest_rows(run_dir: Path) -> list[dict[str, object]]:
    manifest_path = run_dir / "manifest.jsonl"
    if not manifest_path.is_file():
        raise ValueError(f"Manifest not found: {manifest_path}")
    return [
        json.loads(line)
        for line in manifest_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _read_run_id(run_dir: Path) -> str:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return str(json.loads(config_path.read_text(encoding="utf-8"))["run_id"])


def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (vectors / norms).astype(np.float32)


def _faiss_id_for_image_id(*, id_map: list[dict[str, object]], image_id: str) -> int:
    for row in id_map:
        if row["image_id"] == image_id:
            return int(row["faiss_id"])
    raise ValueError(f"Image ID not found in FAISS map: {image_id}")


def _write_neighbors(
    *,
    index,
    vectors: np.ndarray,
    id_map: list[dict[str, object]],
    neighbors_path: Path,
    top_k: int,
) -> None:
    rows = []
    for row in id_map:
        neighbors = query_from_loaded_index(
            index=index,
            vectors=vectors,
            id_map=id_map,
            faiss_id=int(row["faiss_id"]),
            top_k=top_k,
        )
        rows.extend(
            {
                "image_id": row["image_id"],
                "neighbor_rank": rank,
                "neighbor_image_id": neighbor.image_id,
                "neighbor_faiss_id": neighbor.faiss_id,
                "score": neighbor.score,
            }
            for rank, neighbor in enumerate(neighbors, start=1)
        )
    neighbors_path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def query_from_loaded_index(
    *,
    index,
    vectors: np.ndarray,
    id_map: list[dict[str, object]],
    faiss_id: int,
    top_k: int,
) -> list[FaissNeighbor]:
    search_count = min(index.ntotal, top_k + 1)
    scores, ids = index.search(vectors[faiss_id : faiss_id + 1], search_count)
    neighbors: list[FaissNeighbor] = []
    for score, neighbor_id in zip(scores[0], ids[0], strict=True):
        neighbor_faiss_id = int(neighbor_id)
        if neighbor_faiss_id < 0 or neighbor_faiss_id == faiss_id:
            continue
        row = id_map[neighbor_faiss_id]
        neighbors.append(
            FaissNeighbor(
                faiss_id=neighbor_faiss_id,
                image_id=str(row["image_id"]),
                score=float(score),
                source_path=str(row.get("source_path", "")),
                relative_path=str(row.get("relative_path", "")),
            )
        )
        if len(neighbors) == top_k:
            break
    return neighbors


def _append_faiss_report(
    *,
    run_dir: Path,
    recipe_name: str,
    vector_count: int,
    vector_dim: int,
    index_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## FAISS",
            "",
            f"- Recipe: `{recipe_name}`",
            "- Index: `IndexFlatIP`",
            f"- Vectors: {vector_count}",
            f"- Dimensions: {vector_dim}",
            f"- File: `{index_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")
