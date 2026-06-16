# Anacronia Current Contract

## Status

- Role: current compact implementation contract.
- Read after `CONTEXT.md` and `docs/README.md` for most planning and implementation work.
- Use `docs/README.md` to find the deeper PRD, ADR, prototype, or research source when needed.

This file groups current rules that were previously scattered across PRDs, ADRs, prototype notes, and issue context. It does not delete those sources; it routes around them.

## Product Shape

Anacronia is a local-first, single-user Mac app through the MVP.

The app has three first-class App Spaces:

- `Library / Collections`: source material, imports, curation, provenance, derivatives, Collection Membership, delete/export lifecycle.
- `Analysis Studio`: Analysis Scope, Analysis Recipe, Analysis Job, Image Embedding Result, Analysis Result, Artifact Store/Registry concerns.
- `Latent Space Explorer`: read-only visual navigation of completed Analysis Results.

Navigation uses a persistent rail. Explorer can enter temporary Focus Mode with `f`.

## Library / Collections

Collections are user-facing research intents.

Current source types:

- `online-provider`: museum/source API material such as Met and V&A.
- `local-folder`: private user-imported local images.

Provider Search applies only to online Providers. Local folder import is not Provider Search.

Online archive creation:

- user chooses `Online archive`;
- user enters title and one or more terms;
- user explicitly selects Provider;
- first search creates and locks the MVP Collection definition.

Local folder creation:

- user chooses `Local folder`;
- user enters title and folder path;
- no search terms, provider metadata, rights declaration, source URL, or manifest required.

Met is the permanent MVP Provider. V&A is the current multi-provider scaffold test.

## Source And Metadata

Use Source Identity where durable identity matters. Do not rely on local row IDs for curation, re-import, favorites, delete, exclusions, or exports.

Provider metadata is source-derived provenance. Generated labels, captions, embeddings, feature sidecars, and clusters are Analysis Results or Analysis Artifacts. They must not overwrite provider records or Descriptors.

Descriptor extraction is explicit provider mapping, not AI interpretation.

User-imported local material can be private, copyrighted, unattributed, or unknown. Anacronia stores and analyzes it locally without rights resolution.

## Images And Derivatives

An imported Image Asset is usable only when required local derivatives exist and validate:

- `standard-1024`: long edge 1024, JPEG, quality 90.
- `thumb-256`: long edge 256, JPEG, quality 75.

Full-resolution originals are temporary inputs for derivative generation and are deleted after processing unless a future export workflow explicitly fetches/packages them.

Exports use Image Asset as the primary row/unit.

## Curation

Collection Membership is current inclusion in a Collection.

Collection Exclusion is Collection-scoped. `Remove from Collection` excludes material only from that Collection's future Provider Searches.

Favorite is global across Collections.

Delete removes material globally from User Library and all Collections, deletes local image files where appropriate, and does not create a global never-import-again rule.

Deleted source identity rows should be reusable/reactivated on re-import where audit integrity needs it.

## Analysis Studio

Analysis Studio creates immutable Analysis Results from Analysis Scope snapshots and Analysis Recipes.

Analysis Scope:

- one Collection and multiple Collections are first-class;
- whole User Library is future;
- snapshots active Image Assets;
- dedupes by Source Identity or Image Asset identity;
- records contributing Collections.

Analysis Recipe:

- defines model, preprocessing, vector kind, dimensions, normalization, downstream stage plan, and artifact expectations;
- current default is DINOv3 384 for image-level latent-map analysis;
- DINOv3 256 and 512 are comparison recipes;
- future SigLIP2 and fusion enter as explicit recipes/results.

Analysis Job:

- user-triggered background run;
- one job can produce multiple sibling Analysis Results;
- MVP runs one active expensive analysis job/stage at a time.

Image Embedding Results are reusable per Image Asset and recipe fingerprint. Scope-level Analysis Results may reuse them.

## Analysis Results And Artifacts

Analysis Results are durable immutable outputs. They are separate from source metadata.

New images require a new Analysis Result to join embeddings, FAISS, UMAP, clusters, atlases, and viewer data. Removed/deleted images should be hidden from active views of old results while preserving audit metadata.

Analysis Artifacts include:

- embeddings;
- FAISS indexes and ID maps;
- UMAP layouts;
- cluster/community results;
- viewer manifests;
- atlas pages and render caches;
- diagnostics;
- export packages;
- future patch-token or feature-sidecar outputs.

Artifact keys should be logical and cloud-compatible. Browser-facing payloads must not leak local absolute paths, machine usernames, temp paths, tokens, secrets, or private source-file paths.

