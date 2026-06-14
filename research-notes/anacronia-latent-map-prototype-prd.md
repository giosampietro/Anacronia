# Anacronia Latent Map Prototype PRD

Status: draft for review

Branch/worktree: `codex/dinov3-local-embedding-research`

## Problem Statement

Anacronia is collecting and importing large image sets, but the current product does not yet provide a way to navigate images by visual similarity.

The user needs a fast, local, disposable prototype that proves whether DINOv3 image embeddings can turn a plain folder of images into a useful spatial visual atlas. The prototype must help judge visually whether the neighborhoods, clusters, and map structure are meaningful before any production Anacronia integration is attempted.

The prototype must not mutate the main Anacronia app, database, collection model, provider records, or source images.

## Solution

Build a local-first prototype pipeline that accepts one external folder of images, generates thumbnails and DINOv3 embeddings, indexes visual similarity with FAISS, projects embeddings into 2D with UMAP, clusters them, and renders an interactive WebGL map.

The WebGL map must support both point mode and thumbnail mode. Thumbnail-on-canvas is a core MVP requirement because visual judgment of the embedding space is impossible if images are only visible through hover previews.

All generated data is an Analysis Result layer over source images. Originals remain read-only. Generated outputs are versioned and disposable.

## Initial Test Dataset

The first V1 test dataset is:

```text
/Users/giorgio/Documents/Codex/Exports/J Shoot/images
```

Current scan result:

- 3,184 supported images.
- All supported files are `jpg`.
- This is the first acceptance dataset before the larger 5,000-image target.

## GitHub Issue Map

Parent:

