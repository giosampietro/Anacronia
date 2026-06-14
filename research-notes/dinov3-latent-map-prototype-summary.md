# DINOv3 Latent Map Prototype Summary

Status: review draft

This prototype is a disposable learning tool for testing whether Anacronia-style image sets can be explored through visual embedding space. It should not modify the main Anacronia app, database, or collection model. The output should teach us what to rebuild properly later.

## Short Summary

We will build a local prototype that accepts one external folder of images, generates DINOv3 embeddings, indexes visual similarity with FAISS, projects the result into a 2D UMAP map, and shows the images in a browser-based WebGL viewer.

The first goal is not production quality. The first goal is to learn whether DINOv3 produces useful visual neighborhoods for Anacronia research material, and whether a spatial image atlas helps the user navigate a large, unlabeled image set.

## Current MVP Shape

- Input: one folder only.
- Formats: jpg, jpeg, png, webp.
- Scale target: around 5,000 images, with awareness that 10,000 may happen.
- Image handling: do not mutate originals; generate thumbnails and store source paths in a run manifest.
- Preprocessing comparison: run both 256px and 384px recipes.
- Aspect ratio: preserve aspect ratio; do not force square crops.
- Padding: only when needed for model/batch compatibility.
- Model: DINOv3 ViT-S, frozen, local PyTorch MPS.
- Embeddings: save normalized global vectors.
- Similarity: FAISS over normalized vectors.
- Projection: UMAP 2D only.
- Viewer: Three.js/WebGL for the map; shadcn for controls around the map.
- UI interactions: zoom/pan, hover thumbnail, cluster colors, nearest-neighbor selection.
- Excluded from MVP: detail panel, production Anacronia DB integration, training, fine-tuning, classifier.

## Long Brief Takeaways

The imported long brief confirms the current direction, but it adds useful architecture discipline that should survive into the PRD.

Preserve these decisions:

- Source images are read-only. Do not move, rename, or modify originals.
- Treat embeddings, FAISS indexes, UMAP layouts, and clusters as Analysis Results layered over images.
- Keep every generated layer separate and versioned: thumbnails, embedding runs, FAISS indexes, UMAP layouts, clusters, viewer state.
- Store large vectors outside SQLite; use SQLite for metadata, run records, file paths, offsets, and IDs.
- Keep an explicit FAISS ID mapping instead of assuming FAISS row order is the application identity.
- Use normalized vectors and FAISS `IndexFlatIP` first; postpone HNSW/IVF/PQ until scale benchmarks prove they are needed.
- Store UMAP coordinates with `layout_id`, model/run ID, and parameter JSON.
- Preserve folder/category metadata derived from the input folder tree, even though the prototype scans only one folder.
- Never use UMAP screen distance as the source of truth for nearest neighbors; FAISS remains the similarity layer.
- Do not eagerly load full-size originals or all thumbnails into the frontend.

Scope corrections from the long brief:

- Its full CLI/database/server architecture is useful as a future shape, but too broad for the first disposable prototype.
- Its 30k-to-200k archive framing should become future-scale notes. The first prototype target remains around 5k images.
- Its Canvas/PixiJS warning is valid: if we use Three.js, use it as a 2D WebGL renderer, not as a 3D visual metaphor.
- Its neighbor panel is broader than the current MVP. For now, avoid a full detail panel; use hover/focus thumbnail, compact status, and neighbor highlighting.

## Conceptual Pipeline

```text
external image folder
-> manifest + thumbnails
-> DINOv3 image embeddings
-> L2-normalized vectors
-> FAISS nearest-neighbor index
-> UMAP 2D projection
-> clustering/labels for visual overlays
-> Three.js viewer
```

UMAP is the map-drawing step. FAISS is the similarity/search step. The viewer should make both visible: the 2D map for navigation, and the original high-dimensional nearest neighbors for actual similarity inspection.

## Future Research Direction: Multi-Embedding Explorer

A major research direction is to support multiple embedding spaces for the same image set.

DINOv3 should represent visual/formal similarity:

- shape
- composition
- texture
- material
- object structure
- visual style

SigLIP2 should represent semantic/language-aligned similarity:

- object category
- concept
- iconography
- text-aligned meaning
- broader semantic family

These spaces should not be mixed casually as raw vectors. The safer approach is to normalize each embedding space separately, then combine similarity scores or build weighted fused vectors.

Example weighted fusion:

```text
combined_similarity =
  0.70 * cosine(dino_a, dino_b)
+ 0.30 * cosine(siglip_a, siglip_b)
```

Equivalent fused-vector strategy:

```text
fused_vector = [
  sqrt(dino_weight) * dino_vector,
  sqrt(siglip_weight) * siglip_vector
]
```

This would enable a future viewer slider:

```text
pure visual <-> mixed <-> pure semantic
```

The most interesting research feature may be disagreement analysis:

- close in DINO, far in SigLIP2: visually similar but semantically different.
- far in DINO, close in SigLIP2: semantically related but visually different.
- close in both: stable similarity.
- far in both: outliers or unrelated images.

This direction should be documented in the PRD as future exploration, not as a requirement for the first disposable MVP.

## Historical Notes To Preserve

The long brief contains historical dead ends that should stay in the PRD notes so we do not reopen them accidentally:

- PixPlot is a reference, not the technical base. It validates the image-atlas idea but has a weaker incremental/search story.
- ImagePlot 2.2 is a reference, not the technical base. Its browser-only pixel-feature workflow does not match DINO/FAISS/UMAP architecture.
- ImagePlot UI ideas worth borrowing: hover preview, image/circle display toggle, color-by-column, compare mode, PNG/TSV export.
- ImagePlot-style low-level metrics may become future interpretable features: brightness, saturation, hue, entropy, edge density, orientation, contrast, aspect ratio, histograms.
- GPT/GPT-4-class vision should be postponed to semantic labels, captions, JSON metadata, and explanations. It should not replace the embedding map.
- Gemini Embedding 2 and Google Vector Search should be postponed as cloud benchmarks/infrastructure options.
- PCA/t-SNE are not the first map baseline. PaCMAP, TriMap, and densMAP are later comparison methods after UMAP is understood.
- DINOv2 remains the fallback if DINOv3 access, license, or performance blocks progress.

## Review Process

1. Review this short summary with the user.
2. Import/paste the other ChatGPT summary.
3. Check whether it adds decisions, warnings, sources, or alternative architecture worth preserving.
4. Merge the useful parts into a prototype PRD.
5. Keep future exploration notes separate from MVP requirements.
6. Build only after the PRD converges enough to avoid losing important research detail.

## Open PRD Items

- Decide whether to save both pooler and CLS vectors in the first DINO run.
- Decide which clustering methods to include in the first prototype pass.
- Decide whether thumbnails are enough, or whether the run folder should optionally copy source images.
- Decide exact run-folder structure and naming.
- Decide whether the prototype viewer is a route inside the isolated Anacronia web app or a standalone static viewer.
- Decide how much of the generated run report should be human-readable Markdown versus machine-readable JSON.
- Decide whether the prototype needs a minimal SQLite run database immediately, or whether JSON/NumPy files are enough for the first disposable run.
- Decide the UI data contract for map points, including image ID, thumbnail path, source path, folder/category, embedding run, layout ID, and cluster ID.
- Decide whether duplicate signals should be generated in the first pass: SHA256, perceptual hash, and/or DINO nearest-neighbor duplicate candidates.
