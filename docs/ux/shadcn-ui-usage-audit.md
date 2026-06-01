# shadcn/ui Usage and Custom UI Audit

## Status

Audit produced from branch `codex/local-result-set-prototype`.

The user referred to "ChatCN"; this report treats that as `shadcn/ui`, which is the UI library configured in `web/components.json`.

## Scope

This audit covers every application UI surface under:

- `web/src/app`
- `web/src/components`
- shared grid styling in `web/src/lib/image-grid-style.ts`

It excludes generated shadcn component source under `web/src/components/ui` except when identifying which primitives are installed and imported by app code.

## Method

- Read the app shell, production page, production workspace components, detail overlays, prototype routes, and shared grid styling.
- Enumerated `@/components/ui/*` imports outside `web/src/components/ui`.
- Enumerated native/custom markers such as raw `button`, `a`, `form`, `details`, `summary`, explicit `role="dialog"`, `className`, and `cn(...)` usage.
- Compared the implementation against the repo's shadcn guidance: use shadcn primitives for generic UI, use app-specific components for domain behavior, and avoid inventing controls where a shadcn primitive already matches.

## UI System Baseline

`web/components.json` configures:

- style: `base-rhea`
- framework shape: React Server Components enabled, TypeScript enabled
- Tailwind: v4-style CSS entry at `web/src/app/globals.css`
- base color: `neutral`
- icon library: `lucide`
- alias: `@/components/ui`

Installed shadcn components:

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button`, `button-group`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `combobox`, `command`, `context-menu`, `dialog`, `direction`, `drawer`, `dropdown-menu`, `empty`, `field`, `hover-card`, `input`, `input-group`, `input-otp`, `item`, `kbd`, `label`, `menubar`, `native-select`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`.

Imported by app/prototype code:

`alert`, `aspect-ratio`, `badge`, `button`, `card`, `collapsible`, `dialog`, `empty`, `field`, `input`, `input-group`, `item`, `native-select`, `popover`, `radio-group`, `separator`, `sidebar`, `skeleton`, `spinner`, `switch`, `textarea`, `toggle-group`, `tooltip`.

Installed but currently unused in app/prototype code:

`accordion`, `alert-dialog`, `avatar`, `breadcrumb`, `button-group`, `calendar`, `carousel`, `chart`, `checkbox`, `combobox`, `command`, `context-menu`, `direction`, `drawer`, `dropdown-menu`, `hover-card`, `input-otp`, `kbd`, `label`, `menubar`, `navigation-menu`, `pagination`, `progress`, `resizable`, `scroll-area`, `select`, `sheet`, `slider`, `sonner`, `table`, `tabs`, `toggle`.

## Executive Summary

Anacronia does use shadcn/ui as the main generic UI foundation. The strongest shadcn-backed surfaces are the app shell/sidebar, cards, badges, fields, form controls, empty states, export format radio cards, runtime footer, Object/Image toggle, and prototype dialogs.

The main custom UI layer is not random styling drift. It is a domain layer for museum/image work:

- production image grids
- image/object tiles
- URL-addressable detail overlays
- pending detail overlays
- carousel-like object image viewing
- Collection navigation behavior
- Local Result Set selection behavior in the prototype

That custom layer should be named and protected as Anacronia product UI. It should not be replaced wholesale with shadcn components.

There are still clear drift points where custom markup duplicates available shadcn primitives:

- production detail overlays are hand-built `role="dialog"` surfaces instead of shadcn `Dialog`, `Sheet`, or `Drawer`
- future destructive confirmations should use `AlertDialog`, which is installed but unused
- New Collection provider source selection has been aligned to `ToggleGroup`; keep future provider option sets on that primitive
- object-detail match disclosure has been aligned to shadcn `Collapsible`
- `page.tsx` contains too much inline UI composition for provider/source/export layout and should keep shrinking into named components

## Surface Inventory

