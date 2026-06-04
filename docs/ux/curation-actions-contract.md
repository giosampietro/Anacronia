# UX Contract: Curation Actions

## Status

Draft direction for production planning.

This contract resolves the main action vocabulary for selected local material. It should be updated before any production mutation work or disposable prototype changes.

## Source Evidence

- Domain docs: `CONTEXT.md`
- PRD/spec: `docs/prd/anacronia-mvp-prd.md`
- Existing UX contracts:
  - `docs/ux/local-result-set-contract.md`
  - `docs/ux/delete-collection-contract.md`
- Prototype brief: `docs/prototypes/local-result-set-editing-next-brief.md`
- Current UI code:
  - `web/src/components/local-result-selection-surface.tsx`
  - `web/src/components/collection-results-grid.tsx`
  - `web/src/components/user-library-workspace.tsx`

## Workflow Boundary

- User goal: curate selected Museum Objects and Image Assets from Collection views and User Library.
- Entry points:
  - Local Result Set selection toolbar.
  - Object/Image detail overlay.
  - Default grid tile Favorite bookmark.
- Success outcome: the user can favorite, export, remove from the current Collection, or delete selected material with clear scope.
- Out of scope:
  - Restore excluded material.
  - Visible `Excluded from this Collection` management.
  - Global "never import again" exclusion.
  - Mac Trash integration.
  - Backup/restore.
  - Per-tile delete.

## Domain Language

Use:

- `Favorite`
- `Export`
- `Remove from Collection`
- `Delete`
- `User Library`
- `No Collection`

Avoid in primary UI:

- `Delete from Anacronia`
- `Blacklist`
- `Tombstone`
- `Exclude`
- `Run`
- `Candidate`
- `Search Set`

Technical notes may call the durable skip state a Collection-scoped exclusion.

## Action Order

Selection toolbar order is fixed:

1. `Export`
2. `Remove from Collection`
3. `Delete`

`Remove from Collection` appears only in Collection scope. It is not shown in User Library.

Favorite is intentionally not a selection-toolbar action. In selection mode, tile Favorite state is hidden by selection controls, so a bulk Favorite action would ask the user to mutate curation state without seeing the relevant state.

## Icons

Use Lucide icons.

| Action | Icon | Toolbar label | Tooltip / aria-label |
| --- | --- | --- | --- |
| Export | `Download` | Icon-only | `Export selected` |
| Remove from Collection | `FolderMinus` | Icon-only | `Remove from this Collection` |
| Delete | `Trash2` | Icon-only | `Delete selected` |

Toolbar buttons are icon-only with tooltips and accessible labels. Dialog titles and body copy carry the full action meaning.

## Scope Matrix

| Scope | Selected identity | Export | Remove from Collection | Delete |
| --- | --- | --- | --- | --- |
| Collection | Museum Object | Export all selected object Image Assets | Remove object and its Image Assets from this Collection | Delete object and all its Image Assets from local data |
| Collection | Image Asset | Export selected Image Assets | Remove selected images from this Collection | Delete selected images from local data |
| User Library | Museum Object | Export all selected object Image Assets | Not available | Delete object and all its Image Assets from local data |
| User Library | Image Asset | Export selected Image Assets | Not available | Delete selected images from local data |

## Remove from Collection

Removing from a Collection is Collection-scoped and non-file-destructive.

Rules:

- It removes the selected identity from the current Collection only.
- It leaves the identity in User Library.
- It leaves other Collections untouched.
- It leaves DB rows and local files untouched.
- It prevents future Provider Searches for this Collection from downloading, importing, reactivating, or adding the same identity through this Collection again.
- It does not prevent another Collection from adding or keeping the same identity.

Object behavior:

- Removing a Museum Object removes that Museum Object and all its Image Assets from the current Collection.
- Object-level removal excludes the whole Museum Object from that Collection, including future/new Image Assets for that object.
- If the object remains in other Collections, those views are unchanged.
- If the object has no remaining Collections, it appears in User Library as `No Collection`.

Image behavior:

- Removing an Image Asset removes only that Image Asset from the current Collection.
- Sibling Image Assets remain in the current Collection unless selected or covered by an object-level removal.
- If at least one sibling Image Asset remains in the current Collection, the Museum Object remains visible in Object view with the Collection-scoped image count.
- If the removed Image Asset was the last remaining Image Asset for that Museum Object in the Collection, Anacronia also creates an object-level Collection Exclusion.
- If the removed Image Asset has no remaining Collections, it appears in User Library as `No Collection`.

