# Latent Map Neighborhood Drawer PRD

Date: June 13, 2026

Branch: `codex/latent-map-instanced-thumbnails`

Status: consolidated planning draft after agent critique. This is not an implementation handoff until the issue breakdown is approved.

## Problem Statement

The Latent Space Explorer already highlights a selected image and its FAISS neighbors on the WebGL map. That is useful for spatial context, but it is weak for visual comparison: related images can overlap, sit far apart, or be hard to inspect at the current zoom level.

The user needs a readable, side-by-side inspection surface for the selected image's FAISS nearest neighbors without losing the map as the primary navigation surface.

## Solution

Add a non-modal neighborhood inspection panel for the selected image's saved FAISS closest-neighbor rows in the current Analysis Result.

The panel shows the selected image as a sticky comparison anchor and the closest FAISS neighbors as a rank-ordered grid. It does not compute neighbors in the browser and does not use UMAP layout distance as a relationship source.

The first implementation should be closest-neighbors-only. Opposite and both-relation layouts can be added later after the closest-neighbor workflow is stable.

The panel should use the existing shadcn visual language, but it must not behave like a blocking modal drawer. Map pointer interaction should remain available while the neighborhood panel is open.

## User Stories

1. As a Latent Space Explorer user, I want to open a readable view of the selected image's nearest FAISS neighbors, so that I can compare similar images without relying on overlapping map thumbnails.
2. As a Latent Space Explorer user, I want the selected image to stay visible as the comparison anchor, so that I always know what the neighbor grid is relative to.
3. As a Latent Space Explorer user, I want neighbors shown in FAISS rank order, so that the most similar images appear first.
4. As a Latent Space Explorer user, I want the map to remain interactive while the panel is open, so that the drawer feels like an inspection surface rather than a modal workflow.
5. As a Latent Space Explorer user, I want the `n` key to open and close the neighborhood panel when an image is selected, so that the interaction is fast during exploration.
6. As a Latent Space Explorer user, I want `Escape` to close the neighborhood panel without disturbing the selected image, so that I can return to the map quickly.
7. As a Latent Space Explorer user, I want clicking a neighbor in the panel to select and recenter that image on the map, so that I can walk through a chain of similar images.
8. As a Latent Space Explorer user, I want the panel to update when I select a different image on the map, so that the map remains the source of truth for navigation.
9. As a Latent Space Explorer user, I want the panel to handle loading and unavailable neighbor data clearly, so that failures do not look like empty results.
10. As a Latent Space Explorer user, I want hidden or filtered-out neighbors handled predictably, so that the panel never selects an image the current map cannot show.
11. As a Latent Space Explorer user, I want a small thumbnail-size control for the panel, so that I can switch between compact overview and larger visual inspection.
12. As a Latent Space Explorer user, I want rank and score to stay out of the default visual surface, so that the panel stays image-first.
13. As a Latent Space Explorer user, I want technical rank and score available only as secondary detail, so that testing and debugging remain possible without clutter.
14. As a Latent Space Explorer user, I want the neighborhood panel to respect Focus Mode, so that full-canvas exploration remains available.
15. As a Latent Space Explorer user, I want the selected-neighbor recentering to account for the visible map area, so that the new selected image is not hidden under the panel.

## Implementation Decisions

- The neighborhood panel visualizes saved FAISS closest-neighbor rows from the current Analysis Result. It does not compute FAISS in the browser.
- The first implementation is closest-neighbors-only. Existing opposite and both FAISS relation modes remain canvas focus controls, but drawer support for those modes is deferred.
- The panel is non-modal. A stock drawer overlay that blocks map interaction does not satisfy this PRD.
- Use shadcn styling and components where they fit, but treat this as a docked inspection panel if the drawer primitive cannot be made non-modal without blocking the map.
- The first usable panel can open from the `n` key or a fixed selected-image control. A projected trigger attached to the selected WebGL point is valuable, but should be isolated because it requires tested world-to-screen projection.
- The selected image is not duplicated in the neighbor grid.
- Drawer thumbnail size is separate from map thumbnail size.
- Initial drawer thumbnail steps are `S=72`, `M=96`, `L=128`, and `XL=160` CSS pixels. `Fit` is deferred until the base grid is stable unless it is cheap to implement with a bounded floor and ceiling.
- Drawer open state, placement, and drawer thumbnail size are local UI state in the first slice. URL persistence is deferred unless a later issue explicitly adds it.
- Keyboard shortcuts must ignore input, select, button, combobox, listbox, option, contenteditable, and open select/popover targets.
- `Escape` should close the topmost interactive layer first. Existing select/popover behavior should remain first, then the neighborhood panel.
- Neighbor grid rows are derived from FAISS rank order, not from WebGL thumbnail render order.
- Loading and error state should be keyed to the requested selected image or guarded by request tokens so stale responses cannot overwrite a newer selection.
- If a neighbor is outside the active filters, the first implementation should not silently select an invisible map item. It should either omit the filtered neighbor from the clickable grid or clear the conflicting filter before selecting, with the behavior documented in the child issue.
- Recenter-on-neighbor should use the unobscured map area when the panel covers part of the viewport.
- The bottom and right placements are design variants. The first implementation should choose one default for build stability, likely right docked, then require human review on real J Shoot data before finalizing placement.

