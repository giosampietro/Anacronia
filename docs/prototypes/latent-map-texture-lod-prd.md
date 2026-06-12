# Latent Map Texture LOD PRD

Date: June 10, 2026

Branch: `codex/latent-map-instanced-thumbnails`

## Goal

Make latent-map thumbnails stay readable and performant while zooming by switching atlas texture resolution automatically.

This is texture LOD only. It must not change point placement, thumbnail quad count, thumbnail world size, thumbnail screen size, selection behavior, FAISS neighbor behavior, or map layout.

## User Outcome

The user can keep navigating the same latent map while image detail improves naturally as they zoom in.

- Zoomed out: the map stays responsive and uses lower-resolution atlas textures.
- Mid zoom: thumbnails become clearer without changing size.
- Close zoom: thumbnails use sharper atlas tiles.
- The user can easily change how large thumbnails appear on the canvas.

The user should perceive improved sharpness, not layout shifts or thumbnails popping larger.

## UX Proposal

Expose two separate controls:

- `Thumb size`: `Small`, `Medium`, `Large`
- `Texture detail`: `Auto`, plus the generated atlas sizes available for the current run

Default:

- `Thumb size`: `Medium`
- `Texture detail`: `Auto`

`Thumb size` controls visual scale only. `Texture detail` controls which generated atlas backs the same thumbnail quads. `Auto` should be the normal user path; fixed atlas sizes are useful for comparison, QA, and performance debugging.

The current J Shoot run should carry `32px`, `64px`, `96px`, and `128px` atlases for this LOD pass. Future runs may add levels such as `16px` or `256px`; the UI should render manual options from the run manifest instead of hard-coding three choices.

Keep URL state durable:

- Keep `thumb` for the user-facing thumbnail display size.
- Add `detail=auto|<atlasTileSize>` for texture detail.
- Existing URLs with only `thumb=32|64|96` should still load. During the transition, interpret `thumb` as the display-size request and default `detail` to `auto`.

## Planning Inputs

This plan follows the `threejs-visualization` skill guidance:

- Keep the latent map as a 2D WebGL renderer with an orthographic camera.
- Keep all images discoverable through stable point geometry and map navigation.
- Use generated thumbnails and atlas pages, not original source images.
- Batch thumbnails through instanced quads and one draw group per atlas page.
- Keep render-plan logic in `web/src/lib/` so it is testable without WebGL.
- Track `renderer.info` diagnostics for draw calls, textures, geometries, and render timing.
- Explicitly set texture color space for color image atlases.

Installed Three.js version for this branch is `0.184.0`.

Authoritative source checks:

- Three.js `Texture` docs/source define texture filters, mipmap generation, and texture color space. The current runtime overrides defaults with `SRGBColorSpace`, `LinearFilter`, and `generateMipmaps = false` for atlas `CanvasTexture`s.
- Three.js `WebGLRenderer` docs/source expose `outputColorSpace`, `renderer.info`, and renderer capabilities such as max texture size and texture count.
- WebGL texture APIs expose minification/magnification filters and mipmap generation. Those are GPU sampling controls inside a given texture; the product-level LOD here is explicit generated-atlas selection.

Relevant references:

- https://threejs.org/docs/#api/en/textures/Texture
- https://threejs.org/docs/#api/en/renderers/WebGLRenderer
- https://github.com/mrdoob/three.js/blob/r184/src/textures/Texture.js
- https://github.com/mrdoob/three.js/blob/r184/src/renderers/WebGLRenderer.js
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/generateMipmap
- https://registry.khronos.org/webgl/specs/latest/1.0/

## Functional Requirements

- Separate display thumbnail size from atlas tile size in state and render planning.
- Preserve URL durability for both controls.
- In `Auto`, choose the atlas from the current thumbnail screen size.
- Add hysteresis so texture detail does not flicker around thresholds.
- Keep selected image and FAISS neighbors at the highest useful available texture detail.
- Fall back gracefully when an atlas size is missing.
- Keep generated atlas rendering through instanced draw groups by atlas page.
- Do not blank the canvas or clear the current atlas pages while the next texture detail level is loading.
- Expose data attributes for display size, requested texture detail, resolved texture detail, atlas tile size, atlas page count, draw calls, and live texture count.

