from __future__ import annotations

from dataclasses import dataclass
import json
import time
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image, ImageOps

from anacronia.latent_map_embedding_recipes import (
    DINO_EMBEDDING_RECIPES,
    EmbeddingRecipe,
)
from anacronia.latent_map_runs import DINO_MEAN_PADDING_RGB


IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


@dataclass(frozen=True)
class PreparedEmbeddingImage:
    image: Image.Image
    resized_size: tuple[int, int]
    padding_offset: tuple[int, int]


@dataclass(frozen=True)
class LatentMapEmbeddingSummary:
    run_id: str
    recipe_name: str
    model_id: str
    device: str
    vector_count: int
    vector_dim: int
    embedding_path: Path
    metadata_path: Path
    elapsed_seconds: float


class ImageEmbedder(Protocol):
    model_id: str
    device: str

    def embed_batch(self, images: list[Image.Image]) -> np.ndarray:
        ...


def prepare_image_for_embedding(
    image: Image.Image,
    *,
    recipe: EmbeddingRecipe,
) -> PreparedEmbeddingImage:
    source_image = ImageOps.exif_transpose(image).convert("RGB")
    width, height = source_image.size
    scale = recipe.long_edge / max(width, height)
    resized_size = (
        max(1, round(width * scale)),
        max(1, round(height * scale)),
    )
    resized = source_image.resize(resized_size, Image.Resampling.LANCZOS)
    padded_size = (
        _ceil_multiple(resized_size[0], recipe.pad_to_multiple),
        _ceil_multiple(resized_size[1], recipe.pad_to_multiple),
    )
    if padded_size == resized_size:
        return PreparedEmbeddingImage(
            image=resized,
            resized_size=resized_size,
            padding_offset=(0, 0),
        )

    padded = Image.new("RGB", padded_size, DINO_MEAN_PADDING_RGB)
    offset = (
        (padded_size[0] - resized_size[0]) // 2,
        (padded_size[1] - resized_size[1]) // 2,
    )
    padded.paste(resized, offset)
    return PreparedEmbeddingImage(
        image=padded,
        resized_size=resized_size,
        padding_offset=offset,
    )


