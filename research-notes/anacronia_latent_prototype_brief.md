# Anacronia Image Latent-Space Prototype — Coding Agent Brief

## 0. Goal

Build a local-first prototype for navigating a growing image archive through visual latent-space search and visualization.

Current scale: approximately 30,000 images.
Target scale: approximately 200,000 images.

Core V1 stack:

```text
DINOv3 → visual image embeddings
FAISS → nearest-neighbor search
UMAP → 2D latent-space map
SQLite or DuckDB → metadata database
Local web UI → browsing, filtering, search, selection
```

The system must preserve the existing folder/category structure. It should not reorganize or replace original folders. It should add a learned visual search/map layer on top.

## 1. Core decisions

### 1.1 Chosen direction

Use a custom embedding-space system.

Do not use vanilla PixPlot as the main system.
Do not use ImagePlot 2.2 as the main system.

Chosen V1 stack:

```text
DINOv3
FAISS
UMAP
SQLite or DuckDB
local web viewer
```

### 1.2 Keep model roles separate

Do not compare unrelated models as if they solve the same task. Use this role map:

```text
DINOv3-like model       → image-only visual feature layer
SigLIP2-like model      → optional image/text retrieval layer
GPT-4o-mini-like model  → optional semantic labels, captions, JSON metadata
Gemini Embedding 2      → optional cloud multimodal embedding benchmark
ImagePlot-style metrics → optional interpretable low-level pixel features
```

V1 should focus only on:

```text
DINOv3 + FAISS + UMAP
```

Optional layers should be added only after the core prototype works.

## 2. First prototype behavior

The first usable experience should be:

```text
open local viewer
see image archive as a 2D UMAP map
filter by existing folders/categories
click one image
see nearest visual neighbors
open/copy original file path
export selected image paths
```

Required V1 actions:

```text
scan archive
generate thumbnails
compute DINOv3 embeddings
build FAISS index
compute UMAP layout
serve local UI
click image → nearest neighbors
filter by metadata
export selections
```

## 3. Local-first, cloud-optional

Likely local machine: MacBook Pro M1 Pro.

Local should be targeted for:

```text
30k-image prototype
daily use
incremental image additions
FAISS search
metadata filtering
UI browsing
```

Cloud may be used for:

```text
first full embedding pass
200k-image full reprocessing
large UMAP recomputation
model comparison
large optional captioning/tagging jobs
```

Do not require cloud infrastructure in V1.

Design the same processing scripts so they can run locally or on a cloud GPU.

## 4. High-level pipeline

```text
image folders
  ↓
scanner / importer
  ↓
metadata database
  ↓
thumbnail generator
  ↓
DINOv3 embedding extractor
  ↓
embedding store
  ↓
FAISS index
  ↓
UMAP layout
  ↓
local web UI
```

## 5. CLI shape

Implement as separate commands, not one monolithic process.

Suggested CLI:

```bash
anacronia scan /path/to/archive
anacronia thumbs
anacronia embed --model dinov3
anacronia index --model dinov3
anacronia layout --method umap --model dinov3
anacronia serve
```

Optional later commands:

```bash
anacronia features imageplot-style
anacronia embed --model siglip2
anacronia label gpt
anacronia export selection
```

## 6. Data model

### 6.1 images table

