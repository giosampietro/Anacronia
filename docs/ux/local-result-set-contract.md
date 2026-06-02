# UX Contract: Local Result Set Search and Selection

## Status

Draft for production handoff from PR #91. The Search + Select prototype is frozen as the source evidence for this contract. Do not expand the prototype further before implementation planning.

## Source Evidence

- Domain docs: `CONTEXT.md`, especially `Collection`, `Provider Source`, `Museum Object`, `Image Asset`, `Descriptor`, `Export`, and the Object/Image count invariants.
- PRD/spec: `docs/prd/anacronia-mvp-prd.md`, especially the MVP grid, detail overlay, Object/Image counts, Image Asset export, future exclusion/deletion, and shadcn/ui requirements.
- UX rules: `docs/ux/ui-rules.md`, especially no duplicate facts.
- Existing UI/code/prototype:
  - `web/src/app/prototype/local-result-set/local-result-set-prototype.tsx`
  - `web/src/app/prototype/local-result-set/page.tsx`
  - `docs/prototypes/local-result-set-notes.md`
  - `web/src/components/collection-results-grid.tsx`
  - `web/src/components/user-library-workspace.tsx`
  - `web/src/lib/image-grid-style.ts`
- Constraints:
  - User-facing language is `Collection`, not `Search Set`.
  - `search_set` remains a prototype/current-route URL key; production may rename it, but must preserve the state separation it represents.
  - Deletion/removal/exclusion semantics are unresolved and must not be implemented from this contract.

## Workflow Boundary

- User goal: search, narrow, inspect, and select already-collected local material inside a Collection or the User Library.
- Entry points:
  - Collection workspace, scoped to one Collection.
  - User Library, scoped across all locally collected Image Assets and their Museum Objects.
- Success outcome:
  - The user can search local results with `q`, keep sidebar Collection navigation filtering separate, switch Object/Image projection, filter by Provider, select visible results, use range selection, and open placeholder export/delete decision surfaces without mutating data.
- Out of scope:
  - Backend deletion, removal, or exclusion.
  - Real export execution.
  - Provider Search execution or provider ingestion.
  - Scenario/variant/debug controls from the prototype.
  - Advanced provider-specific structured filters such as department, date range, geography, artist, or medium.

## Domain Language

- Use: `Collection`, `User Library`, `Provider`, `Museum Object`, `Image Asset`, `Object`, `Image`, `Export`, `Delete` only inside placeholder/triage surfaces.
- Avoid in primary UI: `Search Set`, `Run`, `Candidate`, `fixture`, `scenario`, `variant`, `canonical field`, `raw provider JSON`.
- Ambiguous terms to resolve later:
  - `Delete`, `Remove`, and `Exclude` for individual curation actions.
  - Whether an Object-level action removes a Museum Object from a Collection, excludes all of its Image Assets globally, or opens an Image-level choice.

## Objects and Scope

- Primary object: Local Result Set, defined by scope, query, Provider facet, Object/Image projection, and pagination.
- Related objects:
  - Collection: the current research intent and local working dataset.
  - User Library: cross-Collection view over locally collected material.
  - Provider: source of Museum Objects and Image Assets.
  - Museum Object: object-level identity; one Object tile in Object view.
  - Image Asset: image-level identity; one Image tile in Image view.
- What the current view acts on:
  - Object view acts on Museum Object identities.
  - Image view acts on Image Asset identities.
  - Provider facet acts on the current Local Result Set projection.
  - Local search `q` acts on local canonical fields and Descriptors.
- What the current view does not act on:
  - Sidebar `collection_filter` does not search or filter grid results.
  - Provider facet does not change the Collection definition.
  - Selection does not automatically include new Provider Search results.

## URL State

| Key | Values | Default | Behavior |
| --- | --- | --- | --- |
| `scope` | `collection`, `library` | `collection` when a Collection is active | Defines whether the result set is one Collection or the User Library. Changing scope clears selection and closes detail/action dialogs. |
| `search_set` | Collection slug | Current Collection slug | Prototype/current-route key for the active Collection. User-facing UI must call this a Collection. Changing it clears selection and closes detail/action dialogs. |
| `collection_filter` | free text | empty | Filters the sidebar Collection list only. It must not affect result counts, grid contents, or selection. |
| `q` | free text | empty | Local result search. Submitting the search updates `q`, clears `detail`, and preserves selection state only for identities still in the same scope and view. |
| `view` | `objects`, `images` | current workspace default, prototype fallback `objects` | Switches between Museum Object and Image Asset projection. Changing view clears selection because the selected identity type changes. |
| `provider` | `all` or a Provider key | `all` | Filters the current projection by Provider. Changing provider clears `detail` and preserves selection state for hidden selected identities in the same scope/view. |
| `detail` | selected result identity | empty | Opens the production pending detail overlay. Selection mode tile clicks must not set `detail`. |

