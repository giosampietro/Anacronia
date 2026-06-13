# Latent Map Neighborhood Layout PRD

Date: June 13, 2026

Branch: `codex/latent-map-instanced-thumbnails`

Status: planning draft for issue #224. This supersedes the previous drawer/panel direction for the same feature.

## Problem Statement

The Latent Space Explorer already lets the user click an image and highlight its FAISS neighbors on the UMAP map. That is useful for spatial context, but it is weak for close visual comparison: similar images may overlap, sit far apart, or appear too small to compare confidently.

The previous drawer concept solved comparison by adding a UI panel. The stronger direction is to keep the interaction inside the WebGL visualization itself: selecting an image can transition the current FAISS neighborhood from map positions into a readable comparison layout.

## Solution

Add an in-canvas **Neighborhood Layout Mode** to the Latent Space Explorer.

When the user selects an image and opens the neighborhood view, the WebGL scene transitions from the normal UMAP map into a temporary FAISS comparison layout:

- the selected image becomes a large anchor on the left;
- the selected image's closest FAISS neighbors tween into a rank-ordered grid on the right;
- non-neighborhood images fade out or disappear from the active visual layer;
- pan and zoom remain WebGL camera interactions;
- clicking a neighbor selects that image and rebuilds the neighborhood layout around it;
- exiting returns the images to their normal UMAP map positions.

This is a data-visualization mode, not an HTML drawer and not a modal overlay. The canvas remains the primary interaction surface.

## User Stories

1. As a Latent Space Explorer user, I want to turn a selected image's FAISS neighbors into a readable in-canvas grid, so that I can compare similar images without leaving the map experience.
2. As a Latent Space Explorer user, I want the selected image to become a large comparison anchor, so that the neighborhood always has a clear reference image.
3. As a Latent Space Explorer user, I want neighbors arranged by FAISS rank, so that the most similar images are easiest to inspect first.
4. As a Latent Space Explorer user, I want the transition from UMAP map to neighborhood grid to animate, so that I understand where the focused images came from.
5. As a Latent Space Explorer user, I want clicking a neighbor in the grid to select it and rebuild the neighborhood around it, so that I can walk through chains of visual similarity.
6. As a Latent Space Explorer user, I want to exit the neighborhood layout and return to the normal UMAP map, so that comparison mode does not trap me.
7. As a Latent Space Explorer user, I want non-neighborhood images hidden or strongly deemphasized in this mode, so that the comparison layout is readable.
8. As a Latent Space Explorer user, I want pan and zoom to remain WebGL interactions, so that I can inspect the comparison layout without a separate scroll panel.
9. As a Latent Space Explorer user, I want the neighborhood layout to use higher-detail available image derivatives, so that the large anchor and grid images are not just blown-up atlas thumbnails.
10. As a Latent Space Explorer user, I want loading states for higher-detail images to be graceful, so that the layout appears quickly and sharpens as previews arrive.
11. As a Latent Space Explorer user, I want the normal selected/neighbor canvas focus behavior to remain available outside neighborhood mode, so that this feature does not replace ordinary map navigation.
12. As a Latent Space Explorer user, I want `Escape` to exit neighborhood layout mode, so that returning to the map is fast.
13. As a Latent Space Explorer user, I want `n` to toggle neighborhood layout mode for the current selection, so that the interaction is fast during exploration.

## Implementation Decisions

- Issue #224 now tracks WebGL Neighborhood Layout Mode, not a DOM drawer.
- The mode visualizes saved FAISS closest-neighbor rows from the current Analysis Result. It does not compute FAISS in the browser and does not use UMAP layout distance as a relationship source.
- The first implementation is closest-neighbors-only. Opposite and both-relation neighborhood layouts are deferred.
- Clicking a neighbor in the grid selects that neighbor and rebuilds the layout around it. This is the preferred behavior, not an optional branch.
- Use the existing 1024px preview derivatives for the active neighborhood set when available. This is acceptable for the selected image plus a bounded neighbor set such as 20 or 50 images.
- Do not use 1024px images for the whole latent map. Normal map rendering should keep using thumbnails, atlas pages, and the existing level-of-detail path.
- The 1024 preview texture path should be lazy and scoped to Neighborhood Layout Mode. Load previews for the selected anchor and visible/ranked neighbors, keep a bounded cache, and fall back to existing atlas thumbnails while previews load or fail.
- The large selected anchor can target roughly 500px on its long side, but should use responsive bounds so it does not consume the whole canvas on smaller windows.
- The grid should be computed in view/canvas space and projected into the existing orthographic world model so WebGL pan/zoom still works.
- The animation should tween instance position, scale, and opacity between map coordinates and neighborhood layout coordinates. Do not rebuild Three.js objects during the tween.
- The selected image and neighbors should use the same image IDs and FAISS semantics as the existing focus behavior.
- Non-neighborhood points can fade out, hide, or become tiny subdued points during the mode. The first implementation should favor readability over preserving all background context.
- Exiting the mode should restore normal UMAP positions and the existing selected image state.
- Keyboard shortcuts must keep existing focus guards for inputs, selects, buttons, comboboxes, listboxes, options, contenteditable elements, and open select/popover content.
- `n` toggles Neighborhood Layout Mode when an image is selected.
- `Escape` exits Neighborhood Layout Mode before clearing selection or affecting other map state.
- `h` should recenter the active layout. In map mode it recenters the UMAP view; in neighborhood mode it recenters the comparison layout.
- This mode should be implemented as a new render/layout state, not as an HTML overlay on top of the canvas.

