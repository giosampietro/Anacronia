# Next Prototype Brief: Local Result Set Editing Actions

## Status

Superseded for action vocabulary by `docs/ux/curation-actions-contract.md`.

Keep this brief as historical context for why the curation contract exists. New prototype work should use the curation contract as the source of truth.

## Purpose

The Search + Select prototype is frozen. The next disposable prototype should answer what the enabled export and delete/trash actions actually mean before production implements mutation or export behavior.

## Questions To Resolve

1. Delete, remove, or exclude wording:
   - Is the primary user-facing action destructive deletion, Collection removal, or global exclusion?
   - Should the trash icon remain correct, or does the action need a different metaphor once semantics are clearer?

2. Object-level action vs Image-level action:
   - In Object view, does acting on a Museum Object affect the Object membership, all of its Image Assets, or open a choice?
   - In Image view, does acting on an Image Asset leave its sibling Image Assets untouched?

3. Collection-scoped removal vs global User Library exclusion:
   - From a Collection, should the action remove selected material only from that Collection?
   - From User Library, should the action globally exclude or delete selected Image Assets?
   - If an identity belongs to multiple Collections, what copy explains what remains visible elsewhere?

4. Shared Image Asset behavior:
   - If one Image Asset appears in multiple Collections, does Collection removal keep the local file and membership elsewhere?
   - If an Image Asset is globally excluded, does it disappear from every Collection and future exports?

5. Confirmation copy:
   - Define exact title, body, warning, and confirmation button text for one image, many images, one object, and many objects.
   - Decide whether confirmation copy should name the current Collection and mention shared usage.

6. Export selected:
   - Does export selected create a JSONL manifest, CSV, image package, or a menu of formats?
   - Does Object view export one row per Object or one row per Image Asset linked to selected Objects?
   - Should export selected include hidden selected identities when selected total is greater than selected visible?

## Prototype Constraints

- Keep it disposable.
- Reuse the frozen Local Result Set control bar and selection behavior.
- Do not implement real deletion, exclusion, or export.
- Use local fixture state only to demonstrate copy, branching, disabled states, and confirmation flow.
- Include cases for shared material across multiple Collections.

## Recommended Prototype Routes

- Collection, Image view, selected Image Assets with shared membership.
- Collection, Object view, selected Museum Objects with multiple Image Assets.
- User Library, Image view, selected Image Assets from multiple Collections.
- Export selected from Object and Image view.

## Output Needed Before Production

- One approved action vocabulary.
- One approved scope rule for Collection vs User Library.
- One approved confirmation pattern.
- One approved export-selected behavior.
- A list of backend mutations/API contracts production will need.
