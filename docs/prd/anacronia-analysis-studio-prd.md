# Anacronia Analysis Studio PRD

Date: June 12, 2026

Related ADRs:

- [0023 - Version Analysis Results with provenance](../adr/0023-version-analysis-results-with-provenance.md)
- [0026 - Use concierge hosted viewers before full cloud SaaS](../adr/0026-use-concierge-hosted-viewer-before-full-cloud-saas.md)

Related GitHub PRD: [Issue 220 - PRD: Analysis Studio, Analysis Scope, and Latent Space Explorer integration](https://github.com/giosampietro/Anacronia/issues/220)

## Problem Statement

Anacronia now has a useful latent-map prototype, but the prototype still behaves like a research island. A folder is processed through scripts, analysis artifacts can live outside the core product model, and the viewer can be opened through special-purpose run paths.

The next architecture needs to make analysis a durable Anacronia feature without losing the prototype's fast exploratory character. The user needs to analyze one Collection, several related Collections, and eventually the whole User Library, then explore the resulting image space visually. Analyses must be reusable, explainable, versioned, portable, and cheap enough to run often without filling the disk with duplicated thumbnails and large viewer exports.

ADR-0026 adds another requirement: a local Analysis Result must be strong enough to become a Project Viewer Export for a private hosted client viewer later. That does not mean adding cloud, auth, upload, or SaaS now. It means the local product must stop treating latent-map runs as disposable `/tmp` outputs and start treating them as durable, inspectable, immutable product records.

## Solution

Add **Analysis Studio** as a top-level Anacronia app space beside **Library/Collections** and the full-screen **Latent Space Explorer**.

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

The default durable result stays compact. A 32px atlas is generated with the analysis as a baseline render cache; sharper 64/96/128 atlases are generated on demand and can be evicted. Numeric/provenance artifacts remain durable; texture pages and higher-detail render caches are disposable unless explicitly retained.

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
17. As an Anacronia user, I want to see the current analysis stage, so that I know whether the job is embedding, building FAISS, running UMAP, clustering, or generating the baseline atlas.
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
36. As an Anacronia user, I want the baseline 32px atlas generated with the analysis, so that opening the Explorer can show immediate low-detail visual context.
37. As an Anacronia user, I want higher-detail atlases generated on demand, so that daily experiments do not create huge render caches by default.
38. As an Anacronia user, I want the Explorer to make newly generated detail atlases available without a restart, so that the map improves while I work.
39. As an Anacronia user, I want render caches to be disposable, so that I can keep many Analysis Results without keeping every texture level forever.
40. As an Anacronia user, I want 32px baseline caches preserved by default, so that old Analysis Results still open with visual context.
41. As an Anacronia user, I want higher-detail render caches evicted before durable analysis data, so that storage cleanup does not destroy research outputs.
42. As an Anacronia user, I want to see total analysis and render-cache size, so that disk usage is not mysterious.
43. As an Anacronia user, I want to delete an Analysis Result, so that unwanted experiments can be removed.
44. As an Anacronia user, I want deleting an Analysis Result not to delete reusable Image Embedding Results by default, so that expensive embeddings remain available.
45. As an Anacronia user, I want a separate cleanup for unused embeddings, so that storage cleanup is intentional.
46. As an Anacronia user, I want the Latent Space Explorer to be full-screen, so that visual exploration has enough space.
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
61. As a future project operator, I want a durable Analysis Result to include a viewer-exportable manifest, so that a local analysis can later become a private hosted client viewer.
62. As a future project operator, I want viewer exports to omit local absolute paths, so that client-facing packages do not leak private machine details.
63. As a future project operator, I want viewer exports to omit originals by default, so that hosted review uses generated derivatives and atlases unless a project explicitly requires more.
64. As a future project operator, I want artifact sizes and retention classes recorded, so that storage cleanup and consulting estimates are possible.
65. As a developer, I want Analysis Scope resolution to be a deep module, so that multi-Collection dedupe and snapshot rules are tested in one place.
66. As a developer, I want Analysis Recipe registration to be a deep module, so that DINOv3, future SigLIP2, and fusion recipes share one interface.
67. As a developer, I want Analysis Job orchestration to be a deep module, so that stage progress, reuse, failure, and output creation are reliable.
68. As a developer, I want Artifact Store access to be a deep module, so that local filesystem storage can later be replaced by R2/S3 without rewriting analysis algorithms.
69. As a developer, I want render-cache policy to be a deep module, so that cache cleanup can evolve without touching Explorer logic.
70. As a developer, I want Explorer data contracts to distinguish durable analysis data from disposable render cache, so that viewer performance does not dictate storage truth.

## Implementation Decisions

- Add **Analysis Studio** as a top-level app space for defining scopes, selecting recipes, running jobs, and browsing Analysis Results.
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
- For each selected recipe, FAISS, UMAP, and HDBSCAN run automatically.
- KMeans remains optional and secondary for legacy/historical comparison.
- HDBSCAN is the primary cluster model.
- HDBSCAN unassigned/noise points are surfaced as Unclustered.
- Analysis Studio should show background job stages: embedding, FAISS, UMAP, HDBSCAN, optional KMeans, and baseline atlas generation.
- Analysis Studio should expose job progress without blocking navigation.
- The Analysis Result manifest is the source of truth for opening an Explorer view or exporting a hosted viewer package.
- The manifest should record stable result ID, scope snapshot ID, recipe ID, recipe parameters, model identity, model revision when available, preprocessing settings, embedding dimension, package versions, creation time, status, item count, output counts, artifact list, artifact sizes, optional checksums, and provenance notes.
- Artifact records should include logical role, stable key, media/content type, byte size, optional checksum, retention class, and whether the artifact is durable data or disposable render cache.
- Artifact keys should be stable and cloud-compatible. They must not depend on incidental local absolute paths.
- The first Artifact Store implementation can be the local filesystem. Analysis and viewer code should access artifacts through logical keys and metadata so R2/S3 can be introduced later.
- 32px atlas generation is part of the default analysis pass as baseline render cache.
- Higher-detail atlases such as 64px, 96px, and 128px are generated on demand from the Explorer or Analysis Studio.
- Render caches are disposable and can be evicted according to storage policy.
- Durable analysis truth is numeric/provenance data, not generated viewer JSON or texture pages.
- The Explorer is a full-screen visual environment for existing Analysis Results.
- The Explorer should not be trapped inside one Collection route, although Collection pages can open it with a selected result.
- The Explorer opens one primary Analysis Result at a time for the integrated MVP.
- The Explorer can later add side-by-side comparison, animated layout tweening, and weighted fusion controls.
- FAISS relation lookup is a service over the selected Analysis Result and current active scope membership, not the UMAP layout graph.
- Default FAISS relation lookup should exclude removed images and cannot include new images absent from the Analysis Result.
- The backend should move toward query-time FAISS relation lookup deep enough to fill requested neighbors after filtering removed items, instead of relying only on a shallow precomputed top-k cache.
- The UI should show quiet staleness notices for removed and newly added images.
- Project Viewer Export is a future-facing contract over a durable Analysis Result, not a separate analysis pipeline.
- Project Viewer Export should include only viewer-required artifacts: manifest, layout data, cluster data, relation data needed by the UI, atlas pages, thumbnails/previews, minimal item metadata, display dimensions/aspect ratios, and method provenance.
- Project Viewer Export should exclude secrets, local absolute paths, unnecessary raw provider records, private machine paths, temporary staging paths, and originals unless explicitly requested.
- Project Viewer Export should include a validation step proving the package can open independently from the local Anacronia app.
- Patch-token analysis is explicitly planned but not generated in the first integrated workflow.
- Patch-token analysis should be treated as a separate future analysis mode because it changes storage, FAISS scale, and UI from image-level points to region-level features.
- The existing latent-map prototype work should be consolidated into these domain concepts before building additional ad hoc viewer features.

## Manifest And Artifact Contract

The manifest is the durable contract between local analysis, the Explorer, and future hosted viewer export. It should be JSON-serializable and avoid local machine assumptions.

Required manifest groups:

- Identity: analysis result ID, job ID, sibling group ID when applicable, title/label, creation timestamp, status.
- Scope: scope type, selected Collection IDs/slugs, snapshot item IDs, item count, contributing Collections per item where relevant.
- Recipe: recipe ID, model family, model repository or local model ID, model revision if known, input derivative, input size, preprocessing settings, embedding dimension, downstream stages, and parameter values.
- Provenance: Anacronia version or git revision when available, Python/package versions for analysis-critical libraries, platform notes, random seeds, and warnings.
- Artifacts: stable artifact keys with role, content type, byte size, optional checksum, retention class, durable/cache classification, and required/optional status.
- Viewer: layout artifact key, cluster result keys, atlas page metadata, thumbnail/detail image roles, item display dimensions, and URL-state defaults.
- Staleness: source snapshot counts, current active/missing/new counts when evaluated, and whether the result can be updated by copying prior settings.
- Export safety: whether the manifest is safe for Project Viewer Export, whether originals are included, whether local paths were stripped, and validation status.

## Deletion And Retention

- Deleting an Analysis Result deletes its scope-level artifacts and render caches, but does not delete source Image Assets, permanent derivatives, raw provider records, or reusable Image Embedding Results by default.
- Unused Image Embedding Results require a separate cleanup operation because they may be expensive to recompute.
- Higher-detail atlases and other render caches are evicted before durable numeric/provenance artifacts.
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
- Analysis Job orchestration needs tests for stage ordering, progress states, per-recipe outputs, reuse of existing embeddings, and missing-embedding computation.
- Analysis Result creation needs tests for immutability, provenance, recipe parameters, scope snapshot membership, sibling result grouping, manifest completeness, and artifact accounting.
- Artifact Store tests should prove local filesystem artifacts can be written, read, listed, checksummed where required, deleted by key, and addressed without leaking absolute paths into public payloads.
- Render-cache policy needs tests for 32px baseline cache generation, higher-detail on-demand cache creation, and eviction order.
- Deletion tests must prove deleting an Analysis Result does not delete reusable Image Embedding Results by default.
- Project Viewer Export tests should prove exports include required viewer artifacts, exclude local paths and originals by default, validate independently, and remain package-relative.
- Explorer data-contract tests should prove that durable result metadata and disposable render cache metadata are distinct.
- FAISS relation lookup tests should prove that removed images are filtered and new images are not included in old results.
- HDBSCAN tests should prove cluster labels and Unclustered/noise handling are stable and user-facing.
- Analysis Studio component tests should cover scope selection, recipe selection, job dashboard states, stale status, and Run updated analysis defaults.
- Browser checks should use real run data and verify that Analysis Results open in the Latent Space Explorer, method state is visible, thumbnails use generated caches, and console output stays clean.
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
- Automatically generating all high-detail atlas levels for every Analysis Result.
- Hosted, multi-user, sync, or collaboration behavior.
- Decorative 3D metaphors for the Explorer.

## Further Notes

Patch-token analysis remains strategically important. DINOv3 patch tokens could enable region-to-region similarity across images, clicking a region and retrieving matching regions elsewhere, recurring visual motif discovery, material and texture similarity, object-part similarity such as hands, stones, fabric, ornaments, and silhouettes, local correspondence between images, heatmaps explaining why two images are related, and a future visual motif map separate from the image-level latent map.

The first integrated product should stay image-level. Patch-token analysis should get its own grilling/design pass before implementation because it changes storage volume, index size, UI interaction, and the meaning of similarity.

The PRD intentionally separates three concerns: Library/Collections manage material, Analysis Studio creates immutable analysis artifacts, and Latent Space Explorer visualizes existing Analysis Results. ADR-0026 adds a fourth output contract: Project Viewer Export packages an Analysis Result for controlled hosted review later. This keeps the current prototype's strongest work while preventing script artifacts, viewer caches, Collection state, and hosted-project needs from collapsing into one fragile concept.