## Technical Design

Split the current `thumbnailSize` concept into two independent values:

- `displayThumbnailSize`: controls quad world scale and perceived thumbnail size.
- `textureDetail`: controls atlas source selection, with `auto` as the default.

The render plan should receive both values:

```ts
createLatentMapThumbnailRenderPlan({
  displayThumbnailSize,
  textureAtlas,
  textureDetail,
  points,
});
```

`displayThumbnailSize` is used only for `instanceScale`. `textureAtlas.tile_size` is used only for UV/page selection and texture loading.

The render infrastructure may rebuild internal atlas-page batches when the selected texture atlas changes, because `32px`, `64px`, and `96px` atlases have different page counts and UV rects. That is acceptable as implementation detail. The visible geometry contract must remain unchanged: same logical thumbnails, positions, and screen/world scale.

Do not encode valid atlas sizes as a TypeScript union like `32 | 64 | 96` in the LOD layer. Use numeric tile sizes discovered from `data.thumbnail_atlases`, sorted ascending. The current generator can still validate supported sizes separately until more atlas sizes are intentionally added.

## LOD Ladder

The first shipping ladder should be:

```text
32px -> 64px -> 96px -> 128px
```

The plan should support a larger ladder:

```text
16px -> 32px -> 64px -> 96px -> 128px -> 256px
```

Do not generate or load every possible level by default. Each level has a different cost profile:

- `16px`: cheap and useful for very zoomed-out texture previews, but may be visually too abstract.
- `128px`: useful for close inspection, but increases atlas page count and decoded texture memory.
- `256px`: only reasonable after viewport-aware atlas-page loading, because all-atlas loading would create too many live textures for 3k+ images.

For the current all-thumbnails/all-atlas renderer, `128px` is acceptable for the J Shoot QA run, but should stay behind explicit generated atlas manifests and diagnostics. Introduce `256px` only when the runtime can load atlas pages by viewport/focus set and evict pages outside a memory budget.

## Auto Selection

Use a pure helper in `web/src/lib/`:

```ts
selectLatentMapTextureDetail({
  availableDetails,
  displayThumbnailScreenLongSide,
  mode,
  previousResolvedDetail,
});
```

`availableDetails` should come from loaded run data, not from a fixed enum.

In `auto`, calculate `displayThumbnailScreenLongSide` from the same scale math used by the runtime:

```text
screenLongSide = displayWorldLongSide * viewportHeight * zoom / 2
```

Use hysteresis with the previous resolved detail to avoid rapid flips near thresholds.

If the desired atlas is missing, choose the nearest available detail. Prefer the next sharper atlas for selected and FAISS neighbor thumbnails when available.

For arbitrary future ladders, avoid hard-coded thresholds per size. Start from a general rule:

```text
choose the smallest atlas tile size >= target screen long side * qualityRatio
```

Use `qualityRatio` around `1.0` for normal thumbnails, then tune against real images. Apply hysteresis around the resolved neighboring levels rather than around fixed `32/64/96` boundaries.

## Runtime Loading

Current runtime behavior unloads atlas pages when the thumbnail-plan signature changes. Auto texture LOD should avoid visible flicker:

- Keep the current atlas pages rendered while the next atlas pages are loading.
- Decode or load the next atlas page images first.
- Swap the page set only after the requested detail has at least its page textures ready.
- If loading fails, keep the current atlas and report the fallback through diagnostics/data attributes.

Do not rely on WebGL mipmaps as the first implementation of product LOD. Atlas mipmaps can bleed between neighboring packed tiles unless gutters are validated at each mip level. The first pass should keep explicit generated atlas levels and the current no-mipmap atlas texture policy. Mipmaps can be evaluated later as an anti-shimmering improvement after gutter tests.

## Initial Auto Thresholds

Start with screen-space thresholds based on thumbnail long-side size for the current `32/64/96` ladder:

