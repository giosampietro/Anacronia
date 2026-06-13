# Latent Map Neighborhood Drawer PRD

Date: June 13, 2026

Branch: `codex/latent-map-instanced-thumbnails`

## Goal

Add a focused FAISS neighbor inspection surface to the latent-map explorer.

The current map focus behavior is useful for spatial context: when the user selects an image, the selected image and its FAISS neighbors remain thumbnails while the rest of the map becomes points. The missing interaction is side-by-side visual comparison, because relevant neighbors may be overlapped, far apart, or hard to inspect directly on the UMAP canvas.

The neighborhood drawer should let the user quickly inspect the selected image's nearest FAISS neighbors as a readable image set while keeping the map as the navigation surface.

## Scope

This PRD is scoped to FAISS neighbors only.

Cluster-member drawers, orbit layouts, strip layouts, and cluster representative grids can reuse the same interaction model later, but they are not part of the first implementation.

## Product Behavior

- Selecting an image on the map continues to promote the selected image and FAISS neighbors on the canvas.
- A contextual trigger attached to the selected canvas thumbnail opens a `Neighborhood` drawer.
- The `n` key toggles the drawer.
- `Escape` closes the drawer.
- The drawer uses a grid view by default.
- The drawer can be configured as a bottom drawer or a right drawer from the beginning so both placements can be tested before deciding.
- The selected image is not duplicated in the neighbor grid.
- The selected image appears as a sticky comparison anchor:
  - right drawer: sticky anchor at the top, neighbor grid scrolls below;
  - bottom drawer: sticky anchor at the left, neighbor grid scrolls in the remaining area.
- Neighbor thumbnails are shown in FAISS rank order.
- Rank and score stay out of the default visual surface; they may appear on hover for testing.
- Clicking a neighbor in the drawer selects that image, recenters the graph on it, refreshes the FAISS neighborhood, and keeps the drawer open.

## Thumbnail Sizing

The drawer should not auto-shrink all neighbors by default, because that loses the contact-sheet affordance.

The user gets a stepped thumb-size control:

- `S`
- `M`
- `L`
- `XL`
- `Fit`

The normal sizes create a scrollable grid when needed. `Fit` is the explicit mode that calculates a size small enough to show the current neighbor set in the available drawer space when possible.

## Interaction Notes

- The selected-thumbnail trigger is a DOM overlay positioned from the selected WebGL point's projected canvas coordinates.
- The trigger should clamp inside the canvas bounds.
- If the selected image is off-screen, hide the trigger in the first implementation.
- The drawer should use the existing shadcn/UI approach and should not introduce a separate visual language.
- The drawer is an inspection surface, not a modal workflow. The user should be able to keep clicking different map thumbnails and see the drawer update quickly.

## Non-Goals

- Do not add cluster-member drawers in this slice.
- Do not add orbit, spiral, or strip layouts in this slice.
- Do not replace the existing canvas FAISS focus behavior.
- Do not add permanent score labels or dense metadata on thumbnails.
- Do not make the selected or neighbor thumbnails larger on the map itself.
- Do not move FAISS computation into the browser.

## First Issue

[Issue #224: Latent map: add FAISS neighborhood drawer](https://github.com/giosampietro/Anacronia/issues/224)
