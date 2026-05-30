# UX Contract: Start New Collection

## Status

Approved for PRD and issue reconciliation.

## Source Evidence

- Domain docs: `CONTEXT.md`
- PRD/spec: `docs/prd/anacronia-mvp-prd.md`
- Issues: GitHub issues #3, #4, #7, #8, #9, #10, #15, #26, #27
- Existing UI/prototype: `web/src/app/page.tsx`, `docs/ux/` mockups and notes
- Constraints: local-first MVP, one active search job at a time, shadcn/ui Rhea visual system, Met-only provider in MVP

## Contract Changes From Current Docs

- User-facing vocabulary is `Collection`, not `Search Set`.
- `Provider Source` is the product term for a provider lane inside a Collection.
- After `Start search`, the Collection definition is locked for MVP: no title edits, no term edits, no term deactivation, no adding terms.
- User-facing batch size means target usable downloaded results, not provider candidates processed.
- The grid is object-first for this workflow: one tile per Museum Object, with a carousel indicator when multiple images exist.
- Header counters track downloaded local material: Objects and Images.
- `max images per object` is hidden from the UI and defaults to 3.

## Workflow Boundary

- User goal: create a named Collection from explicit terms and begin searching Met for usable local image material.
- Entry point: sidebar action `New Collection`.
- Success outcome: a saved, locked Collection exists and displays imported objects/images as they arrive.
- Out of scope: editing Collection title, editing or adding terms after start, term deactivation, local result search, deletion, adding future providers, provider-specific structured filters.

## Domain Language

- Use: `Collection`, `Provider Source`, `Provider`, `Met`, `Start search`, `Stop search`, `Resume search`, `Keep searching`, `No more results`, `Objects`, `Images`.
- Avoid in primary UI: `Search Set`, `Provider Collection`, `Run`, `Candidate`, `Candidate offset`, `Candidate limit`, `Collect`, `Import`, `Match` in buttons.
- Internal terms can remain in code/API where needed until a safe implementation rename exists.

## New Collection Form

The main panel shows only the compact form before search starts. No empty results grid appears below it.

Fields and controls:

| Control | Behavior |
| --- | --- |
| Collection title | Required, user-entered, no auto-generated title. |
| Terms textarea | Required; at least one valid term after parsing. |
| Provider | MVP shows `Met` as selected. It is not switchable because no alternative provider exists. |
| Batch dropdown | Values `5`, `10`, `20`, `30`, `100`, `500`, `1000`; default `100`. |
| Primary action | `Start search`. |

Validation:

- `Start search` is disabled when title is empty.
- `Start search` is disabled when terms contain no valid term.
- No inline validation message is needed for title/terms.
- A single-letter term is allowed.
- Terms split by commas and new lines.
- Multi-word terms are preserved.
- Terms are trimmed and deduplicated case-insensitively.
- Trimming, normalization, and deduplication are silent.

Unsaved state:

- No draft Collection is saved before `Start search`.
- Navigating away discards the form.
- Browser-level unsaved-changes warning appears only when title or terms contain content.
- Changing only provider or batch size does not trigger the warning.

## Search Definition Lock

When the user clicks `Start search`:

- The Collection is created and saved.
- The title, terms, and initial Provider Source are locked for MVP.
- The pre-search form collapses into the Collection header.
- Future MVP actions operate on the locked Collection definition.

Future non-MVP:

- Adding another provider to the locked Collection should be possible later.
- Only one provider lane is active at a time.
- Each Provider Source has independent pagination/progress starting from zero.

## Header After Start

The compact Collection header includes:

- Collection title.
- Locked term chips, purely informational in MVP.
- Selected provider text, currently `Met`.
- Always-visible counters: `Objects N` and `Images N`.
- State/action area.

Counters:

- Count only successfully downloaded and locally archived material.
- `Objects` counts Museum Objects with at least one successful image.
- `Images` counts validated downloaded Image Assets.
- Counts are Collection totals and remain visible in every state.
- Counts increase across `Keep searching`; they do not reset per batch.

## State Model

| State | Meaning | Main action |
| --- | --- | --- |
| New form | Unsaved form before first search. | `Start search` + batch dropdown |
| Searching | Search is running for the selected Provider Source. | `Stop search` |
| Stopping | User requested stop; current object is finishing safely. | disabled `Stopping` with spinner |
| Stopped | User stopped the search after a safe object checkpoint; the search is parked and does not block other work. | `Resume search` + batch dropdown |
| Paused/error | System paused because of provider/network/disk/repeated failure; the search is parked and does not block other work. | `Resume search` + batch dropdown + warning icon |
| Completed with more possible | Selected batch target was reached and provider may still have more. | `Keep searching` + batch dropdown |
| Provider exhausted | Provider has no more records to scan for this locked Collection. | plain status text `No more results` |
| Blocked by active search | Another Collection search is currently searching or stopping. | no launch action |