- Use `32px` atlas below `42px` on screen.
- Use `64px` atlas from `42px` to `86px`.
- Use `96px` atlas above `86px`.

Add hysteresis:

- Switch `32 -> 64` at `48px`; switch `64 -> 32` at `36px`.
- Switch `64 -> 96` at `96px`; switch `96 -> 64` at `72px`.

These numbers are starting points and should be tuned against the J Shoot run.

With `128px` included, the implementation should use the general selector above and keep the fixed threshold table only as historical tuning context for the original three-level pass.

## Implementation Steps

1. Add `TextureDetailMode = "auto" | number`, backed by validated available atlas sizes from the run.
2. Add display-size state that is separate from generated atlas tile size.
3. Update URL parsing/serialization for `detail`.
4. Add the pure texture-detail selector with hysteresis tests.
5. Update atlas lookup to choose by resolved texture detail, not display size.
6. Update `LatentMapThumbnailRenderPlan` to carry display size and resolved texture detail separately.
7. Update WebGL runtime signatures so instance scale uses display size while atlas pages use texture detail.
8. Add nonblank swap behavior so old atlas pages remain visible until new atlas pages are ready.
9. Add data attributes and browser QA assertions for manual and auto detail modes.

## Non-Goals

- Do not implement geometry LOD in this pass.
- Do not reduce the number of rendered thumbnails in this pass.
- Do not introduce collision avoidance or representative sampling here.
- Do not load original full-size images for the map.
- Do not make selected thumbnails physically larger as part of texture LOD.
- Do not generate `256px` atlases by default until atlas-page caching exists.

## Acceptance Criteria

- Changing `Thumb size` changes visible thumbnail size without forcing a texture-detail change in manual texture modes.
- Changing `Texture detail` changes `data-thumbnail-atlas-tile-size` without changing thumbnail screen size.
- In `Auto`, zooming in upgrades texture detail and zooming out downgrades texture detail.
- The selected image and FAISS neighbors remain visible and use the best available texture detail.
- The browser console stays clean during zoom and control changes.
- Real-data QA on the J Shoot run confirms `32px`, `64px`, `96px`, and `128px` atlas usage.
- Runtime diagnostics show bounded texture count: expected current J Shoot atlas counts are `1` texture for `32px`, `4` for `64px`, `8` for `96px`, and `13` for `128px`.
- No blank atlas flash is visible during automatic detail transitions.

## June 12, 2026 Implementation Status

The texture LOD work now sits inside a broader latent-map viewer iteration. The current branch keeps the PRD's core display-size versus texture-detail split and adds related viewer controls needed for real use:

- The generated atlas ladder for the J Shoot run is `32px`, `64px`, `96px`, and `128px`.
- `detail=auto` resolves from zoom and viewport size, while manual `detail=<size>` stays fixed.
- The worktree launcher verifies the atlas ladder before fast launch instead of generating missing assets during daily startup.
- FAISS focus controls now expose a durable neighbor-count dropdown and a relation dropdown for `closest`, `opposite`, or `both`.
- The viewer uses the main shadcn sidebar pattern for Method, Filters, and Search controls.
- Display controls now live on a compact canvas overlay: icon-only Points/Thumbnails toggle, thumbnail display size, texture detail, Cluster colors, and Reset view.
- `Left` / `Right`, `Up` / `Down`, `P`, `F`, and `H` provide keyboard control for display size, texture detail, render mode, UI visibility, and recentering. `F` hides controls, not hover inspection.
- Selected and FAISS-focused thumbnails keep the current display size; focus emphasis is non-scaling.
- The day/night theme now reaches the actual WebGL clear color, with light mode clearing to `#f0f0f0` and dark mode clearing to `#101113`.

Detailed implementation notes since commit `bd3d257` are recorded in [Latent Map Implementation Log After `bd3d257`](latent-map-post-bd3d257-implementation-log.md).

No new ADR is required for this update. The work remains prototype UI and run-artifact behavior under ADR-0023's Analysis Result provenance boundary and ADR-0019's local-process supervision direction.