## Testing Decisions

- Pure helper tests should cover building drawer rows from selected image and FAISS data: selected image excluded, rank order preserved, loaded neighbor data preferred over embedded fallback, and missing image IDs reported.
- Projection tests should cover world-to-screen conversion, clamping, and offscreen hiding before a contextual trigger is implemented.
- Recenter tests should cover preserving zoom and centering on the neighbor's fitted coordinates, including an obscured viewport area when applicable.
- State tests should cover `n`, `Escape`, and `f` interactions, including focus gating inside controls.
- Component tests should cover closed and open panel states, sticky anchor rendering, no duplicated selected image, loading state, error state, and empty/missing-neighbor state.
- Interaction tests should cover clicking a neighbor, keeping the panel open, updating selection, resetting grid scroll, refreshing FAISS rows, and ignoring stale responses.
- Real-data browser QA should use the J Shoot latent-map run with 20 and 50 closest neighbors, panning and zooming while the panel is open, Focus Mode, and no browser console errors.

## Proposed Vertical Slices

These are proposed child issues. They should not be published until the breakdown is approved.

1. **Consolidate FAISS neighborhood drawer contract**
   - Type: HITL.
   - Blocked by: none.
   - Purpose: confirm closest-only first, non-modal panel behavior, right-vs-bottom review path, URL persistence deferral, filtered-neighbor behavior, and terminology.

2. **Add tested neighborhood row and navigation helpers**
   - Type: AFK.
   - Blocked by: slice 1.
   - Purpose: add pure helpers for anchor/neighbor rows, selected-image exclusion, rank ordering, missing IDs, and recenter view calculation before UI work.

3. **Add minimal non-modal closest-neighbor panel**
   - Type: AFK.
   - Blocked by: slice 2.
   - Purpose: open/close from `n`, close with `Escape`, show sticky selected anchor and closest-neighbor grid, preserve map pointer interaction, and keep scores out of the default surface.

4. **Add drawer neighbor navigation loop**
   - Type: AFK.
   - Blocked by: slice 3.
   - Purpose: clicking a neighbor selects it, recenters the map, refreshes FAISS rows safely, resets grid scroll, and keeps the panel open.

5. **Add selected-point contextual trigger overlay**
   - Type: AFK.
   - Blocked by: slice 3.
   - Purpose: add tested world-to-screen projection, clamp the trigger in the canvas, hide it when offscreen or inappropriate, and open the panel from the selected point.

6. **Add drawer thumbnail sizing modes**
   - Type: AFK.
   - Blocked by: slice 3.
   - Purpose: add `S`, `M`, `L`, and `XL` panel sizing independent of map thumbnail size. Add `Fit` only if bounded sizing is straightforward; otherwise split `Fit` into a later issue.

7. **Review and finalize placement on real data**
   - Type: HITL followed by AFK hardening.
   - Blocked by: slices 3 and 6.
   - Purpose: compare right and bottom placement on the J Shoot run, choose the default, then harden QA and remove temporary testing affordances.

## Out Of Scope

- Cluster-member drawers.
- Orbit, spiral, strip, or representative-grid layouts.
- Graph community, hierarchy, or cluster diagnostics work.
- Permanent rank or score labels on every tile.
- Browser-side FAISS computation.
- UMAP-distance neighbors.
- Changing map thumbnail scale for selected or neighbor images.
- Replacing the existing selected/neighbor canvas focus behavior.
- Hosted Project Viewer Export support beyond preserving the artifact-data boundary.
- Full opposite/both drawer support in the first implementation.
- Persistent drawer URL state in the first implementation.

## Further Notes

Issue #224 should be treated as the parent tracker for this PRD, not as a single ready-for-agent implementation issue. The existing single-issue scope is too broad because it bundles helper contracts, docked panel behavior, keyboard state, async FAISS loading, neighbor navigation, projection, sizing, placement review, and real-data QA.

The most important correction from critique is that the drawer must be a non-modal inspection surface. If opening it prevents map clicks, it fails the product goal.