Rules:

- `New Collection` is disabled only while another Collection is searching or stopping.
- A stopped or paused/error search is a parked resumable job and does not hold the global search lock.
- A parked search can be resumed only when no other Collection is searching or stopping.
- Batch dropdown is visible only beside launch actions: `Start search`, `Resume search`, `Keep searching`.
- Batch dropdown is hidden while searching, stopping, exhausted, or blocked.
- Batch dropdown retains the last selected value.
- `Stop search` is a normal state transition, not an error or terminal cancellation.
- `Stop search` finishes the current Museum Object safely before stopping.
- Partial/corrupt images never appear as found.
- If one image fails but another image for the same object succeeds, the object appears.
- If provider/network fails after `Start search` but before any image is found, the Collection remains saved and appears in the sidebar as paused/error.

## Running Feedback

While searching:

- Header shows spinner plus stable counters, e.g. `Objects 0`, `Images 0`, then increasing values.
- No percentage progress.
- No candidate count.
- No secondary line such as `Scanning Met records`.
- New objects appear in the grid immediately as they are downloaded, newest first.
- New objects auto-insert at the top immediately.

Future non-MVP:

- Consider a per-object or per-image phase indicator for slow processing: fetching record, downloading image, generating derivatives, saving image.
- Do not attempt global percentage unless the worker can report reliable progress.

## Results Grid

- Grid order is permanently newest-first by download/import order.
- `Keep searching` adds new objects above existing objects.
- Grid tile represents one Museum Object, not one Image Asset.
- The tile uses the first/cover image.
- If an object has multiple downloaded images, show a small carousel indicator at the top-right of the tile.
- Use a small two-panel carousel indicator icon.
- Provider and object title are hidden by default and revealed on hover.
- Hover copy shows only provider plus object title, if available.
- Exact image count for the object appears in the detail panel, not on the grid tile.

## Detail Overlay

- Selecting a grid tile opens a right-side overlay over the full main content area.
- The background grid is dimmed.
- The overlay can close via top-right `X` or clicking outside the overlay.
- `Esc` closes the overlay.
- Keyboard focus stays inside the overlay while open.
- Closing the overlay returns focus to the thumbnail that opened it.
- New grid updates must not steal focus from the open overlay.

Image and carousel:

- The image is first in the overlay.
- The overlay opens on the first/cover image.
- The image uses the full overlay width.
- Sibling images use Instagram-like carousel navigation:
  - previous/next arrows at mid-height over the main image
  - bottom-centered dots indicating current image position
  - left/right arrow keys move through carousel images

Metadata:

- Title, provider link, rights, match/source information, skipped-image information, and provider metadata sit below the image in the same scrolling panel.
- No fixed side metadata column.
- Typography hierarchy is deferred.

## Sidebar Collection Card

Each Collection card shows:

- Collection title.
- Locked terms in small text.
- Image counter only.

The image counter counts only successfully downloaded and archived local images. In future multi-provider Collections, the sidebar image counter totals local images across all providers.

## Provider Exhaustion

When the selected Provider Source has no more records to scan, show plain status text:

`No more results`

Do not show it as a disabled button.

## Error and Pause Details

- Pause/error reason is hidden behind a small monochrome triangle-exclamation icon.
- The icon appears only for pause/error states.
- Clicking the icon opens an in-place popover with details.
- User-stopped search does not show this warning icon.
- Error copy should say provider/network/system language, not `match`.

## Deferred Work

- Delete Collection workflow, including interface removal and disk cleanup.
- Add another Provider Source to an existing locked Collection.
- Local search within results.
- Term editing, title editing, adding terms, and term deactivation.
- Advanced provider filters.
- User-facing technical run details.
- Per-image or per-object progress micro-indicator.

## Requirement Coverage Notes

- The PRD and affected issues should treat adding terms, deactivating terms, user-facing candidate limits, and image-first Collection grids as superseded by this contract.
- Issue #27 already tracks Collection vocabulary and the 3-image cap.
- Issues #3, #4, #8, #9, #10, #11, and #15 were reconciled from this contract on 2026-05-30.

## Acceptance Checks

- Clicking `New Collection` opens only the compact form.
- Empty title or empty valid terms disables `Start search`.
- Starting search creates and locks the Collection.
- Running search shows spinner plus `Objects` and `Images` counters.
- `Stop search` becomes disabled `Stopping` until the current object completes.
- Stopped/paused search offers `Resume search`.
- Completed batch offers `Keep searching`.
- Exhausted provider shows plain `No more results`.
- Grid uses newest-first object tiles with hover provider/title and carousel indicator for multi-image objects.
- Detail overlay follows the full-width image-first carousel design and keeps keyboard focus.