def embed_latent_map_run(
    *,
    run_dir: Path,
    recipe_name: str,
    batch_size: int = 8,
    limit: int | None = None,
    device: str = "auto",
    embedder: ImageEmbedder | None = None,
) -> LatentMapEmbeddingSummary:
    if recipe_name not in DINO_EMBEDDING_RECIPES:
        raise ValueError(f"Unknown embedding recipe: {recipe_name}")
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")
    if limit is not None and limit < 1:
        raise ValueError("limit must be at least 1 when provided")

    resolved_run_dir = run_dir.expanduser().resolve()
    config = _read_run_config(resolved_run_dir)
    run_id = str(config["run_id"])
    manifest_path = resolved_run_dir / "manifest.jsonl"
    if not manifest_path.is_file():
        raise ValueError(f"Latent-map manifest not found: {manifest_path}")

    recipe = DINO_EMBEDDING_RECIPES[recipe_name]
    rows = _read_jsonl(manifest_path)
    selected_rows = rows[:limit] if limit is not None else rows
    resolved_embedder = embedder or DinoImageEmbedder(
        model_id=recipe.model_id,
        device=device,
    )

    started_at = time.perf_counter()
    vectors = _embed_manifest_rows(
        rows=selected_rows,
        recipe=recipe,
        batch_size=batch_size,
        embedder=resolved_embedder,
    )
    vectors = _l2_normalize(vectors)
    elapsed_seconds = time.perf_counter() - started_at

    embeddings_dir = resolved_run_dir / "embeddings"
    embeddings_dir.mkdir(parents=True, exist_ok=True)
    embedding_path = embeddings_dir / f"{recipe_name}.npy"
    metadata_path = embeddings_dir / f"{recipe_name}.json"
    np.save(embedding_path, vectors.astype(np.float32))

    metadata = {
        "run_id": run_id,
        "recipe_name": recipe.name,
        "recipe": {
            "family": recipe.family,
            "long_edge": recipe.long_edge,
            "model_id": recipe.model_id,
            "pad_to_multiple": recipe.pad_to_multiple,
            "padding_color_rgb": list(DINO_MEAN_PADDING_RGB),
            "preserve_aspect_ratio": True,
        },
        "model_id": resolved_embedder.model_id,
        "device": resolved_embedder.device,
        "batch_size": batch_size,
        "limit": limit,
        "manifest_path": str(manifest_path),
        "manifest_image_count": len(rows),
        "vector_count": int(vectors.shape[0]),
        "vector_dim": int(vectors.shape[1]) if vectors.ndim == 2 else 0,
        "embedding_path": str(embedding_path),
        "elapsed_seconds": elapsed_seconds,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    _append_embedding_report(
        run_dir=resolved_run_dir,
        recipe_name=recipe_name,
        vector_count=metadata["vector_count"],
        vector_dim=metadata["vector_dim"],
        elapsed_seconds=elapsed_seconds,
        embedding_path=embedding_path,
    )

    return LatentMapEmbeddingSummary(
        run_id=run_id,
        recipe_name=recipe_name,
        model_id=resolved_embedder.model_id,
        device=resolved_embedder.device,
        vector_count=metadata["vector_count"],
        vector_dim=metadata["vector_dim"],
        embedding_path=embedding_path,
        metadata_path=metadata_path,
        elapsed_seconds=elapsed_seconds,
    )


class DinoImageEmbedder:
    def __init__(self, *, model_id: str, device: str = "auto") -> None:
        try:
            import torch
            from transformers import AutoModel
        except Exception as exc:  # pragma: no cover - exercised by manual setup checks
            raise RuntimeError(
                "DINO embedding dependencies are missing. "
                "Run batch-cmd/setup-dinov3-local.command first."
            ) from exc

        selected_device = _resolve_torch_device(torch=torch, requested_device=device)
        self.model_id = model_id
        self.device = selected_device
        self._torch = torch
        self._model = AutoModel.from_pretrained(model_id).to(selected_device).eval()

    def embed_batch(self, images: list[Image.Image]) -> np.ndarray:
        tensor = self._images_to_tensor(images)
        with self._torch.inference_mode():
            outputs = self._model(pixel_values=tensor)
        if self.device == "mps":
            self._torch.mps.synchronize()
        if getattr(outputs, "pooler_output", None) is not None:
            embeddings = outputs.pooler_output
        else:
            embeddings = outputs.last_hidden_state[:, 0]
        return embeddings.detach().cpu().numpy().astype(np.float32)

    def _images_to_tensor(self, images: list[Image.Image]):
        arrays = []
        mean = np.asarray(IMAGENET_MEAN, dtype=np.float32)
        std = np.asarray(IMAGENET_STD, dtype=np.float32)
        for image in images:
            array = np.asarray(image, dtype=np.float32) / 255.0
            array = (array - mean) / std
            arrays.append(np.transpose(array, (2, 0, 1)))
        return self._torch.from_numpy(np.stack(arrays)).to(self.device)


DinoV3Embedder = DinoImageEmbedder


def _embed_manifest_rows(
    *,
    rows: list[dict[str, object]],
    recipe: EmbeddingRecipe,
    batch_size: int,
    embedder: ImageEmbedder,
) -> np.ndarray:
    if not rows:
        return np.empty((0, 0), dtype=np.float32)

    vectors_by_index: list[np.ndarray | None] = [None] * len(rows)
    grouped_images: dict[tuple[int, int], list[tuple[int, Image.Image]]] = {}

    for index, row in enumerate(rows):
        source_path = Path(str(row["source_path"]))
        with Image.open(source_path) as image:
            prepared = prepare_image_for_embedding(image, recipe=recipe)
        group = grouped_images.setdefault(prepared.image.size, [])
        group.append((index, prepared.image))
        if len(group) >= batch_size:
            _embed_group(group=group, embedder=embedder, vectors_by_index=vectors_by_index)
            group.clear()

    for group in grouped_images.values():
        if group:
            _embed_group(group=group, embedder=embedder, vectors_by_index=vectors_by_index)

    vectors = [vector for vector in vectors_by_index if vector is not None]
    if len(vectors) != len(rows):
        raise RuntimeError("Embedding count did not match manifest row count.")
    return np.vstack(vectors).astype(np.float32)


def _embed_group(
    *,
    group: list[tuple[int, Image.Image]],
    embedder: ImageEmbedder,
    vectors_by_index: list[np.ndarray | None],
) -> None:
    indexes = [index for index, _image in group]
    images = [image for _index, image in group]
    vectors = np.asarray(embedder.embed_batch(images), dtype=np.float32)
    if vectors.ndim != 2 or vectors.shape[0] != len(images):
        raise ValueError("Embedder returned an invalid batch shape.")
    for index, vector in zip(indexes, vectors, strict=True):
        vectors_by_index[index] = vector


def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
    if vectors.size == 0:
        return vectors.astype(np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (vectors / norms).astype(np.float32)


def _read_run_config(run_dir: Path) -> dict[str, object]:
    config_path = run_dir / "config.json"
    if not config_path.is_file():
        raise ValueError(f"Latent-map config not found: {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _append_embedding_report(
    *,
    run_dir: Path,
    recipe_name: str,
    vector_count: int,
    vector_dim: int,
    elapsed_seconds: float,
    embedding_path: Path,
) -> None:
    report_path = run_dir / "report.md"
    existing_report = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    addition = "\n".join(
        [
            "",
            "## Embeddings",
            "",
            f"- Recipe: `{recipe_name}`",
            f"- Vectors: {vector_count}",
            f"- Dimensions: {vector_dim}",
            f"- Elapsed seconds: {elapsed_seconds:.3f}",
            f"- File: `{embedding_path}`",
            "",
        ]
    )
    report_path.write_text(existing_report.rstrip() + addition, encoding="utf-8")


def _ceil_multiple(value: int, multiple: int) -> int:
    return ((value + multiple - 1) // multiple) * multiple


def _resolve_torch_device(*, torch, requested_device: str) -> str:
    if requested_device != "auto":
        return requested_device
    return "mps" if torch.backends.mps.is_available() else "cpu"