```sql
CREATE TABLE images (
  image_id INTEGER PRIMARY KEY,
  absolute_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  folder_path TEXT,
  folder_category TEXT,
  extension TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mtime INTEGER,
  sha256 TEXT,
  perceptual_hash TEXT,
  thumbnail_path TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

Notes:

```text
absolute_path = original local file path
relative_path = path relative to archive root
folder_category = derived from folder hierarchy
sha256 = exact duplicate detection
perceptual_hash = optional near-duplicate detection
```

Do not move, rename, or modify original files.

### 6.2 embeddings table

```sql
CREATE TABLE embeddings (
  embedding_id INTEGER PRIMARY KEY,
  image_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT,
  checkpoint TEXT,
  dim INTEGER,
  dtype TEXT,
  normalized BOOLEAN,
  vector_store_path TEXT,
  vector_offset INTEGER,
  created_at TEXT
);
```

Do not store large vectors directly in SQLite if avoidable.

Store vectors externally:

```text
embeddings/dinov3.float16.npy
embeddings/dinov3.float32.npy
embeddings/dinov3.memmap
```

SQLite or DuckDB should store metadata and offsets.

### 6.3 layouts table

```sql
CREATE TABLE layouts (
  layout_id TEXT,
  image_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  method TEXT NOT NULL,
  x REAL,
  y REAL,
  params_json TEXT,
  created_at TEXT
);
```

Example layout ID:

```text
dinov3_umap_n15_mindist01_v001
```

### 6.4 FAISS ID mapping

FAISS uses numeric IDs. Keep an explicit mapping:

```text
faiss_id → image_id
```

Suggested files:

```text
indexes/dinov3.faiss
indexes/dinov3_ids.npy
```

## 7. DINOv3 embedding layer

### 7.1 Role

DINOv3 is the V1 visual-feature model.

Use it for:

```text
image-to-image similarity
nearest-neighbor search
visual latent-space map
visual clustering
duplicate / near-duplicate discovery
```

Do not use it for:

```text
text search
captioning
semantic JSON metadata
taxonomy generation
```

Those are optional later layers.

### 7.2 Candidate checkpoints

Start with a lightweight checkpoint for local testing.

Suggested first checkpoint:

```text
facebook/dinov3-convnext-tiny-pretrain-lvd1689m
```

Benchmark later:

```text
facebook/dinov3-vits16-pretrain-lvd1689m
facebook/dinov3-vitb16-pretrain-lvd1689m
facebook/dinov3-convnext-small-pretrain-lvd1689m
```

Approximate testing order:

```text
1. ConvNeXt Tiny → smoke test / local feasibility
2. ViT-S → better baseline
3. ViT-B → quality benchmark
4. larger models → only if cloud GPU is used
```

### 7.3 Licensing / access caveat

DINOv3 does not use a simple Apache-style license. The coding agent must verify:

```text
DINOv3 model access
DINOv3 license terms
allowed intended use
redistribution constraints
commercial constraints
```

Fallback if DINOv3 licensing or access blocks progress:

```text
DINOv2
```

DINOv2 has a simpler official availability story and should remain the fallback model.

### 7.4 Embedding extraction

Use global/pooled image embeddings for V1.

Normalize vectors before indexing:

```python
embedding = embedding / np.linalg.norm(embedding)
```

Then FAISS inner product can be used as cosine similarity.

Store with every embedding run:

```text
model name
checkpoint
embedding dimension
dtype
normalization flag
date generated
```

Every embedding run must be versioned.

## 8. FAISS search layer

### 8.1 Role

FAISS is the local vector search engine.

Use it for:

```text
click image → nearest neighbors
query image → nearest neighbors
duplicate / near-duplicate inspection
latent-space browsing support
```

FAISS does not generate embeddings and does not visualize maps. It only searches vectors.

### 8.2 V1 index

For 30k images, start with:

```text
IndexFlatIP
```

Reason:

```text
exact search
simple
debuggable
good enough at 30k scale
```

After L2-normalization:

```text
inner product ≈ cosine similarity
```

### 8.3 200k scale path

Do not prematurely optimize. Benchmark first.

Possible later indexes:

```text
IndexHNSWFlat
IndexIVFFlat
IndexIVFPQ
```

Suggested progression:

```text
30k → IndexFlatIP
200k exact search benchmark
if too slow → HNSW or IVF
if memory issue → PQ
```

## 9. UMAP layout layer

### 9.1 Role

UMAP creates 2D coordinates from high-dimensional DINOv3 embeddings.

It produces:

```text
image_id, x, y
```

Store results in the layouts table.

UMAP is for map visualization, not search. FAISS remains the true nearest-neighbor search layer.

### 9.2 Initial UMAP defaults

Start with:

```python
UMAP(
    n_neighbors=15,
    min_dist=0.1,
    metric="cosine",
    n_components=2,
    random_state=42
)
```

Test variants:

```text
n_neighbors: 10, 15, 30, 50
min_dist: 0.01, 0.05, 0.1, 0.3
```

### 9.3 Incremental additions

For new images:

```text
scan new files
→ generate thumbnails
→ compute DINOv3 embedding
→ add to FAISS
→ use UMAP.transform into existing map
```

But periodically:

```text
full UMAP recompute
```

Reason:

```text
UMAP.transform is useful for placing new points
but full recomputation may be needed to keep global map coherent
```

## 10. UI requirements

Build a local web viewer. Do not build a polished production app first.

### 10.1 Required views

#### A. Map view

```text
2D UMAP map
points or thumbnails
zoom / pan
hover preview
click to select
```

For 30k:

```text
Canvas 2D or PixiJS may be enough
```

For 200k:

```text
WebGL / deck.gl / regl / PixiJS
level-of-detail thumbnail rendering
```

#### B. Neighbor panel

On selected image show:

```text
large preview
file path
folder/category metadata
top 50 nearest images from FAISS
open original file
copy path
```

#### C. Grid view

Show:

```text
folder/category filter
nearest-neighbor results
selected collection
search result grid
```

#### D. Filters

V1 filters should use existing archive metadata:

```text
folder
top-level category
file type
date/mtime
dimensions
orientation
duplicate status
```

Later filters may include:

```text
brightness
saturation
edge density
aspect ratio
GPT labels
SigLIP2 labels
manual tags
```

#### E. Selection / export

Allow:

```text
select images
save temporary collection
export image paths as CSV/TSV
copy paths
```

## 11. UI ideas borrowed from ImagePlot 2.2

The uploaded ImagePlot 2.2 HTML source is useful as a reference for interface patterns, not as a codebase for Anacronia.

ImagePlot 2.2 implements:

```text
single-browser HTML app
local image folder loading
local TSV/CSV-style metadata loading
browser-side pixel feature extraction
PCA
t-SNE
direct X/Y feature plotting
image or circle display
hover preview
color-by-column
labels
animation
compare mode
PNG export
TSV export
```

It does not implement:

```text
DINO
FAISS
UMAP
semantic search
embedding search
database persistence
large-scale archive indexing
```

Borrow these ideas:

```text
image vs circle display toggle
hover preview
color by metadata column
compare mode
export PNG / TSV
manual X/Y axes for interpretable feature columns later
animation by date/order later
```

Do not borrow:

```text
single HTML architecture
browser-only feature extraction for large archives
in-browser t-SNE for large datasets
loading all images into browser memory
```

## 12. ImagePlot 2.2 technical notes

The uploaded ImagePlot 2.2 source shows that pixel analysis happens entirely in the browser.

Flow:

```text
local image folder
→ FileReader
→ Image object
→ hidden canvas
→ getImageData()
→ JavaScript pixel loop
→ feature columns
→ plot / export TSV
```

ImagePlot computes either:

```text
Basic: 6 features
All: 77 features
```

Basic features:

```text
brightness_median
brightness_stdev
saturation_median
saturation_stdev
hue_median
hue_stdev
```

Full feature set includes:

```text
basic brightness/saturation/hue stats
3×3 spatial grid brightness/saturation/hue
brightness entropy
hue entropy
edge density
horizontal / vertical / diagonal line percentages
dominant angle
16-bin grayscale histogram
16-bin saturation histogram
local contrast
aspect ratio
RGB channel means
```

It also has feature-selection presets:

```text
Grayscale
Color
Structure
```

Dimensionality-reduction modes in the inspected source:

```text
PCA
t-SNE
```

UMAP was not found in the uploaded HTML source.

Clustering is simple:

```text
k-means over 2D projected coordinates
auto k = 2–5
silhouette score selection
ellipse overlays
```

Use ImagePlot-style metrics later as an optional interpretable feature layer:

```text
brightness
saturation
hue
entropy
edge density
orientation
local contrast
aspect ratio
RGB means
histograms
```

These can become metadata columns in Anacronia.

## 13. Optional future layers

### 13.1 SigLIP2 layer

Add only if text-to-image search becomes necessary.

Role:

```text
image → vector
text → vector
```

Use for:

```text
text search
image/text retrieval
zero-shot label scoring
semantic ranking
```

Important:

```text
SigLIP2 does not need existing captions for every image.
It can embed images alone.
Text is only needed for text queries or candidate labels.
```

Correct patterns:

```text
image → SigLIP2 image vector
text → SigLIP2 text vector
compare vectors
```

or:

```text
image → DINOv3 vector
image → SigLIP2 vector
store both separately
```

Do not chain as:

```text
image → OpenCLIP vector → SigLIP2
```

### 13.2 GPT-4o-mini / GPT-4-class vision layer

Add only for semantic metadata generation.

Role:

```text
image + prompt → caption / tags / JSON metadata
```

Useful for:

```text
semantic labels
captions
taxonomy assignment
material/object guesses
photo type
structured metadata
ambiguous image review
query expansion
```

Not useful as the main vector search system.

Best combination with SigLIP2:

```text
SigLIP2 = finds / ranks
GPT = labels / structures / explains
database = combines both
```

Good workflow:

```text
image
 ├─ DINOv3 → visual embedding
 ├─ optional SigLIP2 → image/text embedding
 └─ optional GPT → JSON metadata