Render caches are not analysis truth.

## Latent Space Explorer

Explorer opens completed Analysis Results. It must not generate, mutate, repair, or delete Analysis Artifacts.

FAISS over saved embeddings is similarity truth.

UMAP is navigation layout only. Screen distance must not be presented as similarity truth.

Clusters and communities are lenses. They are not objective classifications.

The Explorer must keep every image discoverable without rendering an unreadable thumbnail carpet. Use points, atlas-backed thumbnails, selected/neighbor promotion, viewport-aware detail, and zoom-dependent detail.

Display thumbnail size and atlas texture detail are separate controls. Texture LOD switches generated atlas levels such as 32px, 64px, 96px, or optional 128px; it must not resize geometry, change point placement, or change similarity semantics.

Neighborhood Layout Mode is an in-canvas comparison mode over the selected image's FAISS relations. FAISS relation rows come from the selected Analysis Result's FAISS index and ID map, not browser-side FAISS and not UMAP distance. `n` toggles the mode when an image is selected; `Escape` exits it first. 1024px previews are lazy and scoped to the selected anchor plus bounded neighbor set; the normal map uses thumbnails, atlas pages, and LOD.

Cluster/community artifacts should keep a uniform shape: method metadata, parameters, group summaries, membership/noise or unassigned semantics, and diagnostics. Diagnostics are risk flags and explanations, not a guarantee that any cluster is historically meaningful.

## Visual Association

Current thesis:

```text
global DINO finds visual families
graph bridges find outward connections
patch-level DINO can later find motifs
```

DINOv3 outputs visual features from pixels, not metadata.

FAISS over DINO vectors can support:

- literal closest-neighbor lookup;
- graph communities;
- community bridges;
- anchor-level association bridges.

Community bridges: strong DINO edges or short paths crossing graph communities.

Association bridges: selected-image relation sets that show how an anchor connects outward into another visual family.

These are visual/formal relations only unless separate metadata or generated metadata is used.

Patch-token DINO is future work. It may support region-to-region search, motif retrieval, local correspondence, and heatmap explanations. First design pass should consider 224 or 256 patch recipes before 384 because patch count and storage grow quickly.

Interpretable feature sidecars are future optional artifacts. Useful families: paper/background tone, margin ratio, blank-area ratio, edge density, line orientation, texture descriptors, contrast, palette, foreground occupancy, near-duplicate hashes. Use them for diagnostics, filtering, duplicate suppression, explanations, or reranking over DINO candidates, not as the main latent space.

## Future SigLIP2 / Fusion

SigLIP2 is a future separate image/text-aligned embedding space.

DINO and SigLIP2 must stay separate until explicit fusion or disagreement artifacts are designed.

Promising future relation families:

- `DINO close / SigLIP2 far`: formal echo.
- `DINO far / SigLIP2 close`: semantic leap.
- short association trails with visible edge types.
- named fusion recipes such as visual-leaning, balanced, semantic-leaning.

Generic averaging is not expected to produce the main surprising-association behavior by itself.

## Project Viewer Export

Project Viewer Export packages one ready Analysis Result into a portable viewer bundle for controlled hosted review.

It must exclude originals, raw provider records, secrets, local absolute paths, temp paths, and private machine details by default.

This supports ADR-0026's concierge hosted-viewer path. It does not add full SaaS, client upload, billing, teams, auth, or hosted GPU automation now.

## Security And Path Hygiene

Generated data stays out of git.

Browser APIs should expose stable IDs, logical artifact keys, and browser-safe generated assets. They should not expose arbitrary local files or machine paths.

Provider terms and rights are preserved and shown where useful, but the local MVP enforces only explicit provider-specific ingestion filters.

## Future-Only Work

Do not implement these as part of current local MVP unless a current issue explicitly pulls them in:

- full hosted SaaS;
- client self-service upload;
- multi-user auth;
- billing;
- cloud compute automation;
- whole-Library Analysis;
- arbitrary manual image subset scopes;
- patch-token generation and motif UI;
- SigLIP2 implementation;
- fusion/disagreement implementation;
- text search over embeddings;
- side-by-side Explorer comparison;
- Explorer-side artifact repair;
- loading originals for normal Explorer map use.

## Active Issue Anchors

- #286: current controlling Analysis Studio PRD.
- #192: future SigLIP2 as a separate embedding space.
- #193: future DINO/SigLIP fusion and disagreement.
- #221, #222, #223: closed graph-community, hierarchy, diagnostics history.
- Future issue needed: patch-token/region-level analysis.
- Future issue needed: interpretable visual feature sidecars.
