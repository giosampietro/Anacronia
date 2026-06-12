# Latent Map Implementation Log After `bd3d257`

Date: June 12, 2026

Branch: `codex/latent-map-instanced-thumbnails`

Baseline commit: `bd3d257 Record UMAP spectral initialization`

Parent PRD issue: #179

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