Prototype-only URL state:

- `scenario`: `normal`, `empty`, `error`
- `variant`: `A`, `B`

Production must not expose `scenario` or `variant`.

## Result Identity

Object view:

- One tile represents one Museum Object with at least one complete Image Asset.
- Selection identity is the Museum Object identity.
- Detail opens the Object detail overlay with carousel behavior when the Object has multiple Image Assets.
- Prototype identity shape: `object:{provider}:{objectId}`.
- Production identity should use the durable local Museum Object primary key, with provider/object identity retained for URL/debug readability where useful.

Image view:

- One tile represents one Image Asset.
- Selection identity is the Image Asset identity.
- Detail opens the Image Asset detail overlay.
- Prototype identity shape: `image:{imageAssetId}`.
- Production identity must follow the domain rule: Image Asset identity is based on Provider, Museum Object, and source image URL, or the durable local Image Asset primary key derived from that rule.

## Counts and Selection Language

Result counts:

- `Objects` means Museum Objects with at least one complete Image Asset in the active scope.
- `Images` means complete Image Assets with validated derivatives in the active scope.
- Object/Image controls show counts for the current scope and `q`.
- Provider controls show counts for the current scope, `q`, and Object/Image projection before applying the current Provider filter. This lets `Met 6` or `V&A 2` describe what clicking that Provider would reveal.

Selection counts:

- `selected visible`: selected identities currently visible under the active `q`, `provider`, `view`, and pagination.
- `selected total`: all selected identities in the current scope and view, including identities hidden by query, Provider facet, or pagination.
- Default compact copy:
  - If all selected identities are visible: `{n} selected`.
  - If hidden selected identities exist: `{visible} shown selected / {total} total selected`.
- Export/delete action enablement should use `selected total > 0`.
- Thumbnail checkmarks and selected borders represent `selected visible`.

## States

| State | Trigger | Visible content | Primary action | Secondary actions | Disabled/blocked conditions |
| --- | --- | --- | --- | --- | --- |
| Ready | Scope has results and no local search is pending | Search input, Object/Image controls with counts, Provider facets with counts, full-width grid | Open detail by clicking a tile | Switch view, switch provider, enter Select mode | Export/delete hidden until Select mode |
| Empty scope | Active scope has no local material | Empty state explaining no local material | Start or resume Provider Search from the surrounding workspace, not the Local Result Set | Switch scope or Collection | Selection unavailable |
| No matching results | `q` or Provider facet hides all results | Empty state naming the search/filter result | Clear or change search/facet | Switch view/provider | Selection unavailable |
| Selection mode, none selected | User clicks `Select` | Grid check controls on thumbnails, export/trash icon buttons disabled, `Select all`, `Cancel` | Select a thumbnail | Select all, cancel | Export/delete disabled |
| Selection mode, some selected | User selects at least one identity | Selected thumbnails show round check control and inset white border; actions enabled | Export or delete placeholder | Select all/deselect all, shift-click range, individual toggle, cancel | Real export/delete unavailable until future workflows |
| Export placeholder | User clicks enabled export icon | Dialog previewing future export choices | Close dialog | Review options text | No file export occurs |
| Delete placeholder | User clicks enabled trash icon | Confirmation-style dialog surfacing unresolved delete/remove/exclude scope | Close dialog | Review triage question | No deletion/removal/exclusion occurs |
| Detail overlay | User clicks a tile outside selection mode | Production pending Object/Image detail overlay | Close overlay | Navigate detail links where supported | Selection mode tile clicks must not open detail |
| Provider Search updates active scope | New local results arrive while user is in this workflow | Counts and grid update | Continue current task | Select new visible items if needed | New identities are not auto-selected |

## Inputs and Defaults

| Field | Required | Default | Validation | Notes |
| --- | --- | --- | --- | --- |
| Local search `q` | No | empty | Trim for matching; preserve typed text in URL | Searches local canonical fields and Descriptors. It is not Provider Search. |
| Sidebar `collection_filter` | No | empty | Trim for sidebar matching only | Filters Collection navigation, not results. |
| Object/Image view | Yes | workspace default | Must be `objects` or `images` | View defines identity type and action labels. |
| Provider facet | Yes | `all` | Must be an available Provider key | Provider list is data-driven in production. |
| Selection anchor | No | none | Must be a visible identity in current grid order | Used for Shift-click range selection. |

