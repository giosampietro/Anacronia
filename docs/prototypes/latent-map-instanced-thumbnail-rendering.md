# Latent Map Thumbnail Rendering Comparison

Date: June 9, 2026

Branch: `codex/latent-map-instanced-thumbnails`

## Purpose

This branch re-checks the latent-map thumbnail renderer against the pushed
viewer branch using the same real J Shoot run and the same URL state. The
question was originally framed as Sprites versus instanced thumbnails, but the
important correction is that the pushed viewer is already using generated atlas
pages and instanced atlas rendering when atlas metadata exists.

The point layer remains unchanged: all map points are still rendered as a
`THREE.Points` layer. FAISS remains the nearest-neighbor source of truth, and
UMAP remains only the 2D navigation layout.

## Tested Setup

- Baseline branch: `origin/codex/dinov3-local-embedding-research` at
  `caf7fda59e06d70a3271bff4664e91f6eaa2824e`.
- Experiment branch: `codex/latent-map-instanced-thumbnails`.
- Run data:
  `/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609/viewer/map-data.json`.
- Route state:
  `/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_256&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=64&x=-0.5443&y=-0.097&z=1.12`.
- Browser: Chrome DevTools automation.
- Measurement: page attributes, `performance` resource entries, `renderer.info`,
  console state, screenshots, and a scripted 90-frame pan interaction.

## Current Implementation Truth

The pushed viewer does not currently render thumbnails as thousands of
`THREE.Sprite` objects. The UI calls
`createLatentMapThumbnailRenderPlan({ strategy: "all-atlas", thumbnailAtlas })`.
When `thumbnail_atlas` exists, the resulting strategy is `generated-atlas`.

For the tested J Shoot run, the viewer uses:

- `3,184` map points.
- `3,184` generated thumbnail instances in non-focused thumbnail mode.
- `4` generated 64px atlas pages.
- `4` WebGL draw calls.
- `4` live WebGL textures.
- `6,368` rendered triangles.

The old `capped-sprites` strategy name still exists in model code and tests, but
it is not the path used by the current thumbnail UI when generated atlas
metadata is present.

Focus behavior is separate from capping: when a selected/FAISS-neighbor focus set
exists, `all-atlas` narrows the thumbnail plan to the selected image plus FAISS
neighbors while the point layer remains global. That is not a numeric cap, but
it does mean "all image thumbnails" is currently true only outside a focus set.

## A/B Results

| Metric | Pushed baseline | Experiment branch | Interpretation |
| --- | ---: | ---: | --- |
| Points | `3,184` | `3,184` | Same data. |
| Rendered thumbnails | `3,184` | `3,184` | Same non-focused thumbnail plan. |
| Thumbnail strategy | `generated-atlas` | `generated-atlas` | Same actual renderer class. |
| Atlas pages requested | `4` | `4` | Same bounded image request count. |
| Atlas decoded bytes | `17,150,258` | `17,150,258` | Same decoded image payload. |
| Runtime draw calls | `4` | `4` | No draw-call improvement possible here. |
| Runtime live textures | `4` | `4` | Already bounded in baseline. |
| Runtime triangles | `6,368` | `6,368` | Same instanced quads. |
| Scripted pan avg frame | `8.33ms` | `8.32ms` | Equivalent in this check. |
| Scripted pan p95 frame | `8.5ms` | `8.5ms` | Equivalent. |
| Scripted pan max frame | `8.7ms` | `9.2ms` | Equivalent within noise. |
| Console messages | none | none | Both clean. |

The experiment branch adds instrumentation and comparison metadata:

- `data-thumbnail-instanced-draw-calls="4"`.
- `data-thumbnail-instanced-textures="4"`.
- `data-thumbnail-sprite-baseline-draw-calls="3184"`.
- `data-thumbnail-sprite-baseline-textures="3184"`.
- Runtime frame/render timing attributes.

Those attributes are useful for future checks, but they do not represent a new
renderer replacing a Sprite renderer in the current pushed branch.

## Sprite Counterfactual

A true per-thumbnail Sprite renderer for this same non-focused view would have
approximately:

| Renderer shape | Draw calls | Live GPU textures | Materials | Source image requests |
| --- | ---: | ---: | ---: | ---: |
| Per-thumbnail Sprite counterfactual | `3,184` | `3,184` | `3,184` | `3,184` |
| Current generated atlas path | `4` | `4` | `4` | `4` |

So the atlas/instanced architecture is already the right rendering direction.
The branch did not prove that by replacing a live Sprite implementation; it
confirmed that the pushed code has already crossed that architectural line.

## LOD And Visibility

"Viewport-aware" should not mean hiding most of the archive behind a cap. The
product requirement is that every image must remain discoverable and reachable.
The real problem is image visibility at each zoom level:

- At whole-map zoom, all image positions can be visible as points, density, or
  very small marks, but 9,000 readable thumbnails cannot all fit without turning
  into an unreadable carpet.
- At mid zoom, the viewer should promote a readable subset of thumbnails based on
  screen separation, cluster/source coverage, and current viewport.
- At detail zoom, the viewer should use the highest practical thumbnail LOD for
  all images that can actually be read in the visible area.
- Selected images and FAISS neighbors should be promoted regardless of the
  current sampling rule.

The current code supports thumbnail sizes `32`, `64`, and `96`, and atlas
generation supports arbitrary tile-size directories such as `32px`, `64px`, and
`96px`. The tested J Shoot run currently has only:

```text
viewer/atlases/64px/atlas-manifest.json
```

The run-data loader hard-prefers `viewer/atlases/64px/atlas-manifest.json` before
falling back to the first available atlas directory. If 32px and 96px atlases
exist for other runs, the frontend still needs explicit atlas-LOD selection
instead of always loading the 64px manifest first.

## Recommendation

Do not spend the next experiment comparing Sprites versus instanced atlases. The
pushed viewer already uses the instanced/generated-atlas shape for this run, and
the A/B numbers are effectively identical.

The next useful experiment should compare LOD and visibility policies on top of
the existing atlas renderer:

1. Keep generated atlas pages as the rendering primitive.
2. Add explicit atlas LOD selection so `thumb=32`, `thumb=64`, and `thumb=96`
   can load matching atlas manifests when they exist.
3. Test whole-map, mid-zoom, and detail-zoom policies separately.
4. Measure readability, thumbnail count, atlas pages, decoded bytes, draw calls,
   pan frame time, and selection/neighbor promotion.
5. Treat selected image and FAISS neighbors as semantic overlays that stay
   visible independently of the LOD sampling rule.

Threshold opinion after this test:

- For maps around `3k` images with generated 64px atlas pages, the current
  instanced atlas renderer is already acceptable from a draw-call and texture
  count perspective.
- For `9k-10k` images, stay on generated atlas pages but do not default to
  loading a single 64px all-image carpet at whole-map zoom. Use a 32px overview
  LOD or point/density overview, then promote readable thumbnails as zoom and
  screen space allow.
- Move beyond the current all-64px behavior when either whole-map readability
  fails, decoded atlas memory becomes uncomfortable, or pan/zoom frame time
  exceeds the target device budget. The likely trigger is not draw calls anymore;
  it is visual legibility and decoded atlas memory.