| Surface | Files | shadcn/ui used | Custom UI and patterns | Assessment |
| --- | --- | --- | --- | --- |
| Root layout and providers | `web/src/app/layout.tsx` | `TooltipProvider` | global font/theme classes | Good. Thin shadcn provider usage with minimal custom layout. |
| App shell, sidebar, header, runtime footer | `web/src/components/app-shell.tsx` | `Sidebar`, `Collapsible`, `Popover`, `Separator`, `Badge`, `Spinner`, `ToggleGroup` | custom brand header, runtime footer composition, URL-backed Object/Image links, sidebar width CSS vars | Strong shadcn usage. Custom pieces are mostly app composition, not competing controls. |
| Sidebar Collection filter | `web/src/components/sidebar-collection-filter.tsx` | `SidebarInput`, `SidebarMenu`, `SidebarMenuButton`, `Empty` | local client filter state, open Collection row behavior, manual count text | Good. This is a domain navigation component built from shadcn sidebar primitives. |
| Main server page/workspace coordinator | `web/src/app/page.tsx` | `Alert`, `Badge`, `Card` | large inline layout, server-action `form`/hidden `input`, route-state orchestration | Functionally valid, but too much UI policy still lives in the page. Provider Source controls now have a named component; export remains page-level while issue #99 is unresolved. |
| New Collection form | `web/src/components/new-collection-form.tsx` | `Card`, `Field`, `Input`, `Textarea`, `Button`, `Spinner`, `ToggleGroup` | step cards, step numbers | Good. Provider source choice now uses `ToggleGroup`. |
| Batch target select | `web/src/components/batch-target-control.tsx` | `Field`, `FieldGroup`, `NativeSelect` | none beyond app labels/options | Good shadcn-backed form control. |
| Collection export card and form | `web/src/app/page.tsx`, `web/src/components/collection-export-form.tsx` | `Card`, `Alert`, `Button`, `RadioGroup`, `Item`, `Spinner` | server-action form with hidden fields, expandable export form state | Good. The export options are one of the cleaner shadcn compositions. |
| Provider source panels/actions | `web/src/components/provider-source-controls.tsx`, `web/src/components/provider-search-action-button.tsx`, `web/src/components/provider-collection-progress.tsx` | `Card`, `Badge`, `Item`, `Button`, `Spinner` | status mapping, action availability rules, server-action forms | Good pattern. Provider Source card composition is now centralized outside the main page. |
| Production Collection results grid | `web/src/components/collection-results-grid.tsx` | `Card`, `Badge`, `Empty`, `AspectRatio` | `IMAGE_GRID_*` classes, `ImageGridThumbnail`, Object/Image detail pending links, provider badge/overlay/carousel indicator | Intentional domain UI. This should remain app-specific and be the source for future result grids. |
| User Library workspace | `web/src/components/user-library-workspace.tsx` | `AspectRatio`, `Badge`, `Empty` | same domain grid classes, collection label overlays, URL detail links | Intentional domain UI. Keep aligned with `CollectionResultsGrid`; avoid separate visual rules. |
| Shared image grid style | `web/src/lib/image-grid-style.ts`, `web/src/components/image-grid-thumbnail.tsx` | none directly | canonical grid/tile/image/overlay/badge class constants, raw `img` because FastAPI serves derivatives | Good. This is the right place for Anacronia's product-specific grid contract. |
| Object detail overlay | `web/src/components/collection-object-detail-overlay.tsx` | `Badge`, `Button`, `Card`, `Collapsible`, `Separator` | custom fixed overlay with `role="dialog"`, manual focus trap, keyboard handling, carousel controls, metadata cards | High-value custom domain surface, but accessibility and consistency should be reviewed against shadcn `Dialog`/`Sheet` before production expansion. |
| Image Asset detail overlay | `web/src/components/image-asset-detail-overlay.tsx` | `Badge`, `Button`, `Skeleton` | custom fixed overlay with `role="dialog"`, manual focus trap, keyboard navigation, staged image loading | Same as object overlay: domain behavior is valid, shell could migrate to shadcn overlay primitive or be explicitly documented as custom. |
| Pending detail overlays | `web/src/components/object-detail-pending-link.tsx`, `web/src/components/image-asset-detail-overlay.tsx` | `Badge`, `Button`, `Skeleton` | link-intercept pending overlays, custom `role="dialog"`, blurred preview image, manual Escape close | Intentional product pattern from issue #83. Shell is custom; keep only if pending-route behavior needs it. |
| Theme switch | `web/src/components/theme-switch.tsx` | `Switch` | sun/moon wrapper and localStorage theme state | Good. Custom wrapper is minor and expected. |
| Terms field | `web/src/components/terms-field.tsx` | `Field`, `Textarea` | live term parsing description | Good shadcn-backed form field. |
| Dashboard auto refresh | `web/src/components/dashboard-auto-refresh.tsx` | none | effect-only refresh component | No visible UI surface. No action. |
| Local Result Set prototype | `web/src/app/prototype/local-result-set/local-result-set-prototype.tsx` | `Alert`, `AspectRatio`, `Badge`, `Button`, `Dialog`, `Empty`, `InputGroup` | fixture-backed result model, URL state, custom sidebar rail, anchor buttons via `buttonVariants`, selection mode, range selection, placeholder dialogs | Correct for prototype. Harvest behavior and shared grid reuse; do not copy fixture filtering or custom route shell as production infrastructure. |
| Local Result Set prototype page | `web/src/app/prototype/local-result-set/page.tsx` | none | URL param parsing and prototype defaults | Prototype-only. |
| Sidebar prototype | `web/src/app/prototype/sidebar/sidebar-prototype.tsx` | `Sidebar`, `AspectRatio`, `Badge`, `Separator` | prototype variant switcher, fake links, compact Collection list variants, mock provider card | Prototype-only. Useful evidence, not production surface. |
| Sidebar prototype page | `web/src/app/prototype/sidebar/page.tsx` | none directly | route wiring and fixture loading | Prototype-only. |