```

Store all outputs separately.

Do not reduce the whole system to GPT captions. Captions are lossy.

### 13.3 Gemini Embedding 2

Optional cloud benchmark.

Role:

```text
image/text/audio/video/PDF → multimodal embedding
```

It can generate 3072-dimensional vectors in a unified multimodal space.

Approximate embedding-only pricing discussed:

```text
$0.00012 per image
30k images  → about $3.60
200k images → about $24.00
```

Not included:

```text
Cloud Storage
Vector Search
database costs
egress
hosting
reprocessing
```

Use only as a benchmark or optional semantic/multimodal layer.

Do not assume it replaces the DINOv3 visual-feature layer for texture/nonverbal image similarity without testing.

### 13.4 Google Vector Search

Optional later backend.

Role:

```text
managed vector database/search
metadata filtering
multiple vector fields
hybrid search
cloud scaling
```

It does not make DINOv3 or SigLIP2 embeddings smarter.

It can help combine:

```text
DINO-like vector
SigLIP2-like vector
Gemini vector
metadata fields
filters
hybrid ranking
```

But local FAISS + SQLite/DuckDB is enough for V1.

## 14. Discarded or postponed options

### 14.1 PixPlot

Discarded for main system.

Reason:

```text
good static visual archive tool
older stack
less suited to growing 30k→200k archive
weak incremental ingestion/search story
```

### 14.2 ImagePlot 2.2 as main system

Discarded as main system.

Reason:

```text
browser-only
pixel-feature based
PCA/t-SNE only in uploaded source
not an embedding/vector-search architecture
not designed for persistent 30k–200k image indexing
```

Still useful for UI patterns and optional interpretable features.

### 14.3 Google Vector Search as V1 backend

Postponed.

Reason:

```text
local FAISS is enough for prototype
Google adds managed infrastructure, not better local visual embeddings
cloud dependency should come after workflow validation
```

### 14.4 Gemini Embedding 2 as primary model

Postponed.

Reason:

```text
cloud/API only
semantic/multimodal orientation
not documented as a DINO-style dense visual-feature replacement
should be benchmarked later, not assumed
```

### 14.5 GPT-4o-mini as main classifier/search engine

Postponed.

Reason:

```text
good for semantic annotation
not a vector search engine
captions/tags are lossy
schema changes can require reprocessing
```

### 14.6 PCA / t-SNE as primary map

Not chosen for V1 map.

Reason:

```text
PCA is simple and interpretable but too limited
t-SNE is useful for local clusters but weak for global layout and scale
UMAP is better suited as first map baseline
```

### 14.7 PaCMAP / TriMap / densMAP

Postponed.

Reason:

```text
valid alternatives
not needed before a UMAP baseline exists
```

Can test later:

```text
PaCMAP → local/global balance
TriMap → global structure
densMAP → density-preserving layouts
```

## 15. Unresolved questions

### 15.1 DINOv3 license / access

Need answer:

```text
Can Anacronia accept DINOv3 license terms?
Can the weights be accessed cleanly?
Is use case allowed?
Should DINOv2 be the fallback?
```

### 15.2 Model size

Benchmark:

```text
DINOv3 ConvNeXt Tiny
DINOv3 ViT-S
DINOv3 ViT-B
```

Measure:

```text
embedding quality
processing speed on M1 Pro
RAM usage
batch stability
nearest-neighbor quality
UMAP map quality
```

### 15.3 Local vs cloud processing

Need empirical test:

```text
How long does 5k images take on M1 Pro?
How long would 30k take?
Is 200k local processing realistic?
```

### 15.4 UMAP refresh policy

Decide after testing:

```text
always transform new images into existing map
full recompute after N new images
manual recompute only
scheduled recompute
```

### 15.5 FAISS index type

Start:

```text
IndexFlatIP
```

Benchmark later:

```text
IndexHNSWFlat
IndexIVFFlat
IndexIVFPQ
```

### 15.6 UI renderer

Need choice:

```text
Canvas 2D
PixiJS
deck.gl
regl
Three.js
```

Suggested:

```text
Canvas/PixiJS for V0/V1
WebGL/LOD for 200k-scale UI
```

Avoid Three.js unless 3D is explicitly needed.

### 15.7 Thumbnail strategy

Need decide:

```text
WebP or JPEG
256px or 512px
directory sharding by image_id/hash
preserve aspect ratio
lazy load in UI
```

### 15.8 Duplicate handling

Need decide:

```text
SHA256 exact duplicates
perceptual hash near-duplicates
DINOv3 nearest-neighbor duplicate detection
```

## 16. Prototype milestones

### V0 — 2k–5k subset

Build minimal complete system:

```text
scan
thumbnail
DINOv3 embeddings
FAISS index
UMAP coords
local viewer
click → nearest neighbors
```

Success criteria:

```text
can browse map
can click image and see nearest neighbors
can filter by existing folder/category
can open/copy original file path
```

### V1 — full 30k archive

Add:

```text
incremental scan
persistent DB
dedupe
thumbnail cache
saved FAISS index
saved UMAP layout
export selected image paths
```

### V2 — 200k readiness

Add:

```text
FAISS index benchmarks
UMAP sampling/recompute strategy
WebGL or LOD rendering
batch processing portability
cloud embedding script
```

### V3 — optional semantic layer

Only after V1 works:

```text
SigLIP2 for text search
GPT-4o-mini for semantic JSON labels
ImagePlot-style pixel features
Gemini Embedding 2 benchmark
Google Vector Search benchmark
```

## 17. Coding constraints

The coding agent should follow these constraints:

```text
do not move original files
do not rename original files
do not require cloud for V1
do not hardcode one model checkpoint
version every embedding run
version every UMAP layout
keep metadata and embeddings portable
keep FAISS ID mapping explicit
avoid loading full-resolution images into frontend
avoid adding semantic/caption systems before DINOv3 prototype works
```

## 18. Suggested repository structure

```text
anacronia-latent/
  anacronia/
    __init__.py
    cli.py
    scan.py
    thumbnails.py
    embed_dinov3.py
    faiss_index.py
    umap_layout.py
    db.py
    server.py
    config.py
  web/
    src/
      App.tsx
      MapView.tsx
      NeighborPanel.tsx
      GridView.tsx
      api.ts
  data/
    anacronia.sqlite
    thumbs/
    embeddings/
    indexes/
    layouts/
  configs/
    dinov3.yaml
    umap.yaml
  scripts/
    benchmark_embed.py
    benchmark_faiss.py
    benchmark_umap.py
  README.md
