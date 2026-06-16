# Latent Map Implementation Log After `bd3d257`

Date: June 12, 2026

Branch: `codex/latent-map-instanced-thumbnails`

Baseline commit: `bd3d257 Record UMAP spectral initialization`

Parent PRD issue: #179

## Status

- Historical implementation log for the `codex/latent-map-instanced-thumbnails` branch.
- Useful for understanding why current latent-map controls, launchers, and rendering decisions exist.
- Not a controlling product or architecture contract.

## Scope

This log records the local work completed after the last pushed commit on this branch. The slice extends the latent-map viewer from texture-LOD and method-comparison work into a tighter exploratory UI with FAISS relationship controls, a reusable sidebar layout, a faster worktree launcher, and theme-aware WebGL canvas colors.

## Implemented Work

### FAISS relationship controls

- Added durable URL state for `neighbors=3|5|10|20|50` and `relation=closest|opposite|both`.
- Added sidebar controls for FAISS neighbor count and focus relation.
- Kept FAISS as the similarity source of truth; UMAP remains only the navigation layout.
- Highlighted selected, closest-neighbor, and opposite-neighbor states through the same render-plan path so selected/focus thumbnails stay promoted.
- Moved the selected FAISS focus indicator to the bottom-left canvas overlay.
- Kept loaded neighbor/opposite rows cached by selected image ID in the viewer so UI changes can sub-slice without repeated requests when data is already present.

### FAISS query service

- Extended `/api/latent-map/neighbors` with `top_k` and `relation` query parameters.
- Preserved existing closest-neighbor behavior for precomputed JSON/JSONL neighbor rows.
- Added runtime opposite-neighbor lookup from the embedding matrix by reading the recipe `.npy` file and FAISS ID map.
- Normalized vectors before dot-product scoring so opposite retrieval uses the same cosine/IP interpretation as the FAISS cache.
- Cached parsed embedding indexes per run and recipe inside the route module.
- Bounded requested `top_k` to a maximum of `100`; the UI currently exposes `3`, `5`, `10`, `20`, and `50`.

### Sidebar UI

- Moved latent-map controls from the top bar into the same shadcn sidebar approach used by the main app.
- Added sidebar sections for Display, Method, Filters, and Search.
- Put the Anacronia title and day/night theme switch in the sidebar header.
- Kept the latent-map title as a lightweight canvas overlay next to the sidebar trigger.
- Kept Cluster colors and Reset view as sidebar menu actions near the Display controls.
- Preserved URL-state updates for render mode, thumbnail size, texture detail, method selection, filters, FAISS count, FAISS relation, selected image, and view position.

### Canvas theme and visual treatment

- Connected the app day/night theme class to the Three.js runtime state.
- Added a WebGL visual palette instead of relying only on DOM background classes.
- Dark canvas clears to `#101113`.
- Light canvas clears to `#f0f0f0`, matching the requested neutral light grey.
- Light-theme base dots use a darker neutral than the old grey-on-black color.
- Selected dots switch to dark on the light canvas and light on the dark canvas.
- The Latent Map overlay pill now uses a low-background outline treatment instead of a heavy filled pill.

### Worktree launch and iteration workflow

- Split slow prep from daily launch:
  - `batch-cmd/prepare-latent-map-j-shoot.command` verifies or generates atlases, comparison UMAP layouts, top-50 FAISS caches, and the Next production build.
  - `batch-cmd/start-latent-map-j-shoot.command` is now the fast daily launcher.
  - `batch-cmd/start-latent-map-j-shoot-dev.command` is available only when Next dev-mode hot reload is worth the file-watching risk.
- The fast launcher runs from the current worktree, uses port `18661`, and leaves main on `18660`.
- It reuses an already healthy latent-map server.
- It restarts only stale/unhealthy listeners on the reserved worktree port.
- It starts the prebuilt Next app directly and verifies the real J Shoot latent-map URL before opening the browser.
- It refuses to do slow generation work during daily launch, preserving the 10-15 second launch target.

### Zoom performance follow-up

- Dynamic high-detail atlas filtering initially coupled the thumbnail render plan to every `view` change.
- That made wheel zoom pay for texture-detail resolution, viewport page selection, and runtime render-state updates on the same high-frequency path as camera movement.
- The viewer now separates the live camera view from the thumbnail-planning view.
- `setView` still updates the Three.js camera and current instance scale immediately.
- Atlas LOD and viewport page-cache planning update only after the thumbnail-mode gesture has been idle for `220ms`.
- The lower-detail fallback atlas remains visible while high-detail page selection catches up.

### Tests and QA

- Added and updated Vitest coverage for:
  - FAISS neighbor count slicing.
  - Opposite-neighbor selection.
  - Relation response normalization.
  - URL parsing/serialization for neighbor count and relation mode.
  - Component rendering of sidebar, FAISS controls, and map theme attributes.