## Custom Pattern Inventory

### Intentional Anacronia Domain UI

These custom patterns should be treated as product components, not as shadcn violations:

- Image grid layout: `IMAGE_GRID_CLASS_NAME` gives the production max-seven-column rule.
- Tile silhouette: `IMAGE_GRID_TILE_CLASS_NAME` defines the rounded bordered museum tile.
- Tile image behavior: `ImageGridThumbnail` uses raw `img` because local thumb derivatives are already prepared by FastAPI.
- Tile metadata overlay: `IMAGE_GRID_OVERLAY_CLASS_NAME` hides title/provider context until hover/focus.
- Object carousel indicator: `IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME` exposes multi-image object state.
- Provider badge treatment: `IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME`.
- URL-addressable Object/Image detail links.
- Pending detail overlay preview behavior.
- Object vs Image projection as a domain concept.
- Local Result Set selection model from the prototype.

These are not generic widgets. They encode Anacronia's domain model and should be centralized rather than replaced.

### Custom UI That Should Be Reassessed

These patterns duplicate or bypass shadcn primitives:

- Production detail overlay shell uses manual `role="dialog"` and focus trapping. Candidate shadcn replacements: `Dialog`, `Sheet`, or `Drawer`.
- Pending detail overlay shells also use manual `role="dialog"`. They may need a custom shell because they appear before route data resolves, but this should be an explicit decision.
- Future delete confirmations should use `AlertDialog`, not a custom modal. `AlertDialog` is installed but unused.
- Future provider source option sets should keep using `ToggleGroup`.
- Object detail `MatchDisclosure` now uses `Collapsible`; keep future standalone disclosures on the same primitive.
- Prototype `AnchorButton` uses `buttonVariants` on anchors. That is acceptable in prototype routing, but production should prefer existing navigation primitives or named app components for link-as-control patterns.

## Findings

### 1. shadcn/ui Is Present, But Anacronia Has A Second UI Layer

The app is not "pure shadcn"; it is shadcn plus an Anacronia domain UI layer. That layer is especially visible in grids and detail overlays.

This is the right architecture if it stays deliberate:

- shadcn owns generic interaction primitives and tokens
- Anacronia owns museum/image/result-set behavior
- production prototypes must reuse the Anacronia domain layer rather than inventing separate fixture UI

The Local Result Set prototype is now mostly aligned with that rule because it reuses `IMAGE_GRID_*`, `ImageGridThumbnail`, and production pending detail links.

### 2. The Detail Overlay Shell Is The Biggest Custom Surface