```

## 19. Suggested backend stack

```text
Python
PyTorch
Transformers
Pillow
numpy
pandas or polars
SQLite or DuckDB
FAISS
umap-learn
FastAPI
imagehash optional
```

## 20. Suggested frontend stack

```text
React
TypeScript
Canvas 2D or PixiJS
REST API
lazy thumbnail loading
local file/path display
```

For larger scale:

```text
WebGL renderer
LOD point/thumbnails
tile-like map loading
```

## 21. API endpoints

Required:

```http
GET /images?filters=...
GET /image/{image_id}
GET /neighbors/{image_id}?k=50
GET /layout/{layout_id}
GET /thumbnail/{image_id}
POST /selection/export
```

Optional later:

```http
POST /query/image
POST /query/text
GET /features/{image_id}
GET /labels/{image_id}
```

## 22. Minimal internal data flow

### Scan

```text
read archive root
walk image files
extract path metadata
read dimensions
compute sha256 optionally
insert/update images table
```

### Thumbnails

```text
read original image
resize to max 256 or 512 px
save thumbnail
store thumbnail_path
```

### Embed

```text
load DINOv3 checkpoint
batch images
preprocess
extract pooled/global embedding
normalize
write embedding array
write embedding metadata
```

### Index

```text
load normalized embeddings
build FAISS IndexFlatIP
write FAISS index
write faiss_id → image_id mapping
```

### Layout

```text
load embeddings
run UMAP(metric="cosine")
write x/y to layouts table
store params_json
```

### Serve

```text
FastAPI serves metadata, neighbors, layout, thumbnails
React UI renders map/grid/panel
```

## 23. Design principle

Keep every layer separate and replaceable:

```text
original images
metadata
thumbnails
embeddings
FAISS index
UMAP layout
UI
```

Do not entangle them.

This allows later additions:

```text
DINOv2 fallback
SigLIP2 text search
GPT labels
Gemini embeddings
Google Vector Search
ImagePlot-style features
```

without rewriting the whole system.

## 24. Sources / references to verify

### DINOv3

- https://github.com/facebookresearch/dinov3
- https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md

### DINOv2 fallback

- https://github.com/facebookresearch/dinov2

### FAISS

- https://faiss.ai/
- https://github.com/facebookresearch/faiss

### UMAP

- https://umap-learn.readthedocs.io/
- https://umap-learn.readthedocs.io/en/latest/transform.html

### Apple Silicon / PyTorch MPS

- https://developer.apple.com/metal/pytorch/
- https://pytorch.org/docs/stable/notes/mps.html

### Hugging Face Transformers

- https://huggingface.co/docs/transformers/

### SigLIP2

- https://github.com/google-research/big_vision/blob/main/big_vision/configs/proj/image_text/README_siglip2.md
- https://huggingface.co/docs/transformers/en/model_doc/siglip2

### GPT-4o-mini

- https://platform.openai.com/docs/models/gpt-4o-mini

### Gemini Embedding 2

- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2
- https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing

### ImagePlot 2.2

- Source inspected from uploaded file: ImagePlot_2.2.html

The uploaded source confirms:

```text
browser-side pixel extraction
Basic 6 features
All 77 features
PCA
t-SNE
image/circle display
color by column
hover preview
compare mode
animation
PNG/TSV export
```

No UMAP implementation was found in that uploaded HTML source.

## 25. Final instruction to coding agent

Build the first prototype as:

```text
DINOv3 visual embeddings
+ FAISS nearest-neighbor retrieval
+ UMAP 2D map
+ metadata-preserving local archive DB
+ lightweight local web UI
```

Do not build a general AI classifier yet.

Do not add cloud infrastructure yet.

Do not use ImagePlot as the technical base.

Use ImagePlot only as a reference for:

```text
hover preview
image/circle display
color-by-column
compare mode
export behavior
optional interpretable pixel features later
```

The first target experience is:

```text
browse latent map
filter by existing folders
click image
see visual neighbors
open/copy originals
export selected paths
```