- Ran focused latent-map tests: `npm test -- latent-map-viewer` passed with 50 tests.
- Ran production build: `npm run build` passed.
- Ran touched-file lint: `npx eslint src/components/latent-map-viewer.tsx src/components/latent-map-viewer.test.tsx src/lib/latent-map-webgl-runtime.ts` passed.
- Browser QA on real J Shoot data at `localhost:18661` confirmed:
  - the real route loads on the worktree port;
  - light canvas wrapper and inset compute to `rgb(240, 240, 240)`;
  - no browser console errors were reported during the theme check.

## Product and Architecture Notes

- No new ADR is needed for this slice.
- The work remains within the existing prototype and Analysis Result boundaries described by ADR-0023.
- The launch improvements refine ADR-0019's local-process supervision direction but do not change its architecture.
- The FAISS API extension is a prototype viewer service over existing run artifacts; it does not introduce a permanent database or Collection model change.
- The sidebar and theme changes are UI integration decisions inside the latent-map viewer, not repo-wide architecture decisions.

## Known Non-Blocking State

- Full `npm run lint` still fails on unrelated existing issues:
  - `web/src/app/page.tsx:691` has unescaped quote lint errors.
  - `web/src/lib/selection-action-summary.ts:165` has an unused parameter warning.
- Issue #211 remains the human checkpoint for tuning the extended texture LOD ladder.
- Future FAISS exploration ideas such as a gradient/path between two images, alternate relation lenses, and richer opposite/similarity workflows are not implemented in this slice.

## Update After Commit `4f47144`

### Canvas display overlay and issue #212

- Removed the Display controls from the sidebar and moved them into a tight shadcn canvas overlay.
- Kept the overlay icon-only for the Points/Thumbnails mode switch.
- Default launch state is now `thumb=64&detail=auto`; `Auto` remains the normal detail mode.
- Moved Cluster colors and Reset view into the same canvas overlay.
- Added keyboard shortcuts:
  - `Left` / `Right` cycle thumbnail display size.
  - `Up` / `Down` cycle texture detail through `Auto` and every atlas size advertised by the run manifest.
  - `P` toggles Points/Thumbnails.
  - `F` hides or restores the UI overlays so the canvas can be viewed alone while hover preview remains available.
  - `H` recenters the canvas.
- Shortcut handlers ignore focused inputs, selects, buttons, menu/listbox options, and modified browser shortcuts.
- Selection and FAISS focus states no longer scale thumbnails larger than the current display size; emphasis stays non-scaling.
- The hover preview overlay no longer draws a white or black border and uses only a soft shadow treatment.

### Atlas detail and performance follow-up

- Manual texture detail selection now resolves exactly to the selected atlas when that detail exists.
- `Auto` detail selection uses the full sorted atlas ladder from the run manifest, including `128px`, instead of assuming a fixed three-level set.
- The render plan keeps atlas page bounding boxes so viewport page filtering can skip whole pages before inspecting individual items.
- The FPS counter was simplified to show only FPS and moved to the lower-right canvas corner.

### Checks

- Focused latent-map tests now pass with 55 tests.
- Touched-file lint passes for the latent-map component and helper/test files.
- `npm run build` passes for the web app.

## Update After HDBSCAN Issues #214-#219

### HDBSCAN cluster artifacts

- Added `latent-map hdbscan-build` to generate saved HDBSCAN cluster results from existing DINO embedding matrices.
- Added four presets for each recipe: `HDBSCAN · Fine`, `HDBSCAN · Detail`, `HDBSCAN · Balanced`, and `HDBSCAN · Broad`.
- HDBSCAN runs on L2-normalized DINO vectors with Euclidean distance.
- Cluster artifacts include method metadata, preset params, group summaries, unassigned count, point memberships, and stable group keys.
- Generated the J Shoot HDBSCAN artifacts for both `dinov3_vits_256` and `dinov3_vits_384`.
- The J Shoot `clusters/` directory is about `4.0M` after adding the HDBSCAN artifacts.

### Viewer UX

- The cluster result dropdown now displays HDBSCAN labels and sorts HDBSCAN presets as Fine, Detail, Balanced, Broad, with K-means still available after them.
- The old Cluster filter is now a Group focus selector derived from the selected cluster result's saved groups.
- Group focus is a render state, not a data filter: all images stay in the map and remain hover/click targets.
- Focused group images stay as normal thumbnails.
- Non-focused images become small dark-pink points using the same `3px` point layer size used for FAISS background points.
- Selected image and FAISS closest/opposite states still take visual precedence over group focus.
- Group focus persists through the existing `cluster=` URL parameter and invalid group values fall back to `All groups`.

### Exports and comparison