Confirmation:

- Required.
- Object view title includes object and affected image counts, for example `Remove 2 objects and 7 images from this Collection?`
- Image view title uses image count, for example `Remove 4 images from this Collection?`
- Body must say:
  - the material stays in User Library
  - other Collections keep it
  - future searches in this Collection will not download, import, reactivate, or add it again through this Collection
- Body should include a short shared-material summary when applicable, for example `Shared material stays in 3 other Collections.`
- Confirm button: `Remove from Collection`
- If membership removal succeeds but Collection Exclusion writing fails, the whole action fails and rolls back.

## Delete

Deleting is global local deletion.

Rules:

- It removes selected material from User Library.
- It removes selected material from all Collections.
- It removes DB rows and local files where no remaining active material needs them.
- It does not delete exports.
- It does not create a global "never import again" rule.
- A future Provider Search may import the same Object/Image again.
- Delete keeps Run history and matches as audit history, but active views ignore deleted material.
- Delete leaves Collection Exclusions intact so prior per-Collection removal intent still applies after later re-import.

Object behavior:

- Deleting a Museum Object deletes the object and all its Image Assets from local data.
- If any included Object or Image is favorited, confirmation warns once with favorite counts.

Image behavior:

- Deleting an Image Asset deletes only that image.
- Sibling Image Assets remain if not selected.
- If a Museum Object has no remaining Image Assets after deletion, it is removed from active local results.
- If siblings remain, the Museum Object remains active in User Library and Collections where sibling Image Assets still belong.
- Single Image Asset deletion keeps object raw provider metadata, Descriptors, and skipped image references while the object remains active.

Confirmation:

- Required.
- Object view title includes object and affected image counts, for example `Delete 2 objects and 7 images?`
- Image view title uses image count, for example `Delete 4 images?`
- Body must say:
  - the material leaves User Library and all Collections
  - local files are deleted
  - exports are not deleted
  - future searches may import the same material again
- Body must warn prominently when selected material is shared with other Collections.
- For orphan material, simple body copy is enough: `Local files will be deleted.`
- Confirm button: `Delete`
- If file deletion partially fails, the action fails and remains retryable.
- Deleted inactive rows are hidden from User Library and have no restore UI in the first curation implementation.
- If deleted material is imported again later, Anacronia reactivates/updates the old inactive provider-identity row rather than creating a duplicate row.

## Favorite

Favorites are global.

Rules:

- Favorite state belongs to the Museum Object or Image Asset, not to a Collection.
- A favorite appears as favorited anywhere the same identity is visible.
- Favorite can be filtered in User Library.
- Favorite can be filtered inside Collection views.
- Collection favorite filters show favorited material within that Collection only.
- Favoriting does not change Collection membership.
- Favoriting does not block deletion.
- Favorite state survives Collection removal and orphaning.
- Delete can remove favorited material after confirmation.
- Delete removes matching favorite records.

Tile behavior:

- Default grid mode: show a bookmark action on tiles.
- Selection mode: hide tile bookmarks; selected material is not favorited from the toolbar.
- Detail overlay: show favorite action.
- Object view tile bookmarks favorite Museum Objects.
- Image view tile bookmarks favorite Image Assets.
- Museum Object favorites and Image Asset favorites are separate. An Object tile bookmark reflects object favorite state only.
- No tile delete action.

Filter/export behavior:

- A filled tile or detail heart toggles a single item off.
- No confirmation.
- To export favorited material, the user applies the `Favorites` filter, enters selection mode, selects the visible favorites, and exports.

## Export

Export keeps the current selected export behavior.

Rules:

- Use `Download` icon.
- Object selection exports Image Asset rows for the selected objects.
- Image selection exports selected Image Asset rows.
- Export includes currently selected visible identities only because selection clears when filters/search/view/scope change.
- Export does not mutate membership, favorites, or delete state.
- Export includes favorite state in metadata rows.
- Collection export reflects current Collection Membership and excludes material removed from that Collection.
- User Library export includes all active local material, including orphans.

## Orphans