The object and image detail overlays are the largest bespoke UI surfaces in the app. They include manual overlay layout, backdrop, focus restoration, focus trapping, Escape handling, keyboard navigation, and close behavior.

This is not automatically wrong because the overlays are URL-addressable and domain-heavy. But future work should decide one of two paths:

- migrate the shell to shadcn `Dialog`/`Sheet` while preserving domain content
- keep the custom shell and document it as the Anacronia route-detail overlay primitive

Avoid continuing with multiple hand-built overlay shells that slowly diverge.

### 3. Image Grids Are Correctly Custom, But Need To Stay Centralized

Production Collection grids, User Library grids, and the Local Result Set prototype all depend on the same visual contract:

- full-width grid
- two columns on smallest screens
- three columns on small screens
- five columns on medium screens
- seven columns on extra-large screens
- 4:5 tile aspect ratio
- hover/focus metadata overlay
- provider badge and object carousel indicator

This should be treated as a stable Anacronia grid module. Future selection, export, and edit behavior should extend this module or wrap it, not duplicate tile markup in each view.

### 4. Forms Mostly Follow shadcn Patterns

The project uses `Field`, `Textarea`, `Input`, `NativeSelect`, `RadioGroup`, `Item`, `Button`, and `Spinner` well in:

- New Collection name/terms fields
- Batch target control
- Collection export format choice
- Provider action buttons
- Terms field

The previous `ImageSourceControl` exception has been addressed by moving the provider option set to `ToggleGroup`.

### 5. The Main Page Still Owns Too Much UI

`web/src/app/page.tsx` is doing data loading, URL parsing, workspace selection, export card composition, selected detail routing, and layout. Some of that belongs in the server page, but export/source surfaces are already reusable concepts.

This does not create immediate user-facing risk, but it makes future UI-system consistency harder because shadcn usage and domain rules are embedded as local helper functions.

### 6. Prototype UI Is Appropriately Isolated

The Local Result Set prototype contains fixture filtering, fake providers, prototype URL state, and placeholder dialogs. It also uses real production grid primitives.

That is the right balance for handoff:

- harvest behavior and production grid reuse
- do not promote fixture data, scenario controls, fake provider state, or client-only result computation

## Recommendations

### Keep

- Keep shadcn as the generic component library.
- Keep the Anacronia image grid as a domain-specific component layer.
- Keep `IMAGE_GRID_*` as the current source of truth for tile/grid visuals until a stronger component abstraction replaces it.
- Keep production pending detail link behavior for grid clicks outside selection mode.
- Keep `ToggleGroup` for Object/Image projection.
- Keep `Field`/`NativeSelect`/`RadioGroup` patterns for forms.

### Consolidate Next

- Create or name a production `ResultGrid` or `ImageResultGrid` abstraction that owns tile rendering, selection affordances, and detail link behavior.
- Keep Provider Source controls centralized outside `page.tsx`; revisit export card composition after issue #99 resolves.
- Decide whether production detail overlays use shadcn `Dialog`/`Sheet` or an explicitly documented custom route-detail overlay shell.
- Use `AlertDialog` for future destructive delete/remove/exclude confirmations.

### Do Not Do

- Do not replace the production image grid with generic shadcn `Card` grids.
- Do not copy prototype fixture shells into production.
- Do not build new custom modals for destructive actions.
- Do not create separate grid visual rules for Collection, User Library, and Local Result Set.
- Do not treat every `className` as a problem; Anacronia still needs domain-specific layout and image presentation.

## Production Direction

The right future shape is:

1. shadcn/ui primitives for controls, forms, dialogs, sidebars, badges, empty states, loading states, and alerts.
2. Anacronia domain components for grids, Museum Object/Image Asset tiles, detail navigation, and result-set selection.
3. Prototype routes as evidence and behavior contracts only.
4. A short UI rule that new production surfaces must first look for an existing shadcn primitive and an existing Anacronia domain component before creating custom markup.

Suggested rule for `docs/ux/ui-rules.md`:

> Build generic UI from shadcn primitives and domain UI from named Anacronia components; add custom markup only after checking both layers and documenting why neither fits.