## Layout Contract

The first layout should be intentionally simple:

- selected anchor on the left;
- neighbor grid on the right;
- rank order proceeds left-to-right, top-to-bottom;
- grid cell size is derived from available canvas area and neighbor count;
- grid images maintain aspect ratio within their cells;
- selected anchor and neighbor grid share one coherent camera space;
- map background is hidden or heavily deemphasized.

The layout should work first for 20 closest neighbors. It should also be tested with 50 closest neighbors because the viewer already supports that count.

## Texture Detail Contract

Neighborhood Layout Mode has different texture needs from the dense map:

- Dense UMAP map: use generated atlas thumbnails and existing texture LOD.
- Neighborhood layout: use `preview_path` / 1024px preview derivatives for the selected image and the bounded neighbor set when available.
- Fallback: use atlas or thumbnail texture if the preview is still loading or unavailable.
- Cache: keep a small preview texture cache for recently visited neighborhood images, with explicit disposal to avoid leaking GPU memory.
- Measurement: expose runtime diagnostics for preview texture count and approximate preview texture memory.

Using 1024px previews for 21 images is reasonable on modern hardware if bounded and lazily loaded. Using 1024px previews for hundreds or thousands of map images is not acceptable.

## Testing Decisions

- Pure layout tests should verify anchor position, grid positions, rank ordering, responsive bounds, and 20/50 neighbor layouts.
- State tests should cover entering, exiting, toggling with `n`, exiting with `Escape`, and `h` recenter behavior in both map and neighborhood modes.
- Neighbor navigation tests should cover clicking a grid neighbor, selecting it, fetching or reusing its closest neighbors, and rebuilding the layout without closing the mode.
- Texture tests should cover preview-path preference, thumbnail fallback, bounded preview cache behavior, failed preview loading, and disposal on mode exit/unmount.
- Runtime tests should verify that the mode updates instance attributes or render plans rather than creating one mesh/material per image.
- Real-data browser QA should use the J Shoot latent-map run with 20 and 50 closest neighbors, repeated neighbor clicking, zoom/pan while in neighborhood layout, mode exit, and no browser console errors.

## Proposed Vertical Slices

These are proposed child issues. They should not be published until the breakdown is approved.

1. **Define in-canvas neighborhood layout contract**
   - Type: HITL.
   - Blocked by: none.
   - Purpose: confirm the mode replaces the drawer direction, closest-only first, selected anchor plus grid layout, click-neighbor-to-rebuild behavior, 1024-preview usage, and exit controls.

2. **Add tested neighborhood layout state and pure layout helpers**
   - Type: AFK.
   - Blocked by: slice 1.
   - Purpose: compute active neighborhood rows, anchor and grid target rectangles, rank order, map-to-layout target transforms, and recenter targets without changing rendering.

3. **Add basic WebGL neighborhood layout mode with thumbnail textures**
   - Type: AFK.
   - Blocked by: slice 2.
   - Purpose: `n` enters/exits, `Escape` exits, selected and closest neighbors tween into anchor/grid positions using existing thumbnail/atlas texture sources, and non-neighborhood images fade or hide.

4. **Add click-neighbor rebuild loop**
   - Type: AFK.
   - Blocked by: slice 3.
   - Purpose: clicking a neighbor selects it, loads or reuses its FAISS closest neighbors, rebuilds the in-canvas layout around it, and keeps the mode active.

5. **Add bounded 1024 preview textures for active neighborhood**
   - Type: AFK.
   - Blocked by: slice 3.
   - Purpose: lazy-load `preview_path` textures for the selected anchor and visible/ranked neighbors, fallback to thumbnail textures while loading, and dispose/cache within a small budget.

6. **Harden animation, interaction, and real-data QA**
   - Type: AFK.
   - Blocked by: slices 4 and 5.
   - Purpose: tune tween timing, preserve FPS, verify 20/50 neighbors on J Shoot, ensure mode exit restores map positions, and expose runtime diagnostics for preview texture usage.

## Out Of Scope

- DOM drawer or panel implementation.
- Cluster-member drawers.
- Orbit, spiral, strip, or representative-grid layouts for cluster results.
- Graph community, hierarchy, or cluster diagnostics work.
- Browser-side FAISS computation.
- UMAP-distance neighbors.
- Loading 1024px previews for the full latent map.
- Changing the dense-map atlas strategy.
- Full opposite/both neighborhood layout support in the first implementation.
- Persistent neighborhood mode URL state in the first implementation.

## Further Notes

This direction is more ambitious than the drawer, but it better matches the Latent Space Explorer as a WebGL data visualization. The key implementation risk is to keep it as a bounded layout mode over the existing selected image and FAISS neighbor set, rather than turning the renderer into a second independent gallery system.