- [#179 PRD: Anacronia latent map prototype MVP V1-V3](https://github.com/giosampietro/Anacronia/issues/179)

MVP V1:

- [#180 MVP1: Scaffold isolated latent-map run contract](https://github.com/giosampietro/Anacronia/issues/180)
- [#181 MVP1: Scan source folder into manifest and thumbnails](https://github.com/giosampietro/Anacronia/issues/181)
- [#182 MVP1: Generate DINOv3 embeddings at 256px and 384px](https://github.com/giosampietro/Anacronia/issues/182)
- [#183 MVP1: Build FAISS similarity index and nearest-neighbor query](https://github.com/giosampietro/Anacronia/issues/183)
- [#184 MVP1: Generate UMAP layout and KMeans clusters](https://github.com/giosampietro/Anacronia/issues/184)
- [#185 MVP1: Export compact WebGL viewer data](https://github.com/giosampietro/Anacronia/issues/185)
- [#186 MVP1: Render WebGL point map with hover and neighbor highlight](https://github.com/giosampietro/Anacronia/issues/186)
- [#187 MVP1: Add performant WebGL thumbnail-map mode](https://github.com/giosampietro/Anacronia/issues/187)
- [#188 MVP1: Run J Shoot end-to-end and write findings](https://github.com/giosampietro/Anacronia/issues/188)

MVP V2:

- [#189 MVP2: Add DINOv2 and UMAP/clustering method comparison](https://github.com/giosampietro/Anacronia/issues/189)
- [#190 MVP2: Add duplicate diagnostics and result exports](https://github.com/giosampietro/Anacronia/issues/190)
- [#191 MVP2: Add viewer filters and run/layout URL state](https://github.com/giosampietro/Anacronia/issues/191)

MVP V3:

- [#192 MVP3: Add SigLIP2 as a separate embedding space](https://github.com/giosampietro/Anacronia/issues/192)
- [#193 MVP3: Explore weighted visual/semantic fusion and disagreement](https://github.com/giosampietro/Anacronia/issues/193)
- [#194 MVP3: Decide production integration, scale, and cloud strategy](https://github.com/giosampietro/Anacronia/issues/194)

## Product Versions

### MVP V1: Proof Of Visual Usefulness

Goal: prove whether DINOv3 visual embeddings make an Anacronia-like image folder navigable.

Required:

- One external input folder.
- Supported formats: `jpg`, `jpeg`, `png`, `webp`.
- Target scale: about 5,000 images, with awareness that 10,000 may happen.
- Read-only source images.
- Generated run folder with manifest, thumbnails, embeddings, FAISS index, UMAP layout, cluster output, and report.
- DINOv3 ViT-S local embedding on Apple Silicon MPS.
- Compare `256px` and `384px` preprocessing recipes.
- Preserve aspect ratio; do not square-crop.
- Pad only when needed so image sides are multiples of 16.
- Use DINO/ImageNet processor mean padding color, currently `RGB(124, 116, 104)`, when padding is needed.
- Save normalized global vectors.
- FAISS `IndexFlatIP` over normalized vectors for cosine-style nearest-neighbor search.
- Explicit `faiss_id -> image_id` mapping.
- UMAP 2D layout saved with model/run/config identity.
- KMeans clustering first.
- Browser viewer with WebGL/Three.js 2D map.
- shadcn/lucide UI for shell controls.
- Viewer modes:
  - points
  - thumbnails on WebGL canvas
- Hover thumbnail preview in point mode.
- Click image to highlight FAISS nearest neighbors.
- Cluster color overlay in point mode.
- Zoom/pan/reset.
- No detail panel.
- Human-readable run report.

Success:

- User can visually inspect the map and decide whether the neighborhoods make sense.
- User can compare `256px` vs `384px`.
- User can click an image and see its high-dimensional nearest neighbors highlighted.
- Runtime and disk cost are measured.
- Failures are reported without corrupting the run.

### MVP V2: Method Comparison And Diagnostics

Goal: compare embedding/layout/cluster methods and understand failure modes.

Add:

- DINOv2 fallback run, for access/license/performance comparison.
- Multiple UMAP configs, especially `n_neighbors` and `min_dist`.
- HDBSCAN if dependency/performance cost is acceptable.
- Duplicate diagnostics:
  - SHA256 exact duplicates
  - perceptual hash candidates
  - DINO nearest-neighbor duplicate candidates
- Export selected images, clusters, neighbors, and layouts.
- Viewer URL/state for selected run, layout, cluster, selected image, and display mode.
- Basic filter controls:
  - source subfolder/category
  - cluster
  - run/layout
- More complete performance report:
  - images/sec
  - memory notes
  - embedding time
  - UMAP time
  - FAISS build/query time
  - WebGL behavior

Success:

- User can compare runs without reprocessing everything manually.
- User can see whether failures come from embeddings, UMAP projection, clustering, or UI rendering.
- The prototype produces enough evidence to decide what production architecture should keep.

### MVP V3: Multi-Embedding Research Prototype

Goal: explore richer visual plus semantic navigation before production integration.

Add:

- SigLIP2 embeddings as a second embedding space.
- Separate storage for each embedding model/run.
- Weighted similarity fusion:
  - visual/DINO weight
  - semantic/SigLIP2 weight
- Optional fused vector strategy:
  - concatenate separately normalized vectors scaled by square-root weights.
- Viewer slider:
  - pure visual
  - mixed
  - pure semantic
- Disagreement analysis:
  - close in DINO, far in SigLIP2
  - far in DINO, close in SigLIP2
  - close in both
  - far in both
- Production Anacronia integration design:
  - Analysis Results attached to Image Assets
  - no overwrite of provider metadata
  - no blur between provider metadata and generated analysis
- Scale strategy for 30k/200k images:
  - approximate FAISS
  - cloud option
  - hosted viewer option

Success:

- User can decide whether mixed visual/semantic maps are useful.
- User can identify which parts belong in Anacronia proper and which should remain research tooling.

## User Stories

1. As the user, I want to choose one local folder of images, so that I can test visual exploration without importing into Anacronia.
2. As the user, I want originals to remain untouched, so that the prototype cannot damage source material.
3. As the user, I want a generated run folder, so that every output is isolated and disposable.
4. As the user, I want thumbnails generated locally, so that the viewer can render many images without loading originals.
5. As the user, I want DINOv3 embeddings generated locally on my M1 Pro, so that I can avoid cloud processing for early experiments.
6. As the user, I want to compare `256px` and `384px`, so that I can judge the speed/quality tradeoff.
7. As the user, I want aspect ratio preserved, so that visual similarity is not distorted by square cropping.
8. As the user, I want FAISS nearest-neighbor search, so that similarity is measured in embedding space, not guessed from screen distance.
9. As the user, I want UMAP 2D coordinates, so that high-dimensional embeddings become navigable.
10. As the user, I want cluster colors, so that visual groupings are easier to inspect.
11. As the user, I want a point map, so that huge sets stay responsive.
12. As the user, I want thumbnail mode directly on the WebGL map, so that I can judge whether the spatial organization is visually meaningful.
13. As the user, I want hover thumbnails in point mode, so that I can inspect local areas without switching modes.
14. As the user, I want to click an image and see its nearest neighbors, so that I can validate whether DINO similarity makes sense.
15. As the user, I want no detail panel in V1, so that the prototype stays focused on spatial navigation.
16. As the user, I want a run report, so that I can compare speed, disk cost, failures, and visual usefulness.
17. As a future Anacronia builder, I want generated analysis kept separate from provider metadata, so that provenance remains clean.
18. As a future Anacronia builder, I want versioned embedding and layout runs, so that different models and parameters can be compared.
19. As a future Anacronia builder, I want DINO and SigLIP2 stored as separate spaces, so that visual and semantic similarity are not confused.
20. As a future Anacronia builder, I want issue-sized vertical slices, so that each part can be built and tested with TDD.

## Implementation Decisions

- Build in the isolated DINO worktree only.
- Treat outputs as Analysis Results, not Anacronia collection data.
- Do not integrate with the production Anacronia database in V1.
- Do not require source images to be inside the Anacronia collection.
- Do not copy originals by default.
- Generate thumbnails into the run folder.
- Store source path and derived identity in the manifest.
- Use stable image identity based on source provenance plus hash data, not volatile row order.
- Preserve subfolder/category metadata from the input folder tree.
- Store large vectors outside SQLite if SQLite is used.
- Use SQLite or JSONL for metadata, run records, paths, IDs, offsets, and config.
- Keep the first persistence layer simple enough to delete and recreate.
- Use normalized vectors.
- Use FAISS `IndexFlatIP` first.
- Do not use approximate FAISS indexes in V1.
- Store explicit FAISS ID mapping.
- UMAP is projection/layout only.
- FAISS is the source of truth for nearest-neighbor search.
- Cluster in embedding space where practical, not only in 2D UMAP space.
- KMeans is V1 clustering.
- HDBSCAN is V2 unless trivial.
- Three.js is used as a 2D WebGL renderer, not as a 3D visual metaphor.
- shadcn is used for controls, toolbar, toggles, tabs, sliders, and panels.
- Do not use shadcn for the map rendering itself.
- The first viewer is map-first, not a landing page.
- Thumbnail-on-canvas is required in V1.
- Thumbnail mode must use lazy texture loading, visible thumbnail caps, zoom thresholds, or fallback-to-points behavior to stay responsive.
- The viewer should never eagerly load every original image.
- DINOv3 ViT-S is first choice because it has been verified locally.
- DINOv2 remains the fallback if DINOv3 access, license, or performance blocks progress.
- SigLIP2 is not V1.
- GPT/GPT-4-class vision is not for the embedding map; it is future metadata/caption/explanation work.
- PixPlot and ImagePlot are references, not technical bases.
- ImagePlot-style low-level metrics are future optional features.
- V1 is disposable, but generated learning must be preserved in reports and PRD notes.

## Proposed Run Folder Shape

```text
runs/<timestamp>-<slug>/
  manifest.jsonl
  config.json
  report.md
  thumbnails/
  embeddings/
    dinov3_vits_256.npy
    dinov3_vits_384.npy
  indexes/
    faiss_flat_ip.index
    faiss_id_map.json
  layouts/
    umap_2d_<layout_id>.json
  clusters/
    kmeans_<cluster_id>.json
  viewer/
    map-data.json
```

This shape is a prototype contract, not a production schema.

## Proposed Issue Sequence

1. Create isolated prototype scaffold and run-folder contract.
2. Build folder scanner, manifest writer, and thumbnail generator.
3. Build DINOv3 embedding command for `256px` and `384px`.
4. Build FAISS index creation and nearest-neighbor query.
5. Build UMAP projection and KMeans clustering.
6. Build viewer data exporter.
7. Build WebGL point-map viewer.
8. Add WebGL thumbnail-map mode.
9. Add hover preview and selected-neighbor highlight.
10. Add run report and benchmark output.
11. Run a 5k-image prototype test.
12. Write findings and V2/V3 recommendation.

## TDD Plan

Use vertical slices. Do not write all tests first.

Each issue should start with one behavior test through a public interface, then minimal implementation, then refactor.

Priority test behaviors:

- Scanner accepts supported formats and ignores unsupported files.
- Scanner preserves source paths and subfolder/category metadata.
- Thumbnail generation does not mutate originals.
- Manifest has stable image IDs for the same input.
- Padding preserves aspect ratio and produces dimensions divisible by 16.
- Embedding command writes normalized vectors and run metadata.
- FAISS query returns nearest neighbors using explicit ID mapping.
- UMAP output contains coordinates for every embedded image.
- Cluster output references known image IDs only.
- Viewer exporter emits enough data for point mode and thumbnail mode.
- Viewer selection highlights FAISS neighbors, not UMAP nearest screen points.
- Run report records timings, counts, failures, and config.

Test style:

- Test behavior through CLI commands or public module interfaces.
- Avoid testing private helpers directly.
- Avoid mocking internal collaborators unless external services are involved.
- Use small fixture image folders for tests.
- Keep full DINO model tests as smoke/integration checks, not routine unit tests.
- Use fake embeddings for FAISS, UMAP, clustering, and viewer exporter tests where model inference is not the behavior under test.

## Out Of Scope For V1

- Production Anacronia database integration.
- Provider metadata integration.
- Importing images into Anacronia Collections.
- Detail panel.
- 3D visualization.
- Cloud processing.
- Hosted deployment.
- Approximate FAISS indexes.
- SigLIP2.
- GPT/Gemini captioning or semantic labeling.
- Training or fine-tuning.
- Editing or deleting source images.
- Full 30k/200k scale support.

## Risks

- DINOv3 license/access may limit production use.
- DINOv3 performance may vary with image size and batch size.
- UMAP may create visually persuasive but misleading neighborhoods.
- Thumbnail WebGL mode may become the performance bottleneck.
- Clusters may be read as semantic categories even when they are only visual groupings.
- Prototype code may become sticky; keep it isolated and disposable.

## Review Questions

1. Is V1 correctly scoped around proof of visual usefulness?
2. Should V1 use JSONL only, or minimal SQLite plus vector files?
3. Should V1 save both DINO pooler and CLS vectors, or only one normalized global vector?
4. Is KMeans enough for V1 clustering?
5. Should 5k images be the first acceptance scale, with 10k as stretch?
6. Should the viewer be a standalone prototype app or a route inside the isolated Anacronia web app?
7. Should issue 8, WebGL thumbnail mode, come before FAISS neighbor highlighting?
8. Which behaviors should be tested first with TDD?
