# UX Contract: Delete Collection

## Status

Draft for review.

## Source Evidence

- Domain docs: `CONTEXT.md`
- PRD/spec: `docs/prd/anacronia-mvp-prd.md`
- Existing UX contract: `docs/ux/start-new-collection-contract.md`
- Current storage model: provider/object-based raw records and image derivative paths, not Collection folders
- Constraint: Museum Objects and Image Assets may belong to more than one Collection without duplicating local files

## Workflow Boundary

- User goal: remove an unwanted Collection from Anacronia and delete local data that belongs only to that Collection.
- Entry point: sidebar Collection card menu.
- Success outcome: the Collection disappears from the UI and database; exclusive local material is permanently deleted from disk; shared material remains.
- Out of scope: macOS Trash integration, undo/restore, backup/restore, repairing manually deleted folders, deleting exports, deleting individual objects/images, deleting active searches.

## Domain Language

- Use: `Collection`, `User Library`, `Delete Collection`, `No undo`.
- Avoid in primary UI: `Search Set`, `Run`, `Candidate`, `foreign key`, `reference count`, `Provider Collection`.

## Entry Point

Deletion is available only from the sidebar Collection card.

- Each Collection card has a three-dots menu.
- The menu contains `Delete Collection`.
- Delete is not a primary workspace button.
- Delete is not hidden in app-wide settings.

If the Collection has a running or stopping search:

- `Delete Collection` is visible but disabled.
- No extra explanatory copy is required in the MVP menu.
- The user must resolve the active search before deleting.

Stopped and paused/error searches are parked resumable jobs, not active searches. They can be deleted after confirmation.

## Confirmation

Clicking `Delete Collection` opens a confirmation dialog.

Rules:

- No typed-title confirmation.
- User confirms by clicking `Delete Collection`.
- Dialog clearly states there is no undo.
- Dialog title includes the Collection title, for example `Delete "Snake Studies"?`.
- The destructive action names the object: `Delete Collection`.

Impact summary:

- If the Collection has downloaded material, show a concrete summary:
  - `This will remove 42 objects and 88 images from this Collection. Shared files used by other Collections will stay.`
- If the Collection has no downloaded images, use simpler copy:
  - `This Collection has no downloaded images. It will be removed permanently.`

## Deletion Behavior

Deleting a Collection permanently removes:

- the Collection record
- Collection terms
- Provider Sources belonging to the Collection
- Runs belonging to those Provider Sources
- matches and run-specific technical traces
- skipped references and failed-candidate records that belong only to those runs
- Collection membership links for Museum Objects and Image Assets
- local raw records, descriptors, image asset records, and image files only when no other Collection still uses them
- empty provider/object folders left behind by exclusive deleted files, where safe

Deleting a Collection never removes:

- exported files
- objects/images still used by another Collection
- shared raw records, descriptors, or image files needed by another Collection
- unrelated provider data

## Shared Material Rule

Material is shared when a Museum Object or Image Asset still belongs to another Collection through another Provider Source/run/membership record.

If material is shared:

- keep object metadata
- keep raw provider record
- keep descriptors
- keep image asset rows
- keep local derivative files
- keep skipped-image metadata that is still relevant to the shared object

If material is not shared:

- remove it completely from Anacronia
- leave no user-facing or database trace
- remove local files from disk permanently

## Progress and Failure

During deletion:

- show a blocking modal/progress state
- do not let the user continue browsing as if deletion is finished
- deletion is not user-interruptible in the MVP

If deletion succeeds:

- remove the Collection from the sidebar
- navigate to `User Library`
- if no Collections or images remain, `User Library` shows its empty state

If deletion fails:

- keep the Collection visible
- show an error such as `Could not delete Collection`
- do not pretend deletion succeeded
- backend deletion must be retry-safe

## Permanent Delete

Deletion is permanent in the MVP.

- No macOS Trash integration.
- No undo.
- No deleted-Collection history.
- No visible audit trail.

Rationale:

- Anacronia is a local web app plus backend/worker, not a packaged desktop app.
- Data may later live outside the project root or on external disks.
- Restoring from Trash would not restore database rows unless a full restore workflow exists.
- Permanent delete with clear confirmation is simpler and more honest for MVP.

## Future Work

- Repair/reconcile state if the user manually deletes data folders outside Anacronia.
- Optional backup/export-before-delete workflow.
- Individual object/image deletion or exclusion.
- Restore/undo model, if Anacronia later becomes a packaged desktop app.
- Clearer shared-material inspection for advanced users.

## Acceptance Checks

- A Collection can be deleted from its sidebar three-dots menu.
- A Collection with a searching/stopping search shows disabled `Delete Collection`.
- A stopped or paused/error Collection can be deleted after confirmation.
- Confirmation warns there is no undo.
- Confirmation shows the Collection title.
- Confirmation shows material counts or the zero-image message.
- Successful deletion removes the Collection and navigates to `User Library`.
- Exclusive files and records are permanently removed.
- Shared files and records remain visible in other Collections.
- Exports remain untouched.
- Failed deletion leaves the Collection visible and can be retried.
