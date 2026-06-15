# Anacronia Analysis Studio PRD

Date: June 12, 2026

Updated: June 14, 2026

Related ADRs:

- [0023 - Version Analysis Results with provenance](../adr/0023-version-analysis-results-with-provenance.md)
- [0026 - Use concierge hosted viewers before full cloud SaaS](../adr/0026-use-concierge-hosted-viewer-before-full-cloud-saas.md)
- [0027 - Use a persistent nav rail for app spaces](../adr/0027-use-persistent-nav-rail-for-app-spaces.md)

Related GitHub PRD: [Issue 220 - PRD: Analysis Studio, Analysis Scope, and Latent Space Explorer integration](https://github.com/giosampietro/Anacronia/issues/220)

## Problem Statement

Anacronia now has a useful latent-map prototype, but the prototype still behaves like a research island. A folder is processed through scripts, analysis artifacts can live outside the core product model, and the viewer can be opened through special-purpose run paths.

The next architecture needs to make analysis a durable Anacronia feature without losing the prototype's fast exploratory character. The user needs to analyze one Collection, several related Collections, and eventually the whole User Library, then explore the resulting image space visually. Analyses must be reusable, explainable, versioned, portable, and cheap enough to run often without filling the disk with duplicated thumbnails and large viewer exports.

ADR-0026 adds another requirement: a local Analysis Result must be strong enough to become a Project Viewer Export for a private hosted client viewer later. That does not mean adding cloud, auth, upload, or SaaS now. It means the local product must stop treating latent-map runs as disposable `/tmp` outputs and start treating them as durable, inspectable, immutable product records.

## Solution

Add **Analysis Studio** as a top-level Anacronia App Space beside **Library / Collections** and the **Latent Space Explorer**.

Analysis Studio lets the user define an **Analysis Scope**, choose one or more **Analysis Recipes**, and run an **Analysis Job** in the background. Each selected recipe produces one immutable **Analysis Result**. The Latent Space Explorer opens existing Analysis Results and visualizes them as a 2D WebGL latent map.

The durable product contract is:

```text
Library / Collections
  owns source Image Assets, curation, membership, and deletion state

Analysis Studio
  resolves scope snapshots, runs jobs, and creates durable Analysis Results

Latent Space Explorer
  opens Analysis Results and visualizes their artifacts

Project Viewer Export
  packages an Analysis Result for controlled hosted review later
```

The first implementation treats cross-Collection scope as first-class. One Collection and multiple Collections use the same scope resolver: gather active Image Assets, dedupe by Source Identity or Image Asset identity, record contributing Collections, then run the same pipeline. Whole-Library scope remains a designed future scope.

Reusable per-image embeddings are stored separately as **Image Embedding Results**. Scope-level outputs such as FAISS indexes, UMAP layouts, HDBSCAN labels, cluster metadata, render caches, and viewer manifests are stored as immutable **Analysis Results** with an artifact manifest.

An Analysis Recipe owns the complete Explorer-ready artifact plan for its Analysis Result. For the default DINOv3 Explorer recipes, the Analysis Job should generate the numeric/provenance artifacts plus viewer manifest data, FAISS relation index, UMAP layout data, HDBSCAN cluster data, and 32px, 64px, and 96px atlas render caches during the analysis pass. 128px atlases are optional recipe configuration. The Latent Space Explorer consumes completed Analysis Results and must not generate, mutate, or repair analysis artifacts. It may keep temporary view state such as zoom, pan, selection, filters, thumbnail mode, and URL state.

## App Shell And Navigation

The three App Spaces should be reachable through a persistent narrow Navigation Rail:

```text
Library / Collections
Analysis Studio
Latent Space Explorer
```

The rail switches where the user is in Anacronia. It should not trigger analysis computation by itself and should not replace contextual actions such as opening a specific Analysis Result in the Explorer.

The Latent Space Explorer stays inside the normal app shell by default, with the same Navigation Rail visible. It can still provide an immersive view through Focus Mode: pressing `f` hides the rail and surrounding UI chrome so the canvas can use the full viewport. Focus Mode is a temporary viewing state, not a separate Explorer architecture.

Contextual entry points should remain conservative. Collection pages may link to relevant analyses, Analysis Results may open in Explorer, and the Explorer may return to its source Analysis Result. The product should avoid scattering generic analysis buttons until the Analysis Studio workflow is implemented and tested.

## Analysis Studio Workspace UI

Analysis Studio should mirror the dense operational rhythm of the Library / Collections App Space. It should not remain a standalone dark dashboard page.

The global Navigation Rail remains the App Space switcher. Inside Analysis Studio, a Studio-local sidebar should provide:

- `New Analysis`, equivalent to `New Collection` in the Collections workspace.
- `Analysis Results`, listing completed or openable durable Analysis Results.
- `Jobs`, listing running, failed, partial, or recent Analysis Jobs.
- Optional filtering across results and jobs.
- A compact runtime/status footer when useful.

The main panel should change according to URL-addressable Studio state:

- `overview`: neutral landing state with recent jobs, ready results, and storage/status summaries.
- `new-analysis`: Analysis Scope picker, Analysis Recipe picker, resolved scope preview, and `Run Analysis`.
- `selected-result`: Analysis Result dashboard with `Open Explorer` as the primary action.
- `selected-job`: stage timeline, per-recipe status, failure details, and links to produced sibling Analysis Results.

URL state should make these states shareable and reload-safe, for example `?mode=new-analysis`, a selected Analysis Result parameter, and a selected Analysis Job parameter. Analysis Studio should choose one canonical URL helper for parsing and href creation, define deterministic precedence when conflicting parameters are manually present, and render dedicated missing Result or missing Job states instead of silently falling back. Analysis Studio should not silently select the first Collection, first Result, or first Job.

An Analysis Result sidebar item should use human-readable labels rather than raw recipe IDs. Example: `Bread / DINOv3 384 / 318 images / ready`. In tables and dashboards, use `Scope`, `Recipe`, `Images`, `Status`, and `Actions`; avoid using `Source` or `Run` as primary user-facing columns for Analysis Results.

When an Analysis Result is selected, the main panel should show:

- Header: result title, status, created date, and `Open Explorer`.
- Scope: Collection or Collections, active image count, duplicates collapsed, removed images, newly added images not included in the result, and staleness status.
- Recipe: user-facing label such as `DINOv3 384`, with model, preprocessing, vector kind, normalization, and provenance details available below.
- Outputs: FAISS relation availability, UMAP layout, HDBSCAN clusters, KMeans if present, atlas levels, cache health, and viewer readiness.
- Artifacts and storage: durable artifacts versus render cache, byte sizes, missing required artifacts, missing optional render cache artifacts, and export-readiness status.
- Job provenance: Analysis Job ID, sibling results from the same multi-recipe job, stage summary, elapsed time, and failure information if relevant.
- Actions: `Open Explorer`, `Run updated analysis` when new images make the result stale, and guarded `Delete Result`.

When an Analysis Job is selected, the main panel should show the job as process/provenance, not as the durable object the user explores. Running jobs show stage progress. Failed jobs show failed stage, failed recipe, error detail, and a retry/new-analysis path. Partial jobs show completed sibling Analysis Results explicitly by recipe; they must not expose a generic job-level `Open Explorer` action that silently opens the first result.

The Analysis Studio UI should be fully shadcn-compliant and should reuse the same shell primitives as the Collections workspace. Use semantic tokens and shadcn primitives for layout, forms, lists, status, empty states, loading, and destructive confirmations. Do not custom-build raw cards, raw tables, custom status pills, or immediate destructive buttons where shadcn primitives already exist.

Starting an Analysis Job should redirect back into the selected-job state for the newly created Analysis Job. Opening the Explorer remains a separate action from an Analysis Result and should continue to target the selected Analysis Result.

## User Stories

1. As an Anacronia user, I want an Analysis Studio space, so that analysis setup does not feel buried inside one Collection page or inside the visual explorer.
2. As an Anacronia user, I want to start analysis from a Collection, so that I can quickly analyze the material I am already viewing.
3. As an Anacronia user, I want Analysis Studio to open with the current Collection preselected when launched from that Collection, so that the flow remains contextual.
4. As an Anacronia user, I want to open Analysis Studio directly from top-level navigation, so that I can plan analyses independently from one Collection screen.
5. As an Anacronia user, I want to select one Collection as an Analysis Scope, so that I can analyze a focused research set.
6. As an Anacronia user, I want to select multiple Collections as one Analysis Scope, so that I can combine related research sets such as snakes, snake jewelry, and snake vases.
7. As an Anacronia user, I want duplicate Image Assets across selected Collections to appear once in the Analysis Result, so that the latent map does not double-count the same image.
8. As an Anacronia user, I want the Analysis Result to remember all contributing Collections for each Image Asset, so that later filtering or coloring by source Collection is possible.
9. As an Anacronia user, I want whole-Library analysis to be part of the product direction, so that the system can later map everything I have collected.
10. As an Anacronia user, I want Analysis Scope to be a snapshot, so that later Collection edits do not silently rewrite old analysis results.
11. As an Anacronia user, I want removed images to be hidden gracefully in old analyses, so that cleanup does not make older maps unusable.
12. As an Anacronia user, I want newly added images to be clearly reported as not included in an older analysis, so that I understand when a map is stale.
13. As an Anacronia user, I want a Run updated analysis action when new images exist, so that I can create a fresh immutable Analysis Result.
14. As an Anacronia user, I want Run updated analysis to copy the previous analysis choices by default, so that updating a scope is simple.
15. As an Anacronia user, I want Run updated analysis to reuse existing Image Embedding Results, so that adding new images does not force all embeddings to be recomputed.
16. As an Anacronia user, I want each Analysis Job to run in the background, so that I can navigate away while embeddings and map outputs are generated.
17. As an Anacronia user, I want to see the current analysis stage, so that I know whether the job is embedding, building FAISS, running UMAP, clustering, or generating Explorer atlas artifacts.
18. As an Anacronia user, I want per-recipe progress, so that multi-recipe jobs are understandable.
19. As an Anacronia user, I want elapsed time and approximate output size where possible, so that I can understand performance and disk cost.
20. As an Anacronia user, I want failures to be reported per stage, so that one failure does not make the entire system opaque.
21. As an Anacronia user, I want DINOv3 384 selected by default, so that the default favors the higher-quality prototype recipe.
22. As an Anacronia user, I want DINOv3 256 available, so that I can run faster comparison analyses.
23. As an Anacronia user, I want DINOv3 512 available, so that I can test whether higher input resolution improves visual neighborhoods.
24. As an Anacronia user, I want to select more than one embedding recipe in one job, so that I can compare recipes without repeating scope setup.
25. As an Anacronia user, I want one Analysis Job to group sibling Analysis Results, so that DINOv3 256, 384, and 512 outputs from the same run remain connected.
26. As an Anacronia user, I want each recipe output to be its own Analysis Result, so that the Explorer can open one coherent map at a time.
27. As an Anacronia user, I want future SigLIP2 and fusion embeddings to fit the same recipe/result model, so that visual and semantic similarity can later be explored together.
28. As an Anacronia user, I want FAISS to run automatically for each selected recipe, so that similarity lookup is always available.
29. As an Anacronia user, I want UMAP to run automatically for each selected recipe, so that the Explorer always has a 2D navigation layout.
30. As an Anacronia user, I want HDBSCAN to run automatically for each selected recipe, so that clusters are available as a first-class lens.
31. As an Anacronia user, I want KMeans to remain optional and secondary, so that legacy comparison is possible without making it the main clustering model.
32. As an Anacronia user, I want HDBSCAN noise points shown as Unclustered, so that outliers are understandable and not treated as errors.
33. As an Anacronia user, I want cluster controls to present clusters as lenses, so that I do not mistake them for ground truth.
34. As an Anacronia user, I want a muted note about patch-token analysis, so that I remember this important future direction when generating embeddings.
35. As an Anacronia user, I want patch-token analysis not to be generated by default yet, so that the first integrated workflow stays manageable.
36. As an Anacronia user, I want default DINOv3 recipes to generate 32px, 64px, and 96px atlases with the Analysis Job, so that opening the Explorer shows useful visual context immediately.
37. As an Anacronia user, I want 128px atlases to be optional recipe configuration, so that sharper maps are an explicit storage and runtime choice.
38. As an Anacronia user, I want the Explorer to use available atlas artifacts without generating missing required artifacts itself, so that computation remains owned by Analysis Studio.
39. As an Anacronia user, I want render caches to be disposable, so that I can keep many Analysis Results without keeping every texture level forever.
40. As an Anacronia user, I want 32px baseline caches preserved by default, so that old Analysis Results still open with visual context.
41. As an Anacronia user, I want higher-detail render caches evicted before durable analysis data, so that storage cleanup does not destroy research outputs.
42. As an Anacronia user, I want to see total analysis and render-cache size, so that disk usage is not mysterious.
43. As an Anacronia user, I want to delete an Analysis Result, so that unwanted experiments can be removed.
44. As an Anacronia user, I want deleting an Analysis Result not to delete reusable Image Embedding Results by default, so that expensive embeddings remain available.
45. As an Anacronia user, I want a separate cleanup for unused embeddings, so that storage cleanup is intentional.
46. As an Anacronia user, I want the Latent Space Explorer to use the same app shell and Navigation Rail as Library and Analysis Studio, so that visual exploration still feels like part of Anacronia.
47. As an Anacronia user, I want the Explorer to open from an Analysis Result, so that the visual map always has clear provenance.
48. As an Anacronia user, I want the Explorer to switch between existing Analysis Results, so that I can move between Collections, scopes, and recipes from the exploration environment.
49. As an Anacronia user, I want the Explorer to show which scope and recipe I am viewing, so that I never lose method context.
50. As an Anacronia user, I want the Explorer to show one primary Analysis Result at a time, so that the first UI stays readable.
51. As an Anacronia user, I want selected image state preserved when switching recipes when possible, so that I can inspect how the same image behaves across methods.
52. As an Anacronia user, I want FAISS relation lookup to respect the current active scope membership by default, so that removed images do not keep appearing as active neighbors.
53. As an Anacronia user, I want new images excluded from old FAISS relation lookup, so that old maps do not pretend to include un-analyzed material.
54. As an Anacronia user, I want the old analysis snapshot to remain auditable, so that I can understand what was originally analyzed.
55. As an Anacronia user, I want future filtering or coloring by contributing Collection, so that cross-Collection maps remain interpretable.
56. As an Anacronia user, I want future Library Analysis to reuse the same model, so that whole-library maps are not a separate system.
57. As an Anacronia user, I want future fusion recipes to be first-class Analysis Results, so that DINOv3 and SigLIP2 similarity can be combined and explored.
58. As an Anacronia user, I want future comparison views to be possible, so that I can inspect differences between methods later.
59. As an Anacronia user, I want image-level latent maps now, so that the integrated product can move forward before region-level analysis is designed.
60. As an Anacronia user, I want patch-token research recorded in the PRD, so that local visual-similarity ideas are not lost.
61. As an Anacronia user, I want the `f` shortcut to hide all app chrome in the Explorer, so that I can inspect the map in an immersive Focus Mode when needed.
62. As an Anacronia user, I want pressing `f` again or exiting Focus Mode to restore the Navigation Rail and controls, so that immersion is reversible and not a separate route.
63. As a future project operator, I want a durable Analysis Result to include a viewer-exportable manifest, so that a local analysis can later become a private hosted client viewer.
64. As a future project operator, I want viewer exports to omit local absolute paths, so that client-facing packages do not leak private machine details.
65. As a future project operator, I want viewer exports to omit originals by default, so that hosted review uses generated derivatives and atlases unless a project explicitly requires more.
66. As a future project operator, I want artifact sizes and retention classes recorded, so that storage cleanup and consulting estimates are possible.
67. As a developer, I want Analysis Scope resolution to be a deep module, so that multi-Collection dedupe and snapshot rules are tested in one place.
68. As a developer, I want Analysis Recipe registration to be a deep module, so that DINOv3, future SigLIP2, and fusion recipes share one interface.
69. As a developer, I want Analysis Job orchestration to be a deep module, so that stage progress, reuse, failure, and output creation are reliable.
70. As a developer, I want Artifact Store access to be a deep module, so that local filesystem storage can later be replaced by R2/S3 without rewriting analysis algorithms.
71. As a developer, I want render-cache policy to be a deep module, so that cache cleanup can evolve without touching Explorer logic.
72. As a developer, I want Explorer data contracts to distinguish durable analysis data from disposable render cache, so that viewer performance does not dictate storage truth.
73. As an Anacronia user, I want Analysis Studio to use the same sidebar rhythm as Collections, so that analysis feels like a normal workspace rather than a separate dashboard.
74. As an Anacronia user, I want a `New Analysis` sidebar action, so that starting analysis feels parallel to starting a New Collection.
75. As an Anacronia user, I want the Analysis Studio sidebar to list Analysis Results, so that completed analysis outputs are easy to reopen.
76. As an Anacronia user, I want the Analysis Studio sidebar to separate Jobs from Results, so that process history does not blur with durable outputs.
77. As an Anacronia user, I want Analysis Result sidebar labels to show scope, recipe, image count, and status, so that I can choose the right result without decoding raw IDs.
78. As an Anacronia user, I want clicking an Analysis Result to show a dashboard in the main panel, so that I can inspect what was analyzed before opening the visual map.
79. As an Anacronia user, I want the selected Analysis Result dashboard to show an `Open Explorer` action, so that I can move from audit/status into visual exploration.
80. As an Anacronia user, I want the selected Analysis Result dashboard to show scope, recipe, outputs, artifacts, storage, and job provenance, so that the result is understandable and trustworthy.
81. As an Anacronia user, I want `overview`, `new-analysis`, `selected-result`, and `selected-job` states to be URL-addressable, so that reloading or sharing an Analysis Studio view preserves context.
82. As an Anacronia user, I want the New Analysis flow to include scope selection, recipe selection, and a resolved scope review, so that I know what will be analyzed before running it.
83. As an Anacronia user, I want the resolved scope review to show active images and duplicates collapsed, so that multi-Collection analysis is understandable before computation starts.
84. As an Anacronia user, I want job details to show stage timeline and per-recipe failures, so that I can diagnose what happened without opening the Explorer.
85. As an Anacronia user, I want partial multi-recipe jobs to show completed sibling Results explicitly, so that I can open successful outputs even when another recipe failed.
86. As an Anacronia user, I want stale Analysis Results to remain openable, so that historical maps are still useful even after Collection membership changes.
87. As an Anacronia user, I want `Run updated analysis` to appear only when new images exist, so that I do not recompute just because old images were removed.
88. As an Anacronia user, I want default DINOv3 Analysis Recipes to produce 32px, 64px, and 96px atlas levels during analysis, so that the Explorer opens with useful visual context without generating data itself.
89. As an Anacronia user, I want 128px atlas generation to be optional recipe configuration, so that I can opt into sharper maps when the storage and runtime cost is worthwhile.
90. As an Anacronia user, I want the Explorer to be read-only over Analysis Results, so that visual exploration cannot accidentally mutate analysis data.
91. As an Anacronia user, I want Analysis Studio to use shadcn UI primitives consistently, so that it shares the same UI quality and behavior as Collections.
92. As a developer, I want Analysis Recipe to expose an executable stage plan, so that stage order, expected artifacts, and Explorer-ready outputs are tested through one interface.
93. As a developer, I want Analysis Studio to consume one read model for Collections, Jobs, Results, status, and artifacts, so that the UI does not stitch together inconsistent local and backend sources.
94. As a developer, I want the Analysis Studio shell and panels split into testable modules, so that UI state and shadcn composition can evolve without rebuilding the whole page.

## Implementation Decisions

- Add **Analysis Studio** as a top-level app space for defining scopes, selecting recipes, running jobs, and browsing Analysis Results.
- Use a persistent narrow Navigation Rail as the primary app-level switcher across Library / Collections, Analysis Studio, and Latent Space Explorer.
- Keep the Navigation Rail visible in the Latent Space Explorer by default. The Explorer is a peer App Space, not a separate full-screen-only shell.
- Preserve Focus Mode through the existing `f` shortcut. Focus Mode hides the Navigation Rail and surrounding UI chrome temporarily, then restores them when exited.
- Treat contextual entry points as shortcuts to specific work, not as the primary app-space model. For example, an Analysis Result can open in Explorer, but the Explorer rail item still represents the Explorer App Space.
- Treat **Analysis Scope** as the population definition for an analysis. The first-class scope types are one Collection and multiple Collections. Whole-Library scope is a designed future scope.
- Treat **Collection Analysis** as a collection-scoped Analysis Result, not the top-level feature name.
- Treat **Analysis Job** as the user-triggered background run. A job can produce multiple sibling Analysis Results.
- Treat **Analysis Result** as an immutable output for one recipe or fusion method over one Analysis Scope snapshot.
- Treat **Image Embedding Result** as reusable per Image Asset, recipe, model, preprocessing configuration, and derivative input.
- Do not duplicate original images or permanent derivatives inside Analysis Results.
- Multi-Collection scopes dedupe by Source Identity or Image Asset identity and record all contributing Collections.
- Scope snapshots record the included Image Assets at creation time.
- Removed images do not force recomputation. They are hidden from the active Explorer view by default and can remain part of historical audit metadata.
- New images require a new Analysis Result to be included in FAISS, UMAP, HDBSCAN, atlas pages, and Explorer layout.
- Run updated analysis uses the previous Analysis Result settings by default.
- New Analysis Results reuse existing Image Embedding Results and compute only missing embeddings where possible.
- DINOv3 384 is the default selected recipe.
- DINOv3 256 and DINOv3 512 are available recipe choices.
- A single Analysis Job can select multiple recipes.
- Each selected recipe produces a separate Analysis Result under the same job group.
- Future SigLIP2, OpenCLIP/SigLIP variants, and fusion embeddings should enter the same recipe/result model.
- Future SigLIP2 implementation should follow the local model assessment in [research-notes/siglip2-local-model-assessment.md](../../research-notes/siglip2-local-model-assessment.md): device/backend, batch size, dtype, model unloading, and memory fallback are Analysis Job runtime diagnostics, not recipe identity. Text retrieval remains a separate future issue from image-only SigLIP2 embeddings.
- For each selected recipe, FAISS, UMAP, and HDBSCAN run automatically.
- KMeans remains optional and secondary for legacy/historical comparison.
- HDBSCAN is the primary cluster model.
- HDBSCAN unassigned/noise points are surfaced as Unclustered.
- Analysis Studio should show background job stages: embedding, FAISS, UMAP, HDBSCAN, optional KMeans, and Explorer atlas generation.
- Analysis Studio should expose job progress without blocking navigation.
- Analysis Studio should be a workspace with a Studio-local sidebar and main panel, mirroring the Collections workspace. It should not be a standalone dashboard-style page.
- The sidebar primary action is `New Analysis`. The sidebar should list durable Analysis Results separately from Analysis Jobs.
- Analysis Studio state should be URL-addressable as `overview`, `new-analysis`, `selected-result`, and `selected-job`.
- Selecting an Analysis Result opens a result dashboard in the main panel. The primary action from that dashboard is `Open Explorer`.
- Selecting an Analysis Job opens a process dashboard in the main panel. Jobs show progress, failures, and links to produced sibling Results, but Jobs are not the durable objects the Explorer opens.
- Analysis Result labels should be human-readable and should prioritize Analysis Scope and Analysis Recipe labels over raw IDs.
- The Analysis Studio UI should be fully shadcn-compliant. It should use the existing shadcn shell, sidebar, card, field, select, checkbox, toggle, button, badge, table, empty, alert, progress, spinner, and alert-dialog primitives rather than raw custom markup.
- The Analysis Studio UI should use semantic shadcn tokens such as background, foreground, border, card, and muted foreground. It should not recreate the current custom dark dashboard palette with one-off neutral color classes.
- The Analysis Studio UI should follow the installed Base UI shadcn composition style used elsewhere in the app, including local `render={...}` composition where applicable rather than assuming Radix-style `asChild`.
- New Analysis should use step-card composition parallel to New Collection: scope selection, recipe selection, and resolved scope review.
- Scope selection should support one Collection and multiple Collections. Multi-Collection selection should use an appropriate shadcn-compliant multi-select or combobox pattern.
- Recipe selection should remain checkbox-based because one Analysis Job can select multiple Analysis Recipes and produce sibling Analysis Results.
- Starting an Analysis Job should return the user to the selected-job state for the newly created job.
- Missing selected Analysis Result and missing selected Analysis Job states should be explicit empty/error states.
- Analysis Studio needs one coherent read model for Collections, resolved scope summaries, Analysis Recipes, Analysis Jobs, Analysis Results, artifact health, storage size, staleness, and Explorer links.
- The Analysis Studio read model should not expose local absolute manifest paths to the browser-facing UI. It should expose stable IDs, artifact keys, labels, counts, status, and actions.
- The Analysis Result manifest is the source of truth for opening an Explorer view or exporting a hosted viewer package.
- The manifest should record stable result ID, scope snapshot ID, recipe ID, recipe parameters, model identity, model revision when available, preprocessing settings, embedding dimension, package versions, creation time, status, item count, output counts, artifact list, artifact sizes, optional checksums, and provenance notes.
- Artifact records should include logical role, stable key, media/content type, byte size, optional checksum, retention class, and whether the artifact is durable data or disposable render cache.
- Artifact keys should be stable and cloud-compatible. They must not depend on incidental local absolute paths.
- The first Artifact Store implementation can be the local filesystem. Analysis and viewer code should access artifacts through logical keys and metadata so R2/S3 can be introduced later.
- Analysis Recipe should expose an executable stage plan. Stage order, expected artifact roles, recipe parameters, and Explorer-ready artifact requirements should live behind the recipe interface instead of being duplicated across job orchestration, stage dispatch, and UI assumptions.
- For default DINOv3 Explorer recipes, 32px, 64px, and 96px atlas generation are part of the Analysis Job output plan.
- 128px atlas generation is optional recipe configuration.
- The Explorer is read-only over completed Analysis Results. It may request artifacts and relation data, but it must not generate, mutate, or repair Analysis Result artifacts.
- Render caches are disposable and can be evicted according to storage policy.
- Durable analysis truth is numeric/provenance data, not generated viewer JSON or texture pages.
- The Explorer is a visual App Space for existing Analysis Results and should use the same shell as Library and Analysis Studio by default.
- The Explorer should not be trapped inside one Collection route, although Collection pages can open it with a selected result.
- The Explorer opens one primary Analysis Result at a time for the integrated MVP.
- The Explorer can later add side-by-side comparison, animated layout tweening, and weighted fusion controls.
- FAISS relation lookup is a live query-time service over the selected Analysis Result's FAISS index and ID map, not a precomputed neighbor JSON cache and not the UMAP layout graph.
- Default FAISS relation lookup should exclude removed images and cannot include new images absent from the Analysis Result.
- The backend should query deep enough to fill requested neighbors after filtering removed items; historical `*_neighbors.jsonl` files are legacy prototype artifacts and should not cap or drive Explorer interactions.
- The UI should show quiet staleness notices for removed and newly added images.
- Project Viewer Export is a future-facing contract over a durable Analysis Result, not a separate analysis pipeline.
- Project Viewer Export should include only viewer-required artifacts: manifest, layout data, cluster data, relation data needed by the UI, atlas pages, thumbnails/previews, minimal item metadata, display dimensions/aspect ratios, and method provenance.
- Project Viewer Export should exclude secrets, local absolute paths, unnecessary raw provider records, private machine paths, temporary staging paths, and originals unless explicitly requested.
- Project Viewer Export should include a validation step proving the package can open independently from the local Anacronia app.
- Patch-token analysis is explicitly planned but not generated in the first integrated workflow.
- Patch-token analysis should be treated as a separate future analysis mode because it changes storage, FAISS scale, and UI from image-level points to region-level features.
- The existing latent-map prototype work should be consolidated into these domain concepts before building additional ad hoc viewer features.

## Module Deepening Plan

The implementation should prefer deep modules with small, stable interfaces over page-level wiring or duplicated manifest/path logic.

- **Executable Analysis Recipe Stage Plan**: the Analysis Recipe interface should expose canonical stage IDs, stage order, recipe-specific parameters, expected artifact roles, retention classes, and Explorer-ready artifact requirements. This should reconcile current drift between recipe `downstream_stages` vocabulary and Analysis Job stage names.
- **Analysis Result Registry**: a backend module should own registering, listing, loading, summarizing, deleting, and checking Analysis Results. It should be the source of truth for result manifests, sibling grouping, status, storage totals, staleness summaries, Explorer readiness, and Project Viewer Export readiness.
- **Artifact Store**: a backend module should own stable artifact keys, key validation, local filesystem reads/writes, size/checksum accounting where required, retention classes, deletion plans, and future object-storage adapter compatibility. Browser-facing payloads should not need local absolute paths.
- **Analysis Studio Read Model**: a read model should aggregate Collection choices, resolved scope summaries, Analysis Recipe choices, Analysis Job summaries, Analysis Result cards, artifact health, storage size, staleness, and Explorer links for the shadcn UI. Listing or opening Analysis Studio should not trigger computation.
- **Analysis Studio Shell**: the UI should be split into a Studio shell, Studio sidebar, New Analysis flow, selected Result dashboard, selected Job dashboard, status summary, Results list, Jobs list, and guarded actions. The page route should load data and compose these modules rather than owning all UI behavior directly.
- **Analysis Job Runtime**: a later module should own enqueueing, processing, status polling, stage progress persistence, cancellation/stop behavior, failure recording, restart behavior, and per-recipe partial failures. Stage runners should execute stages; they should not become the job runtime.
- **Project Viewer Export Adapter**: a later adapter should package a Project Viewer Export from an Analysis Result through the Analysis Result Registry and Artifact Store. It should not package arbitrary run folders.

## Manifest And Artifact Contract

The manifest is the durable contract between local analysis, the Explorer, and future hosted viewer export. It should be JSON-serializable and avoid local machine assumptions.

Required manifest groups:

- Identity: analysis result ID, job ID, sibling group ID when applicable, title/label, creation timestamp, status.
- Scope: scope type, selected Collection IDs/slugs, snapshot item IDs, item count, contributing Collections per item where relevant.
- Recipe: recipe ID, model family, model repository or local model ID, model revision if known, input derivative, input size, preprocessing settings, embedding dimension, downstream stages, and parameter values.
- Provenance: Anacronia version or git revision when available, Python/package versions for analysis-critical libraries, platform notes, random seeds, and warnings.
- Artifacts: stable artifact keys with role, content type, byte size, optional checksum, retention class, durable/cache classification, and required/optional status.
- Viewer: layout artifact key, cluster result keys, atlas page metadata, thumbnail/detail image roles, item display dimensions, and URL-state defaults.
- Explorer-ready artifacts: which atlas levels were generated, which atlas levels are required for default opening, which optional atlas levels are available, and whether relation lookup is available.
- UI summary: scope label, recipe label, status, item count, artifact size totals, staleness summary, storage summary, export readiness, and primary actions needed by the Analysis Result dashboard.
- Staleness: source snapshot counts, current active/missing/new counts when evaluated, and whether the result can be updated by copying prior settings.
- Export safety: whether the manifest is safe for Project Viewer Export, whether originals are included, whether local paths were stripped, and validation status.

## Deletion And Retention

- Deleting an Analysis Result deletes its scope-level artifacts and render caches, but does not delete source Image Assets, permanent derivatives, raw provider records, or reusable Image Embedding Results by default.
- Unused Image Embedding Results require a separate cleanup operation because they may be expensive to recompute.
- Render caches, including atlas levels, are evicted before durable numeric/provenance artifacts.
- Optional 128px atlas render caches should be evicted before default 32px, 64px, and 96px atlas render caches.
- Evicting render caches does not authorize the Explorer to regenerate them. Missing optional render caches should be reported; missing required Explorer artifacts should make the affected view or control unavailable until a new Analysis Job or explicit cache-generation job produces them.
- Project Viewer Export packages are outputs derived from Analysis Results. Deleting a local Analysis Result should not silently delete an already exported or hosted package without an explicit project retention rule.
- Hosted viewer retention is governed by ADR-0026 and the concierge hosted viewer PRD. The local Analysis Studio PRD only prepares the data contract.

## Path Hygiene And Security

- Analysis manifests, viewer payloads, and Project Viewer Exports must not expose local absolute paths.
- Local source-file paths can remain private local provenance where needed, but exported viewer payloads should use stable artifact keys or package-relative paths.
- Temporary staging paths, cache build paths, tokens, credentials, and machine usernames must not be written into viewer-exportable manifests.
- Filenames and source metadata remain untrusted text. Export code should avoid reflecting them into executable contexts.
- Originals are excluded from viewer exports by default. Generated thumbnails, previews, atlas pages, and minimal metadata are the normal hosted-viewer surface.

## Testing Decisions

- Tests should verify external behavior and domain invariants, not implementation details or private helper structure.
- Analysis Scope resolution needs focused tests for one Collection, multiple Collections, duplicate Image Assets, contributing Collection metadata, and snapshot immutability.
- Staleness detection needs tests for removed images, added images, and unchanged scopes.
- Analysis Recipe registration needs tests for default DINOv3 384 selection, optional DINOv3 256/512, multiple selected recipes, and future recipe extensibility.
- Executable Analysis Recipe stage-plan tests should prove that default DINOv3 recipes declare FAISS, UMAP, HDBSCAN, required Explorer artifacts, and 32px/64px/96px atlas outputs, with 128px only when selected by recipe configuration.
- Stage-plan tests should prove canonical stage IDs, artifact role declarations, retention declarations, unsafe artifact rejection, and future SigLIP2/fusion extensibility.
- Analysis Job orchestration needs tests for stage ordering, progress states, per-recipe outputs, reuse of existing embeddings, and missing-embedding computation.
- Analysis Result creation needs tests for immutability, provenance, recipe parameters, scope snapshot membership, sibling result grouping, manifest completeness, and artifact accounting.
- Artifact Store tests should prove local filesystem artifacts can be written, read, listed, checksummed where required, deleted by key, and addressed without leaking absolute paths into public payloads.
- Analysis Result Registry tests should prove list/load/register/delete behavior, storage accounting, staleness summaries, sibling grouping, Explorer readiness, deletion retention classes, and reusable embedding preservation.
- Analysis Studio Read Model tests should prove listing does not compute, Collection choices and recipe choices are complete, result cards are grouped correctly, stale/update state is correct, and update defaults copy prior choices.
- Render-cache policy needs tests for default 32px/64px/96px atlas generation, optional 128px atlas generation, missing optional cache reporting, missing required artifact handling, and eviction order.
- Deletion tests must prove deleting an Analysis Result does not delete reusable Image Embedding Results by default.
- Project Viewer Export tests should prove exports include required viewer artifacts, exclude local paths and originals by default, validate independently, and remain package-relative.
- Explorer data-contract tests should prove that durable result metadata and disposable render cache metadata are distinct.
- App shell tests should prove the Navigation Rail switches among Library / Collections, Analysis Studio, and Latent Space Explorer without starting computation.
- Explorer browser checks should verify that the rail is visible by default and that `f` enters and exits Focus Mode by hiding and restoring app chrome.
- FAISS relation lookup tests should prove that removed images are filtered and new images are not included in old results.
- HDBSCAN tests should prove cluster labels and Unclustered/noise handling are stable and user-facing.
- Analysis Studio component tests should cover scope selection, recipe selection, job dashboard states, stale status, and Run updated analysis defaults.
- Analysis Studio shell tests should cover the Studio-local sidebar, `New Analysis`, Analysis Results list, Jobs list, selected-result dashboard, selected-job dashboard, and URL-addressable states.
- Analysis Studio UI tests should verify that the selected Analysis Result dashboard exposes `Open Explorer` and shows scope, recipe, outputs, artifact health, storage, staleness, and job provenance.
- Analysis Studio URL helper tests should cover overview, New Analysis, selected Result, selected Job, filter text, missing IDs, and conflicting selected Result/Job parameters.
- New Analysis form tests should cover default DINOv3 384 selection, multi-Collection scope serialization, disabled submit states, validation messaging, and the job-create redirect into selected-job state.
- Analysis Job view tests should cover running, ready, failed, partial-failed, and multi-result jobs.
- Analysis Job Runtime tests, when that module is introduced, should cover async creation, persisted stage progress, per-recipe partial failure, cancellation/stop, restart/idempotency, and disk/error handling.
- Analysis Result dashboard tests should cover ready, stale, incomplete, failed, deleted, missing required artifact, and missing optional render-cache states.
- Analysis Studio shadcn composition should be tested at the behavior level. Tests should verify accessible controls, labels, states, and actions rather than specific internal class names.
- Browser checks should use real run data and verify that Analysis Results open in the Latent Space Explorer, method state is visible, thumbnails use generated caches, and console output stays clean.
- Project Viewer Export tests, when that adapter is introduced, should prove package-relative manifests, required viewer artifacts, exclusion of originals/raw records/secrets, checksum validation, and independent viewer-load smoke checks.
- Existing latent-map viewer tests, run-data tests, curation tests, and User Library server-side query tests are the closest prior art for this work.

## Out Of Scope

- Client upload, browser zip upload, self-service hosted analysis, Supabase, R2, billing, Stripe, teams, collaboration, or public sharing.
- Multi-user authentication or authorization beyond local placeholders needed to avoid future naming conflicts.
- Patch-token generation, patch-level FAISS, region selection, local correspondence UI, and motif-map UI.
- Whole-Library Analysis implementation, unless explicitly pulled into the first implementation plan.
- Manual arbitrary image subset scopes.
- Side-by-side Explorer comparison.
- Animated tweening between recipes or layouts.
- Weighted DINOv3 + SigLIP2 fusion controls.
- Semantic text search over embeddings.
- Exposing low-level runtime controls such as batch size, MPS/PyTorch/Core ML backend choice, padding color, or raw model backbone selection in the first user-facing Analysis Studio.
- Recomputing existing Analysis Results in place.
- Automatically generating non-recipe-selected high-detail atlas levels for every Analysis Result.
- Allowing the Latent Space Explorer to generate, mutate, or repair Analysis Result artifacts.
- Treating Analysis Jobs as the primary object opened by the Explorer.
- Hosted, multi-user, sync, or collaboration behavior.
- Decorative 3D metaphors for the Explorer.
- Replacing the persistent Navigation Rail with page-level tabs or a separate Explorer-only shell.

## Further Notes

Patch-token analysis remains strategically important. DINOv3 patch tokens could enable region-to-region similarity across images, clicking a region and retrieving matching regions elsewhere, recurring visual motif discovery, material and texture similarity, object-part similarity such as hands, stones, fabric, ornaments, and silhouettes, local correspondence between images, heatmaps explaining why two images are related, and a future visual motif map separate from the image-level latent map.

The first integrated product should stay image-level. Patch-token analysis should get its own grilling/design pass before implementation because it changes storage volume, index size, UI interaction, and the meaning of similarity.

The PRD intentionally separates three concerns: Library/Collections manage material, Analysis Studio creates immutable analysis artifacts, and Latent Space Explorer visualizes existing Analysis Results. ADR-0027 keeps those concerns visible through a persistent Navigation Rail, while Focus Mode preserves the Explorer's immersive canvas when needed. ADR-0026 adds a fourth output contract: Project Viewer Export packages an Analysis Result for controlled hosted review later. This keeps the current prototype's strongest work while preventing script artifacts, viewer caches, Collection state, navigation state, and hosted-project needs from collapsing into one fragile concept.
