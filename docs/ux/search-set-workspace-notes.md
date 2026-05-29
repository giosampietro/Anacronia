# Search Set Workspace UX Notes

Use this with `docs/ux/search-set-workspace-mockup.html`.

## Core Rules

- The left sidebar selection defines the scope of the main panel.
- Selecting `User Library` searches all collected Image Assets.
- Selecting a Search Set searches only that Search Set.
- Search term chips under the title are shortcuts: clicking `snake` fills/runs the main search with `snake`.
- Provider pills are visibility toggles for the results grid, not collection status explanations.
- Runtime/status information should stay collapsed unless there is a problem.

## Main Search Set View

- Header: Search Set title, term shortcut chips, optional contextual actions.
- Main search field sits directly under the term chips.
- Provider row sits under search as compact pills: `Met (248)`, `V&A (96)`, `Europeana (41)`.
- Results grid is the main content. Avoid a persistent right column in this view.
- The results grid is image-first: one tile is one Image Asset, not one Museum Object.
- Sibling Image Assets from the same Museum Object appear as separate grid tiles.
- Clicking a thumbnail opens the image detail overlay over the main content area.
- In the empty state, keep one primary action only: `Collect from Met`.
- Do not show a `Met collect` card or persistent `Provider focus` card beside results.
- Term chips in the Search Set header are search shortcuts. Do not place deactivate/remove icons beside them in the browsing surface.

## Labels

- Prefer `Collect from Met` over `Run Met collection`.
- Avoid exposing `Provider Collection` in primary UI copy unless needed for diagnostics.
- Use `Why Included` in the detail overlay instead of raw match labels.
- Example detail wording: `Why Included: snake found in title`, plus a `verified` chip.
- Provider status before collection should be compact: `Met not collected yet`.
- Provider status after collection should become a compact visibility toggle: `Met (248)`.

## Empty State

When a Search Set has no collected Image Assets:

- Keep the same Search Set header, term chips, and search placement.
- Show a compact provider row or a clear primary action, not duplicate run buttons.
- Empty copy should say what the user can do next: `Collect from Met to create the first provider source for this Search Set.`

## Image Detail Overlay

- Opens over the main content area, leaving the sidebar visible.
- Top band includes title, provider object link, `Why Included`, and descriptors.
- The `standard-1024` image carousel uses the full overlay width.
- If the selected Image Asset belongs to a Museum Object with sibling Image Assets, the carousel includes those sibling images in object context.
- The overlay should show whether the current image is the primary image or an additional/sibling image.
- Provider metadata is below the image in smaller text.