Orphans are active local material with no Collection membership.

Rules:

- Orphan Museum Objects and orphan Image Assets appear in User Library.
- User-facing label: `No Collection`.
- User Library provides a visible `No Collection` filter.
- Orphans can be favorited, exported, selected, and deleted.
- Orphans cannot use `Remove from Collection` because they are not in a Collection.
- User Library Object view shows Museum Objects with active Image Assets even when all Image Assets are `No Collection`.
- User Library Object view image counts include all active Image Assets, including `No Collection` Image Assets.

## Disabled States

If a Provider Search is running or stopping:

- `Favorite` remains available from normal grid tiles, detail views, keyboard shortcuts, and Favorite filters outside selection mode.
- `Export` follows existing export availability rules.
- `Remove from Collection` is disabled.
- `Delete` is disabled.

Reason: membership/deletion should not race active ingestion.

Export is disabled while a Provider Search is running or stopping.

## Selection Behavior

- Selection clears when local search `q` changes.
- Selection clears when Provider filter changes.
- Selection clears when Object/Image view changes.
- Selection clears when Collection/User Library scope changes.
- Selection clears when active Collection changes.
- There is no hidden selected state after result-set controls change.
- `Select all` selects only currently visible loaded results.
- New Provider Search results are never auto-selected.

## UI Guardrails

To avoid repeated UI churn:

- Do not reopen action names unless the scope matrix changes.
- Do not reopen icons unless an icon collides with an existing control.
- Do not add text labels to the desktop toolbar unless tooltip/accessibility testing fails.
- Do not add per-tile delete.
- Do not show `Remove from Collection` in User Library.
- Do not add a global reimport-blocking checkbox to delete.
- Do not add a restore UI for excluded material in the first curation implementation.
- Desktop toolbar remains icon-only, including Delete.
- Desktop icon buttons require tooltips and accessible labels.
- Touch devices use accessible labels, menus, and confirmations; no custom long-press tooltip is required.
- On narrow/mobile toolbars, keep `Export` and `More` visible; put `Remove from Collection` and `Delete` inside `More`.
- Prototype only the four route cases:
  - Collection/Object
  - Collection/Image
  - User Library/Object
  - User Library/Image

## Detail Overlay Scope

- Object detail overlay actions apply to the Museum Object.
- Image detail overlay actions apply to the Image Asset.
- Object carousel current slide does not change action scope.
- Collection-scoped object detail shows only Image Assets in that Collection.
- User Library object detail shows all active Image Assets, including `No Collection` Image Assets.
- Collection detail still shows skipped provider image references while the Museum Object remains in the Collection.
- If all imported images are removed from the Collection, no Collection detail exists for that object.

## Counts

- Collection Object view image counts reflect current Collection Membership only.
- User Library Object view image counts reflect all active Image Assets.
- Collection and dashboard user-facing imported counts reflect active local material, not historical Run totals.

## Delete Collection Interaction

Deleting a Collection:

- Is available from the sidebar Collection row right-click context menu.
- Uses menu items `Rename`, disabled `Pin`, and `Delete`.
- Opens a `Delete Collection` confirmation after choosing `Delete`.
- Deletes the Collection, Provider Sources, Runs, matches, and Collection Exclusions for that Collection.
- Deletes non-favorite exclusive material.
- Preserves shared material in other Collections.
- Preserves favorited exclusive material in User Library as `No Collection`.
- Leaves exports untouched.

## Acceptance Checks

- Selection toolbar order is Export, Remove from Collection, Delete.
- Export uses the `Download` icon.
- Collection scope shows `Remove from Collection`.
- User Library scope does not show `Remove from Collection`.
- Default grid tiles show bookmark actions.
- Selection mode tiles hide bookmark actions and do not show a batch Favorite action.
- Detail overlay exposes Favorite and Delete.
- Detail overlay exposes Remove from Collection only in Collection scope.
- Remove from Collection keeps User Library and other Collection visibility.
- Remove from Collection prevents re-add to that Collection by future Provider Searches.
- Delete removes active local material globally but does not block future import.
- Favorite filters exist in User Library and Collection views.
- `No Collection` filter exists in User Library.
- Changing result-set controls clears selection.
- Collection detail and counts are membership-scoped.
- User Library detail and counts include all active local material.