## Actions

| Action | Trigger | Result | Data dependency | User-facing label |
| --- | --- | --- | --- | --- |
| Submit local search | Enter in search input or Search button | Updates `q`, clears `detail`, recomputes counts/grid | Local query over canonical fields and Descriptors | `Search` |
| Filter sidebar Collections | Type in sidebar filter | Narrows Collection navigation only | Collection list | `Filter Collections` |
| Switch Object/Image projection | Click Object/Image control | Changes `view`, clears selection/detail, recomputes Provider counts | Local result set projection | `Objects`, `Images` |
| Switch Provider | Click Provider facet | Changes `provider`, clears detail, preserves same-view selected identities as selected total | Provider membership for result identities | `All Providers`, Provider display name |
| Open detail | Click tile outside selection mode | Opens Object or Image pending detail overlay | Result identity and preview data | Tile accessible label `Open {title}` |
| Enter selection mode | Click `Select` | Shows selection affordances and action icons | Visible result identities | `Select` |
| Toggle one item | Click tile/check control in selection mode | Selects or deselects one visible identity and updates anchor | Current visible identity | Tile accessible label `Select {title}` / `Deselect {title}` |
| Range select | Shift-click tile/check control in selection mode | Selects all visible identities between anchor and clicked identity, inclusive | Current visible grid order | Same tile label |
| Select all visible | Click `Select all` | Adds all currently visible identities to selection and updates selection count | Current visible grid order | `Select all` |
| Deselect all visible | Click `Deselect all` | Removes all currently visible identities from selection | Current visible grid order | `Deselect all` |
| Cancel selection | Click `Cancel` | Exits selection mode, clears selection and anchor | Selection state | `Cancel` |
| Open export placeholder | Click enabled export icon | Opens export decision placeholder dialog | Selected total identities | Icon-only button, accessible label `Export selected` |
| Open delete placeholder | Click enabled trash icon | Opens delete/remove/exclude decision placeholder dialog | Selected total identities | Icon-only button, accessible label `Delete selected` |

## Selection Behavior

- Selection mode is explicit. The default grid never shows selection check controls.
- Normal click in selection mode toggles one visible identity. Command-click and Control-click are not needed because normal click already provides individual multi-select.
- Shift-click selects a range in the current visible grid order after `q`, Provider, view, and pagination are applied. Both endpoints are included.
- If there is no anchor, Shift-click behaves like normal click and sets the anchor.
- If the anchor is no longer visible, Shift-click behaves like normal click and sets a new anchor.
- Query and Provider changes preserve selected identities in the same scope and view, but hidden selected identities must be visible in the compact selected-visible/selected-total language.
- View changes clear selection because Object and Image selections have different identity types and future action semantics.
- Scope or Collection changes clear selection.
- New Provider Search results arriving while selection mode is active are not automatically selected. Counts and grid update; new visible thumbnails show unchecked controls.

## Navigation and Layout

- The Local Result Set appears as the main workspace surface beside persistent Collection navigation.
- Search, Object/Image controls, and Provider facets live in one compact bar above the grid.
- Counts live inside the controls. Do not reintroduce separate metric cards for the same facts.
- The grid is full-width and production-style. Do not add debug rails, state cards, or detail anchor cards to the user-facing surface.
- Detail opens through the existing pending detail overlay pattern.
- Export/delete placeholders open as contextual dialogs.

## Data and Status Requirements

- Required data:
  - active scope and Collection identity
  - result identities and projection type
  - Provider identity and display name
  - thumbnail URL, title, provider label, collection labels where needed
  - Object/Image counts for scope/query/provider projection
  - detail preview data for Object and Image overlays
- Derived counts/status:
  - total Objects and Images in active scope
  - shown Objects and Images after `q` and Provider
  - Provider facet counts computed before current Provider filter
  - selected visible and selected total
- Provider/API dependencies:
  - Production should query local storage, not live provider APIs, for this workflow.
  - Search should use canonical fields and Descriptors, not arbitrary raw provider JSON.
- Persistence expectations:
  - URL persists scope, Collection, local query, view, Provider, and detail.
  - Selection is client UI state. Do not persist selection across reloads unless a future workflow explicitly needs it.

## Empty, Loading, Error, and Recovery Copy