- Viewer exports and the live run loader now preserve `cluster_result`, HDBSCAN groups, unassigned count, params, and membership strength.
- Result exports include cluster method metadata and group selections, including HDBSCAN membership assignments when present.
- Method comparison exports now report available HDBSCAN presets instead of treating HDBSCAN as a permanently deferred capability.

### Launch and docs

- The slow prep command verifies or generates HDBSCAN presets for both DINO recipes.
- The fast launcher verifies HDBSCAN artifacts before starting and keeps clustering out of the 10-15 second daily launch path.
- Added [Latent Map HDBSCAN Clustering PRD](latent-map-hdbscan-clustering-prd.md).
- No new ADR is needed; these are versioned analysis-result artifacts under ADR-0023.

### Checks

- Full Python tests passed: `258 passed`.
- Full Vitest suite passed: `201 passed`.
- Touched-file ESLint passed for the latent-map viewer/helper files.
- `npm run build` passed.
- Browser QA on the real J Shoot run at `localhost:18661` confirmed:
  - `HDBSCAN · Balanced` loads in the cluster result control;
  - `Group 0 · 154` focus persists through `cluster=cluster%3A0`;
  - all `3184` points remain in the map data;
  - the focused group renders `154` thumbnails;
  - the non-focused layer remains visible at `3px`;
  - no browser console warnings or errors were reported.

## Update After HDBSCAN Review

The HDBSCAN artifacts are being kept, but the first J Shoot results show that direct HDBSCAN on DINO vectors is not the preferred next grouping path. Most presets either leave too many images unassigned or create groups that are too broad to help visual exploration.

Added [Latent Map Clustering Roadmap PRD](latent-map-clustering-roadmap-prd.md) as durable project memory for the next clustering experiments. The current implementation order is:

