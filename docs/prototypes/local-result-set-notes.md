# Local Result Set Prototype Notes

## Question

Can Anacronia prototype local result search, Object/Image projection, counters, detail anchors, and future selection as one **Local Result Set Module** instead of separate page-level behaviors?

## Prototype Route

- Route: `/prototype/local-result-set`
- Variants:
  - `variant=A`: search-first workspace with detail and state rails.
  - `variant=B`: contract rail beside the result grid.
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

- The Normal / No Material / Failure controls are prototype-only state forcing controls. Keep them out of the product-facing result bar and place them in a clearly marked prototype/debug rail.
- The four metric cards were too heavy for the product surface. Counts now live inside the Object/Image view controls, so the grid area can stay focused on results, empty state, or failure state.
- Provider controls now expose facet counts for the active Object/Image projection. These counts respect scope and query, but are computed before the current Provider filter so Met and V&A show what each click would reveal.
- Result tiles now reuse the production image grid classes, thumbnail component, 4:5 aspect-ratio tile, provider badge, overlay, and Object carousel indicator instead of bespoke prototype cards. The prototype layout keeps those grid items self-sized so the side rail does not stretch them into tall columns.
- Search now uses an empty visible input with only the lens icon and Search action. The accessible label stays on the input, and the control submits through a form so Enter and the Search button run the same query commit.
- Detailed total/shown diagnostics still belong in the state rail or notes, not in the primary user workflow.

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

- Keep `collection_filter` separate from `q`.
- Treat Object/Image view as a projection of the same result set, not as separate data flows.
- Treat selection as identity-based over the active projection and query.
- A Provider Search inserting new results should not silently add those new identities to an existing selection.
- Counts need explicit language:
  - total Objects and Images in the active scope
  - shown Objects and Images after query/facet
  - selected visible vs selected total when selection can span hidden results
- Product UI should prefer compact counts on controls over a separate metric row.