- Empty scope: `No local material yet`
- No matching results: `No {objects/images} matched "{q}".`
- Failure: `Search failed`
- Recovery:
  - For no matching results, the user changes or clears `q` or Provider.
  - For failure, production should preserve the previous query state and offer retry when the storage/API layer can fail.

## Production Should Harvest

Keep these layout/patterns:

- Compact search + Object/Image + Provider control bar.
- Counts inside controls rather than duplicated metric cards.
- Full-width production grid.
- Default grid with no selection controls until `Select`.
- Apple Photos-style selection mode with check controls, `Select all`/`Deselect all`, `Cancel`, range selection, and action icons.
- Export/delete placeholder dialogs as product-triage surfaces, not real mutations.

Keep these state model decisions:

- Separate local result query `q` from sidebar `collection_filter`.
- Treat Object/Image as projections of one Local Result Set.
- Treat Provider as a facet over the active projection.
- Treat selection as identity-based, not index-based.
- Preserve query/provider state in URL.
- Keep selection client-side and scoped to current scope/view.

Keep these interaction details:

- Enter selection with `Select`.
- Normal click toggles visible selected state in selection mode.
- Shift-click range selects across the current visible grid order.
- Check controls are round; unselected state has no square icon inside.
- Selected thumbnails use an inset white border that does not change grid gutters.
- Export/trash icons are icon-only and disabled until selected total is greater than zero.
- Tile click outside selection mode opens the production pending detail overlay.

Reuse these production components/classes:

- `ImageGridThumbnail`
- `ObjectDetailPendingLink` for both Object and Image projection tiles
- `IMAGE_GRID_CLASS_NAME`
- `IMAGE_GRID_TILE_CLASS_NAME`
- `IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME`
- `IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME`
- `IMAGE_GRID_OVERLAY_CLASS_NAME`
- shadcn/ui `Button`, `Badge`, `Dialog`, `InputGroup`, and `AspectRatio`
- Lucide icon approach used by the prototype: `ArrowRightFromLine`, `Trash2`, `Check`, `Images`, `Search`

## Must Stay Prototype-Only

- Fixture data in `local-result-set-fixtures.ts`.
- Fake Provider availability beyond production-supported Providers.
- Plain color swatch thumbnails.
- `scenario` and `variant` URL controls.
- Visible or hidden debug/state rails.
- Client-only filtering as the production data source.
- Fake export/delete dialogs as final behavior.
- Any assumption that V&A is production-ready in the MVP.

## Requirement Coverage

| Requirement/story | UX decision | Covered? |
| --- | --- | --- |
| Search query `q` | Local result search has independent URL state and searches local canonical fields/Descriptors | Yes |
| Separate `collection_filter` | Sidebar Collection filter is navigation-only and does not affect grid results | Yes |
| Object/Image switch | Projection changes identity type; production clears selection on view change | Yes |
| Provider controls and counts | Counts are compact controls, computed before active Provider filter | Yes |
| Select mode and checkbox tile selection | Default hides selection; Select mode shows round controls | Yes |
| Select all / Deselect all | Acts on currently visible identities and flips based on visible selection completeness | Yes |
| Shift-click range selection | Selects inclusive visible range from anchor to clicked identity | Yes |
| Disabled/enabled export/delete | Disabled at zero selected total, enabled once selected total exists | Yes |
| Placeholder dialogs | Dialogs preview future export/delete decisions and perform no mutation | Yes |
| New Provider Search results | New identities are not auto-selected while selection mode is active | Yes |

## Open Decisions

- Exact production route parameter names. Prototype uses `search_set`; user-facing language should be `Collection`.
- Whether selected-visible/selected-total status appears always in selection mode or only when hidden selected identities exist.
- Delete/remove/exclude semantics. See `docs/prototypes/local-result-set-editing-next-brief.md`.
- Final export selected behavior. See `docs/prototypes/local-result-set-editing-next-brief.md`.

## Implementation Handoff

- Implement as a Local Result Set module used by Collection and User Library surfaces.
- Keep production data access behind a local query adapter over stored Museum Objects, Image Assets, Descriptors, Provider membership, and Collection membership.
- Do not copy the prototype fixture/filtering code into production.
- Start with the production grid components already used by Collection and User Library, then add the Local Result Set control bar and selection state around them.
- Acceptance checks:
  - `q` and `collection_filter` are independent.
  - Object/Image and Provider counts do not duplicate elsewhere.
  - selection mode matches the frozen prototype.
  - query/provider changes expose selected-visible vs selected-total accurately.
  - Provider Search updates never auto-select new identities.
  - export/delete dialogs do not mutate data until the editing/removal contract exists.
