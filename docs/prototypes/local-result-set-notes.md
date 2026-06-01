# Local Result Set Prototype Notes

## Question

Can Anacronia prototype local result search, Object/Image projection, counters, detail anchors, and future selection as one **Local Result Set Module** instead of separate page-level behaviors?

## Prototype Route

- Route: `/prototype/local-result-set`
- State parameters:
  - `scope`: `collection` or `library`
  - `search_set`: active Collection slug when `scope=collection`
  - `collection_filter`: sidebar Collection navigation filter
  - `q`: local result search query
  - `provider`: `all`, `met`, or `vam`
  - `view`: `objects` or `images`
  - `scenario`: `normal`, `empty`, or `error`
  - `detail`: selected result identity

## Iteration Notes

- The Normal / No Material / Failure states remain URL-addressable fixtures. Keep them out of the product-facing result bar and out of the primary grid canvas.
- The four metric cards were too heavy for the product surface. Counts now live inside the Object/Image view controls, so the grid area can stay focused on results, empty state, or failure state.
- Provider controls now expose facet counts for the active Object/Image projection. These counts respect scope and query, but are computed before the current Provider filter so Met and V&A show what each click would reveal.
- Result tiles now reuse the production image grid classes, thumbnail component, 4:5 aspect-ratio tile, provider badge, overlay, and Object carousel indicator instead of bespoke prototype cards. The prototype layout keeps those grid items self-sized so the side rail does not stretch them into tall columns.
- Search now uses an empty visible input with only the lens icon and Search action. The accessible label stays on the input, and the control submits through a form so Enter and the Search button run the same query commit.
- Selection mode now follows the Apple Photos pattern: the default surface shows only `Select`; selection mode shows thumbnail checkboxes plus `Select all`, which flips to `Deselect all` when the visible set is fully selected.
- Selection mode action icons now appear only after `Select`: export and trash are disabled with no selection, then enable after at least one thumbnail is selected. The export action opens a prototype options overlay; trash opens a prototype confirmation overlay.
- Selection mode uses normal click for individual thumbnail toggles and Shift-click for desktop range selection across the current visible grid order. Command-click and Control-click are intentionally out of scope because normal click already provides individual multi-select once selection mode is active.
- Delete scope is unresolved by design: the product decision is whether removal is collection-scoped or global across all collections and the user library. The prototype keeps this question visible and performs no mutation.
- Prototype fixture thumbnails are now plain color swatches. Titles and object metadata come from the production hover overlay rather than from drawn placeholder content.
- The visible prototype canvas no longer carries detail, state, or prototype-control rails. Clicking a result outside selection mode uses the production pending detail-link behavior; state diagnostics belong in these notes or direct URL parameters, not in the primary user workflow.

## Architectural Recommendation

The production follow-up should deepen a **Local Result Set Module** with a small **Interface** and a larger **Implementation** behind it.

The **Interface** should own:

- scope: Collection or User Library
- query state: `q`
- sidebar Collection navigation state: `collection_filter`
- Provider facet
- Object/Image projection
- total counts and shown counts
- pagination
- Museum Object and Image Asset identity
- detail anchors
- selection state vocabulary

The **Seam** should sit above the storage/query layer and below grids, headers, detail navigation, and future curation actions.

Two **Adapters** justify the **Seam**:

- production Adapter: local SQLite query over canonical fields and Descriptors
- prototype/test Adapter: fixture-backed result sets with the same identity and state model

This gives **Depth** because grids, counters, detail links, and selection all get **Leverage** from one **Interface**. It gives **Locality** because query, projection, pagination, and selection semantics stop leaking across page code, URL helpers, and grid Modules.

## Issue Placement

- #11 should become the parent behavior contract for local result search and Local Result Set semantics. It should no longer read only as a deferral.
- #66 should consume the Local Result Set contract for the User Library search-first page hierarchy.
- #44 should consume Local Result Set identity and selection semantics for curation and deletion. It should not define `Select all` in isolation.
- #40 should consume Local Result Set total/shown count language so counters stop repeating or disagreeing.

## What Not To Implement Yet

- Do not implement destructive deletion or exclusion.
- Do not make `Select all` a delete/export-only behavior.
- Do not keep using `filter` for both sidebar Collection filtering and local result search.
- Do not make the prototype route a production route.
- Do not search arbitrary raw provider JSON; production search should use canonical fields and Descriptors.

## Prototype Verdict To Carry Forward

- The Search + Select pattern is frozen for production handoff. Continue from `docs/ux/local-result-set-contract.md`; do not keep expanding this prototype before implementation planning.
- Keep `collection_filter` separate from `q`.
- Treat Object/Image view as a projection of the same result set, not as separate data flows.
- Treat selection as identity-based over the active projection and query.
- A Provider Search inserting new results should not silently add those new identities to an existing selection.
- Counts need explicit language:
  - total Objects and Images in the active scope
  - shown Objects and Images after query/facet
  - selected visible vs selected total when selection can span hidden results
- Product UI should prefer compact counts on controls over a separate metric row.
