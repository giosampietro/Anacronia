from __future__ import annotations

from dataclasses import dataclass


PRIMARY_DINO_MODEL = "facebook/dinov3-vits16-pretrain-lvd1689m"


@dataclass(frozen=True)
class EmbeddingRecipe:
    name: str
    family: str
    model_id: str
    long_edge: int
    pad_to_multiple: int = 16


DINO_EMBEDDING_RECIPES = {
    "dinov3_vits_256": EmbeddingRecipe(
        name="dinov3_vits_256",
        family="dinov3",
        model_id=PRIMARY_DINO_MODEL,
        long_edge=256,
    ),
    "dinov3_vits_384": EmbeddingRecipe(
        name="dinov3_vits_384",
        family="dinov3",
        model_id=PRIMARY_DINO_MODEL,
        long_edge=384,
    ),
}
