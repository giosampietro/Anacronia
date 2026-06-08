# Current Prototype Review

> Historical note: this review targeted the earlier Search Set / collect prototype. Current implementation planning uses `Collection`, `Provider Search`, explicit Provider selection, and the live contracts in `docs/ux/start-new-collection-contract.md`, `docs/ux/local-result-set-contract.md`, and `docs/ux/curation-actions-contract.md`.

Screenshot reviewed: selected empty Search Set named `Test`.

## What Works

- Left sidebar structure is good: app identity, `+ New Search Set`, `User Library`, Search Set filter, Search Set list, collapsed runtime area.
- Main title, term shortcuts, and scoped search are in the right place.
- `Collect from Met` is a better label than `Run Met collection`.
- The empty Results card is directionally correct.

## Required Changes

- Remove the persistent right column in the normal Search Set view.
- Remove the `Met collect` card. There should be one primary collect action, not a top-right button plus a side card.
- Remove `Provider focus` from the normal view. Provider-focused inspection can exist later as a secondary view, but it should not compete with the Search Set workspace.
- Remove the small minus icons beside the terms in the browsing header. Term chips here are search shortcuts; term deactivation belongs in a term-management or edit flow.
- Keep provider status compact, directly under search: `Met not collected yet` before collection, then `Met (248)` as a visibility toggle after collection.
- Keep runtime details collapsed unless there is an error or the user opens settings/status.

## Empty Search Set Target

Use `docs/ux/search-set-workspace-empty-final.html` as the target for an empty Search Set:

- title
- term shortcut chips
- scoped search
- compact provider status row
- single Results card
- no right column

## Collection Action

`Collect from Met` should open the collect/expansion workflow. That workflow must include:

- `Start at candidate`
- `Candidate limit`
- `Max images per object`

For a first collect, default to `Start at candidate: 0` and `Candidate limit: 1000`.

For continuing the same terms, propose the next candidate offset, for example `Start at candidate: 1000`.
