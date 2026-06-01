# Detail Overlay Shell Assessment

## Status

Assessment only. Do not migrate the detail overlays as part of routine UI cleanup.

## Current Shell

Anacronia currently uses custom route-addressable detail overlays in:

- `web/src/components/collection-object-detail-overlay.tsx`
- `web/src/components/image-asset-detail-overlay.tsx`
- `web/src/components/object-detail-pending-link.tsx`

The shell is not just visual chrome. It owns:

- URL-backed open/close state
- route push on close
- return focus to the originating grid tile
- Escape close
- focus trapping inside the overlay
- Object carousel keyboard behavior
- Object/Image up/down navigation
- pending preview overlays before detail data finishes loading

## Would shadcn Help?

Yes, but only for the shell responsibilities that are generic modal behavior:

- accessible dialog structure
- focus trapping
- Escape handling
- overlay/backdrop layering
- consistent title semantics
- less repeated manual `role="dialog"` code

The domain content should stay custom:

- image stage
- Object carousel
- provider/source links
- metadata cards
- match/disclosure content
- rights and skipped image notes
- route-aware adjacent Object/Image navigation

## Best Primitive

`Dialog` is the best first candidate because the current detail surface behaves like a large modal, not a side panel.

`Sheet` may be useful later if the product wants an inspector-style detail pane, but that would be a UX change, not a cleanup.

`Drawer` is not a good primary fit for the desktop detail overlay. It could be considered for a separate mobile treatment after the desktop behavior is stable.

## Recommended Migration Path

1. Create a shared `RouteDetailDialogShell` wrapper around shadcn `Dialog`.
2. Preserve the current URL contract: opening detail still comes from `object` or `image` URL state, and closing still returns to the grid URL.
3. Preserve return focus to the originating tile.
4. Move only the shell first; keep Object/Image domain content untouched.
5. Migrate one resolved overlay first, preferably Image Asset detail because it is smaller than Object detail.
6. Keep pending overlays custom until the resolved shell migration proves stable, or create a separate `PendingDetailDialogShell` afterward.
7. Verify with browser checks for close behavior, Escape, focus return, arrow keys, and no console errors.

## Recommendation

Migrate toward shadcn `Dialog`, but not as opportunistic cleanup. Treat it as a focused shell migration with tests and browser verification.

The immediate UI-alignment win is documentation plus smaller shadcn substitutions such as the match disclosure. Full overlay migration has real regression risk and should be its own issue or goal run.