1. [#221 FAISS kNN graph community clustering](https://github.com/giosampietro/Anacronia/issues/221).
2. [#222 Hierarchical clustering with a user-facing granularity control](https://github.com/giosampietro/Anacronia/issues/222).
3. Cluster diagnostics to make group quality visible.

This remains under ADR-0023's Analysis Result provenance boundary. No app-wide ADR is needed unless the core local app, analysis pipeline, and latent-map viewer change their artifact contract.

## Update After Issue #221

Implemented FAISS kNN graph-community clustering as saved latent-map cluster artifacts.

### Graph-community artifacts

- Added `latent-map graph-communities-build`.
- The builder reads saved FAISS neighbor JSONL rows and writes normal `latent-map-cluster-result` artifacts under `clusters/`.
- Presets are `Graph communities · Broad`, `Graph communities · Balanced`, `Graph communities · Detail`, and `Graph communities · Fine`.
- The first implementation uses deterministic weighted label propagation over the FAISS neighbor graph.
- This replaced an earlier connected-component pass because the connected-component version left too many images unassigned.

Real J Shoot `dinov3_vits_384` results:

- Broad: 127 communities, 1 unassigned image.
- Balanced: 227 communities, 1 unassigned image.
- Detail: 354 communities, 32 unassigned images.
- Fine: 633 communities, 340 unassigned images.

### Viewer and exports

- Graph-community cluster results sort before HDBSCAN and K-means in live run loading and static viewer exports.
- Group focus reuses the existing group behavior: focused images stay thumbnails and non-focused images stay visible as small dark-pink points.
- Result exports now use saved group labels from any cluster artifact, not only HDBSCAN.
- Method comparison exports now include a `graph_communities` summary beside the existing `hdbscan` summary.

### Launch

- Slow prep generates graph-community presets after FAISS top-50 neighbors exist.
- Fast launch verifies graph-community artifacts and opens the balanced graph-community result by default.

## Update After Issue #222

Implemented hierarchical clustering as saved latent-map cluster artifacts.

### Hierarchy artifacts

- Added `latent-map hierarchy-build`.
- The builder reads saved DINO embedding matrices, L2-normalizes vectors, and runs agglomerative clustering with average linkage and cosine distance.
- Presets are `Hierarchy · Broad`, `Hierarchy · Balanced`, `Hierarchy · Detail`, and `Hierarchy · Fine`.
- The first cut ladder uses target cluster counts of 24, 48, 96, and 192.
- Cluster artifacts reuse the existing `latent-map-cluster-result` shape with method metadata, granularity params, group summaries, stable group keys, point assignments, and provenance back to the recipe inputs.
- Hierarchy assigns every embedded image to a group, so `unassigned_count` is `0`.

Real J Shoot results for both `dinov3_vits_256` and `dinov3_vits_384`:

- Broad: 24 groups.
- Balanced: 48 groups.
- Detail: 96 groups.
- Fine: 192 groups.

### Viewer and exports

- Hierarchy cluster results sort after graph communities and before HDBSCAN and K-means in live run loading and static viewer exports.
- The existing cluster result selector acts as the finite granularity control by exposing `Hierarchy · Broad`, `Hierarchy · Balanced`, `Hierarchy · Detail`, and `Hierarchy · Fine`.
- Group focus reuses the current behavior: focused groups stay thumbnails and non-focused images remain discoverable as 3px dark-pink background points.
- Result exports include hierarchy method metadata and selected group labels.
- Method comparison exports now include a `hierarchy` summary beside `graph_communities` and `hdbscan`.

### Launch and browser workflow

- Slow prep generates hierarchy presets for both DINO recipes when missing.
- Fast launch verifies hierarchy artifacts and opens the balanced hierarchy result by default.
- Added [Browser Tooling](../agents/browser-tooling.md) as agent guidance for local UI QA.
- Updated [Latent Map Worktree Launch](latent-map-worktree-launch.md) to make the in-app browser the default rendered UI QA path and to avoid standalone Playwright launches of the installed macOS Chrome.
- Opened [#223 Cluster diagnostics summary](https://github.com/giosampietro/Anacronia/issues/223) as the follow-up vertical slice from the clustering roadmap.

### Checks

- Full Python tests passed: `267 passed`.
- Full Vitest suite passed: `201 passed`.
- `npm run build` passed.
- Real-data generation produced hierarchy artifacts for both `dinov3_vits_256` and `dinov3_vits_384`.
- Method comparison reports `graph_communities`, `hierarchy`, and `hdbscan` as available.
- In-app browser QA on the real J Shoot run at `localhost:18661` confirmed:
  - `Hierarchy · Balanced` is selected through `clusterResult=hierarchy_balanced_k48_average_cosine_l2`;
  - `Group 0 · 991` focus persists through `cluster=cluster%3A0`;
  - all `3184` points remain in the map data;
  - the focused group renders `991` thumbnails;
  - the non-focused layer remains visible at `3px`;
  - no in-app browser console warnings or errors were reported.

## Update After Issue #224

Issue #224 was closed once the in-canvas Neighborhood Layout Mode landed through its child slices. The follow-up UI work below happened after that closure because real-data QA made several product intentions clearer than the original implementation tracker.

### Neighborhood comparison UX

- Kept the drawer direction obsolete. The comparison experience remains inside the WebGL canvas.
- Kept `n` as the fast entry/exit shortcut for the selected image's FAISS neighborhood.
- Disabled hover detail previews in neighborhood mode. They made the comparison layout confusing and duplicated the large preview role.
- Hid the dense-map visual layer during neighborhood mode so the user sees a comparison surface, not a map carpet behind a grid.
- Preserved the normal UMAP map view state while in neighborhood mode. Exiting returns to the pan/zoom state from entry instead of inheriting neighborhood zoom.
- Kept the selected anchor visually dominant and rendered above the grid. This is intentional because the anchor is the comparison reference.

### Grid and zoom behavior

- Changed the layout from the original 3-column plan to a fixed 4-row grid, with columns expanding horizontally from the active FAISS count.
- Set the anchor area to roughly `2/5` of the WebGL canvas width, with larger top/bottom padding so square and landscape anchors do not overtake the viewport.
- Used a 32px grid gutter to match the anchor padding rhythm.
- Treated the gutter as a visible edge-to-edge spacing contract. Because thumbnails preserve aspect ratio, the implementation prioritizes fixed visible gaps over perfect CSS-like column alignment.
- Added screen-surface zoom behavior so neighborhood zoom follows the cursor over both image tiles and empty canvas.
- Capped grid zoom relative to the anchor long side so the user can inspect 1024px previews without the grid drifting sideways at max scale.
- Stored packed screen-space grid origins in the runtime target data so later render and wheel math do not reconstruct gutters from row/column indexes and mixed aspect ratios.

### Preview and relation data

- Used 1024px preview derivatives for the active anchor and relation grid, with atlas thumbnails only as loading fallback.
- Kept the active FAISS neighbor count honored in neighborhood mode; `50` should render 50 closest rows, not silently fall back to 20.
- Moved FAISS relation lookup to live server-side queries over the selected recipe's FAISS index and ID map. Saved neighbor JSONL rows are legacy prototype artifacts, not the current viewer contract.

### Checks and documentation

- Updated [Latent Map Neighborhood Layout PRD](latent-map-neighborhood-layout-prd.md) with the post-close UI contract and issue closure pattern.
- Focused Vitest coverage now includes neighborhood layout targets, screen-space zoom controls, WebGL preview transforms, and packed gutter behavior.
- Rebuilt and relaunched the worktree app on `localhost:18661`, opened the real J Shoot run with `neighbors=50`, entered neighborhood mode, zoomed the grid, and confirmed the browser console stayed clean.
