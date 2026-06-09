# Latent Map MVP1 Findings: J Shoot

Date: June 9, 2026

Issue: #188

Run directory: `/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609`

Source folder: `/Users/giorgio/Documents/Codex/Exports/J Shoot/images`

## Pipeline

- Model: `facebook/dinov3-vits16-pretrain-lvd1689m`
- Device: Apple Silicon `mps`
- Batch size: `16`
- Recipes compared: `dinov3_vits_256`, `dinov3_vits_384`
- Preprocessing: preserve aspect ratio, resize by long edge, pad both sides to a multiple of 16.
- FAISS: `IndexFlatIP` over L2-normalized vectors, `top_k=20`.
- Layout: UMAP 2D, cosine metric, `n_neighbors=15`, `min_dist=0.05`, `random_state=42`.
- Clustering: KMeans, `k=12`, `random_state=42`.

## Counts

- Top-level files observed: `3,186`
- Supported image files: `3,184`
- Manifest images processed: `3,184`
- Skipped files: `2`
- Skipped details: `.DS_Store` and `Close.webloc`, both `unsupported_file_type`
- Corrupt image failures: `0`
- Output vectors per recipe: `3,184`
- Vector dimensions: `384`

## Timings

Scan wall time was observed at about `49s`; the later stages were timed directly.

| Stage | 256px | 384px |
| --- | ---: | ---: |
| Embedding | `119.96s` | `187.51s` |
| FAISS build + neighbor rows | `0.92s` | `0.85s` |
| UMAP + KMeans | `22.82s` | `19.89s` |
| Viewer export | `0.56s` | `0.73s` |

384px embedding was about `1.56x` slower than 256px on this run. FAISS, UMAP, clustering, and export are not the bottleneck at this scale.

## Disk Use

- Whole run: `110M`
- Generated thumbnails: `38M`
- Embeddings: `9.3M`
- FAISS indexes, maps, neighbor rows: `31M`
- Layout JSON: `748K`
- Cluster JSON: `512K`
- Viewer JSON files: `28M`

The viewer JSON is large because each recipe export includes 3,184 points with 20 neighbor references.

## 256px vs 384px

Both recipes produce 384-dimensional DINOv3 vectors. The difference is input detail, not output dimensionality.

Neighbor overlap between 256px and 384px was stable:

- Top 5: average overlap `3.28 / 5`
- Top 10: average overlap `6.59 / 10`
- Top 20: average overlap `13.39 / 20`

Qualitative checks:

- Jewelry/product-object anchors clustered with other jewelry, stones, rings, and product still lifes.
- Glass/reflection/interior anchors clustered with other glass, mirror, window, and architectural reflection images.
- 384px was sometimes slightly more object-shape precise.
- 256px was fast enough and produced useful neighborhoods; its point layout was easier to inspect at default zoom in this prototype.

Recommendation for MVP iteration: use `256px` as the default recipe, and keep `384px` as an optional comparison/final-quality pass.

## Viewer Notes

- `/latent-map` successfully loaded the real J Shoot map data through `ANACRONIA_LATENT_MAP_VIEWER_DATA`.
- Point mode loaded all `3,184` points.
- Thumbnail mode loaded a capped `420 / 3,184` WebGL thumbnails from generated thumbnails, not original files.
- Browser checks showed no console errors or warnings after point and thumbnail mode inspection.
- Thumbnail cap initially sampled by ID order, which was misleading; it now spatially samples across the 2D layout while keeping selected and neighbor points pinned.
- Current thumbnail mode is useful for a fast visual read, but too crowded at default zoom. It needs zoom-aware thumbnail scale, progressive LOD, and probably collision/density controls before it feels like a real tool.
- Point mode is also dense; point size should become zoom-aware or smaller for 3k+ images.

## Usefulness Decision

DINOv3 neighborhoods look useful enough to justify V2.

The strongest signal is visual retrieval: product-like objects find product-like objects, jewelry finds jewelry, reflective interiors find reflective interiors, and image-style/composition similarities are visible. This is already enough to justify the next prototype chapter.

Do not treat this as semantic search yet. DINOv3 is giving a strong visual backbone; future SigLIP/OpenCLIP-style semantic embeddings should be added as a separate view or weighted-fusion experiment, not as a replacement.

## V2 Implications

- Add a run/recipe selector instead of restarting the server or copying `map-data.json`.
- Keep all run outputs outside the app repo as disposable analysis artifacts.
- Add zoom-aware point and thumbnail sizing.
- Add progressive thumbnail loading based on viewport, not only a global cap.
- Add neighbor inspection affordances that do not become a heavy detail panel.
- Keep 256px as default until there is a clear reason to pay the 384px cost.
