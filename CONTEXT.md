# Context

## Purpose

Anacronia is a local-first tool for building museum image collections that can later support visual analysis, machine learning, OpenCV workflows, clustering, and richer semantic annotation. Its first capability is fast, reliable local ingestion of public-domain museum records and image derivatives.

Anacronia is a single-user local application in the MVP.

## Glossary

### Anacronia

The project and product name. It replaces the earlier working name "OpenMuseum".

### Provider

A museum or cultural data source that exposes collection records and image references, such as the Met, Europeana, or the V&A.

When available, provider record versioning or timestamp fields should be retained, such as the Met `metadataDate`.

Online Providers can have provider-specific terms, rights statements, and reuse expectations. Anacronia should preserve provider source statements and may show provider-specific notices, but it is a private local testing/research tool and does not enforce provider terms beyond provider-specific ingestion filters that Anacronia explicitly implements.

The Met is the MVP permanent local-ingestion Provider. V&A is the next museum Provider to use for testing the multi-provider scaffolding. For that test, V&A should create the same local `standard-1024` and `thumb-256` derivatives as Met so the shared Collection, User Library, export, curation, and future analysis paths can be exercised.

### User-Imported Local Material

Images that the user imports from their own computer are private local material. Examples include a plain folder of images, a later Are.na export folder, or a later Instagram extension export folder.

User-imported local material is not subject to Anacronia's online Provider rights eligibility gates. Anacronia does not need to determine whether this material is public domain, copyright-cleared, or reusable. The first user-import workflow should accept a plain folder of image files without requiring metadata, manifest files, source URLs, or rights declarations.

User-imported local material still needs stable local identity, derivative generation, Collection Membership, User Library visibility, curation actions, export support, and future Analysis Results.

### Source Type

The kind of source that produced local material.

Current source types are:

- `online-provider`: museum Provider material created through Provider Search, with Provider IDs such as `met` and `vam`.
- `local-folder`: the first User-Imported Local Material workflow, created from image files on the user's computer.

Future Are.na, Instagram, or similar workflows should introduce explicit source types or source keys instead of pretending to be museum Providers.

Source type should appear in User Library facets, exports, and architecture decisions where Met, V&A, local-folder material, and future sources need to be distinguished.

### Source Identity

A stable identity for local material that is not based on volatile database row IDs.

Online Provider material uses Provider plus provider object identity, with Image Assets additionally keyed by provider/source image identity. User-Imported Local Material uses a local source namespace plus generated local object/image identities and private source-file provenance.

Collection Membership, Collection Exclusions, Favorites, delete, re-import, cross-Collection views, and exports should use Source Identity where durable identity matters.

### Collection

A named research intent. A Collection is what the user sees and manages.

Online Provider Search Collections are made from explicit search terms. User-imported local folder Collections can be made from a title and a folder path without search terms, because the imported files may have no useful metadata.

- Example: `snake-study` with terms `snake`, `serpent`, `cobra`.
- Not: A single API call or a single import attempt.

Collections have a user-facing display name and a generated stable slug for paths and identifiers.

In user-facing workspace design, a Collection is the working dataset: the accumulated material for that research intent across one or more Providers. Provider Sources are source-specific lanes within that working dataset. Exports are outputs from a Collection or Provider Source, not the canonical dataset itself.

The user interface may also expose a User Library view for searching and filtering across all locally collected Image Assets, regardless of Collection. The User Library is a cross-Collection discovery view; it does not replace Collections as the primary way to organize research intent.

No draft Collection is saved before the user starts the first search.

When the user starts the first online Provider Search, the Collection is created and its MVP definition is locked: title, terms, and initial Provider Source are not edited, replaced, appended, or deactivated in the MVP.

When the user imports a local folder as a new Collection, the Collection is created and its MVP definition is locked as title plus the `local-folder` source. It has no provider search terms unless a future workflow explicitly adds online Provider Sources to the same Collection.

If a new Collection request resolves to an existing slug, Anacronia should avoid creating a duplicate and must not silently mutate the locked Collection definition.

Future workflows may support editing titles, adding terms, deactivating terms, or adding another Provider Source to an existing locked Collection. Those workflows are outside the MVP and must preserve historical search state.

The online Provider Search interface should support adding multiple Collection terms at once. Each line or comma-separated segment is one term, even when the term contains spaces. Quotes are not required for multi-word terms.

Collection terms should be trimmed and deduplicated case-insensitively.

### Provider Source

The local material accumulated for one Collection against one Provider.

- Example: `snake-study / met`.
- Not: A separate visible search every time the user expands or resumes work.

The primary user interface should organize work by Collection, with Provider Sources shown underneath. Provider-focused views can exist as secondary navigation.

The MVP includes a basic object-first grid for downloaded Museum Objects. Advanced clustering, maps, and WebGL visualization are future work.

The MVP interface should be dense, clear, and operational. Image grid and detail views should be polished, but the immersive visual atlas is future work.

Selecting a Museum Object tile in the MVP Collection grid opens a detail overlay with the `standard-1024` image carousel and essential metadata.

The image detail panel should provide a link to open the original provider object page when available.

The image detail panel should show match information, including matched terms, verified or unverified status, and matched fields when available.

The image detail panel should show source provider rights/license information. The MVP grid does not need license badges.

The image detail panel can show when related provider images were skipped because of the per-object image limit.

### Collection Creation Workflow

The New Collection view starts with two trajectories:

- `Online archive`: create a Collection by searching an online Provider. The user enters a Collection title, search keywords, a required Provider selection, and a target number of images. The Provider dropdown has no default selection and shows `Choose provider` until the user selects one. The available providers are Met and V&A for now.
- `Local folder`: create a Collection by importing image files from a folder on the user's computer. The user enters a Collection title and folder path. No keywords, Provider Search batch target, source URL, manifest, metadata, or rights declaration is required.

These trajectories should stay visibly distinct because they have different state, eligibility, metadata, rights, progress, and failure behavior.

### Provider Search

The user-facing action of building or extending a Provider Source from a locked Collection definition.

Primary UI labels are `Start search`, `Stop search`, `Resume search`, and `Keep searching`. The term `collect` can remain in internal code, CLI, or technical documentation where it describes the ingestion pipeline, but it should not be used for primary workflow buttons.

Local result search within a Collection is deferred beyond the New Collection workflow. Broader faceted filtering is outside the MVP.

Provider Search applies to online Providers that Anacronia queries directly. Importing a local folder from the user's computer is not a Provider Search and does not use provider candidates, provider rights filters, provider API backoff, Provider Search batch targets, or provider cache rules.

### Run

An internal execution of a Provider Source with a specific candidate cursor, candidate processing limits, user-selected batch target, and term snapshot. Runs are kept for resume, audit, progress, and error handling, but the user interface should primarily show the Collection and Provider Source, not expose a technical list of runs.

### Candidate

A provider object returned by searching the provider with the terms from a Collection, before Anacronia applies local filters such as public-domain status and valid image availability.

### Candidate Offset

The internal starting position in the deduplicated candidate list for a Run. It applies to provider candidates, not guaranteed final downloaded images, and is not shown in the primary MVP UI.

### Candidate Limit

An internal processing limit over deduplicated provider candidates. The primary MVP UI instead shows a batch dropdown for target usable downloaded results.

### Museum Object

A museum record for an artwork or collection object. It may have one or more related images.

### Image Asset

One image associated with a Museum Object. A single Museum Object can have multiple Image Assets.

- An Image Asset is considered imported only when both its `standard-1024` and `thumb-256` derivatives exist and pass validation.

Collection grids are object-first: one visible grid tile represents one Museum Object with at least one downloaded Image Asset. When a Museum Object has multiple downloaded sibling Image Assets, the tile shows a carousel indicator and the detail overlay provides carousel navigation. The User Library may remain image-first when it is implemented as a cross-Collection asset view.

### Collection Membership

The current inclusion of a Museum Object or Image Asset in a Collection.

Collection Membership is separate from Run history. Runs explain how material was found; Collection Membership decides what is currently visible in a Collection.

Removing material from one Collection does not remove it from User Library, other Collections, local files, or canonical provider records.

### Collection Exclusion

A Collection-scoped rule that prevents a Museum Object or Image Asset from being downloaded, imported, reactivated, or automatically added through that same Collection again.

`Remove from Collection` creates a Collection Exclusion.

Collection Exclusions are not global. They do not prevent other Collections from adding or keeping the same Museum Object or Image Asset.

Collection Exclusions use Source Identity, not local database row identity. Online Provider object exclusions are keyed by Collection, Provider, and provider object ID. Online Provider image exclusions are keyed by Collection, Provider, provider object ID, and source image identity. Local-folder exclusions use local Source Identity.

### Favorite

A global user curation mark on a Museum Object or Image Asset.

Favorite state is not Collection-scoped. A favorited Museum Object or Image Asset appears as favorited anywhere the same identity is visible.

Favorites can be filtered in User Library and within Collection views. Collection favorite filters show favorited material that belongs to the current Collection; they do not pull unrelated User Library material into the Collection.

Favorites use Source Identity, not local database row identity. Deleting a Museum Object or Image Asset removes matching favorite records.

### Orphan Local Material

Active local material with no Collection Membership.

An orphan Museum Object has no Collection Membership and at least one active Image Asset. An orphan Image Asset has no Collection Membership.

Orphan local material remains visible in User Library with the label `No Collection`. It can be selected, favorited, exported, or deleted.

### Match

The reason a candidate is connected to a Collection term.

### Descriptor

A normalized descriptive term extracted from provider-specific fields. Descriptors make cross-provider searching possible without pretending that every provider has the same metadata fields.

- Examples: Met tag terms, Met object names, V&A categories, V&A content terms, Europeana concept labels, Europeana subject fields.
- Descriptors should retain their provider source field so Anacronia can explain where a term came from.
- Descriptor extraction and descriptor type assignment should be driven by explicit provider mapping rules, not AI interpretation.
- Not: A guarantee that every concept present in an artwork is discoverable; descriptors are limited to exposed and mapped provider metadata.

### Analysis Result

Metadata generated by Anacronia through image analysis, AI, machine learning, OpenCV, embeddings, or similar processes. Analysis Results are separate from provider metadata and must not overwrite or blur the provenance of provider records.

### Verified Match

A match where the term appears in local fields inspected by Anacronia, such as title, object name, tags, medium, culture, period, or artist display name.

- Matching is case-insensitive substring matching in the MVP.

### Unverified Match

A match where the provider returned the candidate for a term, but Anacronia cannot find the term in its inspected local fields.

### Public-Domain Material

Material accepted for ingestion only when the provider record states that it is public domain or otherwise satisfies the provider-specific public-domain rule.

The Met MVP uses strict public-domain filtering. Future providers may use broader provider-specific reusable/open filters, such as Europeana open reusability.

The source provider rights/license statement must be stored and shown in image detail views and exports.

Public-domain eligibility is an online Provider ingestion rule, not a rule for user-imported local material. User-imported local material may be private, self-authored, copyrighted, unattributed, or otherwise unknown; Anacronia stores and visualizes it locally without trying to resolve its IP status.

For V&A, Anacronia should retain source rights/copyright/API-term statements when available and eventually show a non-blocking provider notice about V&A timing and API-use expectations. That notice should inform the user; it should not prevent private local derivative generation for the V&A test importer.

### Standard-1024

The primary local image derivative used for analysis and richer display. It has a 1024-pixel long edge, JPEG format, and quality 90.

### Thumb-256

A small local image derivative for grids, lists, and dense visual overviews. It has a 256-pixel long edge, JPEG format, and quality 75.

### Export

A user-facing output of imported material. Exports should include successfully imported material, not failed candidates or skipped technical records.

Exports can be manifests containing metadata and local paths, or complete packages containing image files plus metadata.

The primary export format is JSONL. CSV is supported as a simplified companion format for quick inspection and spreadsheet workflows.

The primary export unit is the Image Asset: one exported row or JSONL object per imported image, with linked Museum Object metadata included or referenced.

## Relationships

- A Collection can have Provider Sources for multiple Providers.
- A Provider Source belongs to exactly one Collection and one Provider.
- A Run belongs to one Provider Source.
- A Museum Object belongs to one Provider.
- A Museum Object can have many Image Assets.
- A Provider Source can include many Museum Objects and Image Assets.
- A Museum Object or Image Asset can belong to many Collections without duplicating local image files.
- A Collection Membership belongs to one Collection and one Museum Object or Image Asset.
- A Collection Exclusion belongs to one Collection and one Museum Object or Image Asset.
- A Favorite belongs to one Museum Object or Image Asset and is global across Anacronia.
- A Museum Object can have many Descriptors extracted from provider-specific metadata.
- An Image Asset can have many Analysis Results generated by Anacronia.

## Invariants

- The New Collection view should first ask the user to choose between `Online archive` and `Local folder`.
- Online archive creation should require the user to explicitly choose a Provider; no online Provider is selected by default.
- The user should see one locked Collection and Provider Source rather than separate visible searches for each Run.
- Anacronia should avoid duplicate visible Collections for the same slug; matching slugs must not silently mutate an existing locked Collection definition.
- Starting the first online Provider Search creates the Collection and locks its title, terms, and initial Provider Source for the MVP.
- Importing a local folder as a new Collection creates the Collection and locks its title plus `local-folder` source for the MVP; terms may be empty.
- User-facing batch size means target usable downloaded results, not provider candidates processed. The MVP batch dropdown values are `5`, `10`, `20`, `30`, `100`, `500`, and `1000`, defaulting to `10`.
- Candidate offset and candidate limit remain internal Run mechanics and apply after term queries are merged, deduplicated, and ordered.
- Candidate order follows term insertion order, preserving provider order within each term and skipping duplicates already seen.
- Search feedback should show the search state plus stable `Objects` and `Images` counters. The MVP should not show percentage progress or candidate counts in the primary UI.
- `Objects` counts Museum Objects with at least one successfully downloaded Image Asset. `Images` counts complete Image Assets with validated `standard-1024` and `thumb-256` derivatives.
- For accepted Met material, Anacronia must require `isPublicDomain === true`.
- For V&A testing, Anacronia should create permanent local `standard-1024` and `thumb-256` derivatives like Met, retain source records where useful for audit/descriptor regeneration, and show a future non-blocking provider notice about V&A API-use expectations.
- Anacronia stores local `standard-1024` and `thumb-256` derivatives, not full-resolution originals by default.
- User-imported local folders are private local material. They do not require provider metadata, public-domain checks, rights declarations, source URLs, manifests, provider records, search keywords, or Provider Search batch targets.
- User-facing imported image counts include only complete Image Assets with validated `standard-1024` and `thumb-256` derivatives.
- Missing descriptive fields such as date, artist, culture, or period do not prevent import when public-domain and image-derivative requirements are satisfied.
- The MVP should not expose destructive deletion from the interface, but the domain model should allow future user-driven curation actions.
- `Remove from Collection` removes a Museum Object or Image Asset from the current Collection only and creates a Collection Exclusion so future Provider Searches for that Collection do not download, import, reactivate, or automatically add it through that Collection again.
- `Delete` removes selected local material globally from User Library and all Collections, removes local files and database rows where no active material needs them, and does not delete exports.
- `Delete` does not create a global never-import-again rule. A future Provider Search may import the same Museum Object or Image Asset again.
- `Delete` keeps Run history and matches as audit history, while active views ignore deleted material.
- Deleted Museum Objects and Image Assets should be marked inactive/deleted rather than physically removing every row needed for audit integrity. Local image files should still be deleted.
- Re-importing deleted material should reactivate or update the old inactive Source Identity row rather than creating a duplicate active row.
- Collection Exclusions survive global delete so prior per-Collection removal intent still applies if the material is re-imported later.
- Orphan local material remains visible in User Library as `No Collection`.
- Favorites are global and filterable in User Library and Collection views.
- Deleting a whole Collection deletes non-favorite exclusive material, preserves shared material, preserves favorited exclusive material in User Library as `No Collection`, and deletes that Collection's Collection Exclusions.
- Explicit Collection Membership should be backfilled from existing Run/match-derived visibility when the curation model is introduced.
- Provider Search should skip Collection Exclusions before download/import/reactivation for that Collection and should create Collection Membership for matched imported material only when no Collection Exclusion applies.
- Exports should contain imported Image Assets and their metadata, not failed or skipped candidates.
- MVP export should support a lightweight manifest path and allow a complete package workflow when needed.
- Database backup and restore from the user interface are outside the MVP.
- GitHub MVP installation can be terminal-based, but documentation should be detailed enough for non-technical Mac users. A packaged installer or desktop app is future work.
- MVP setup should provide a guided setup script and documented manual steps for users who prefer transparency or need to debug installation.
- The MVP targets Apple Silicon Macs, M1 or newer. Intel Mac support is outside the MVP.
- The MVP developer/user setup can use `uv` for Python dependencies and `npm` for the web frontend.
- Homebrew can be used when available during Mac setup, but installation docs should include alternatives or explain what to do when Homebrew is absent.
- The MVP web interface should use shadcn/ui components.
- The MVP frontend should use Next.js with shadcn/ui, keeping FastAPI as the local backend/API and Python as the worker/image-processing layer.
- Next.js should act as a lightweight UI/API gateway where useful, proxying application calls to FastAPI instead of requiring the browser UI to know every FastAPI endpoint directly.
- The user-facing local URL should use one public UI port, defaulting to `localhost:18660`. FastAPI can run on an internal local port, defaulting to `18670`. Both should use incremental fallback if occupied.
- The worker should run while Anacronia is open and remain idle when there are no jobs, rather than being launched only for individual collect actions.
- The MVP supports one actively running Provider Search at a time and does not need a job queue.
- The search lock is held only while a Provider Search is searching or stopping at a safe checkpoint.
- A stopped or paused/error Provider Search is a parked resumable job and does not block other work.
- A parked Provider Search can be resumed only when no other Provider Search is searching or stopping.
- The MVP should support `Stop search` as a normal user action. Stopping finishes the current Museum Object safely, preserves completed material, and can later be resumed.
- Resuming or keeping a search going should continue from the next safe internal candidate cursor rather than restarting already processed provider records by default.
- Provider record timestamps or versions should be stored when available.
- Future export workflows may optionally fetch or package provider full-resolution images for imported Image Assets, but this is outside the MVP.
- Full-resolution originals are temporary inputs for derivative generation and are deleted after successful processing. Before deletion, Anacronia should capture original technical metadata such as width and height.
- The MVP does not require image file hashes. File validation can rely on existence, readable image files, derivative dimensions, and stored processing settings.
- Import performance should prioritize correctness, provider tolerance, resumability, and robustness over speed. Overnight or long-running collects are acceptable when needed.
- Repeated provider or download failures should trigger progressive slowdown/backoff first, then automatic pause if failures continue past a configured threshold.
- MVP completion and pause status can be shown in the UI and logs. macOS notifications are future work.
- Multi-user profiles, authentication, and permission management are outside the MVP.
- The MVP interface should expose only common operational settings. Advanced settings such as port, concurrency, image quality, and disk thresholds can live in configuration files.
- The default data directory is `./data` inside the Anacronia project root. It can be overridden in configuration for future storage needs such as external disks.
- File storage should prefer human-readable provider-specific layouts when possible. For Met objects, use numeric range folders and per-object image folders, such as `raw-api/objects/436000-436999/436535.json` and `images/436000-436999/436535/primary-standard-1024.jpg`. Opaque hash sharding is a fallback for providers with unsuitable IDs or URLs.
- Local image derivative filenames should be standardized and short, such as `primary-standard-1024.jpg` and `additional-001-thumb-256.jpg`. Source image filenames and URLs belong in metadata.
- Image Asset identity should be based on Source Identity, not only on the image's position in a provider array or on local database row IDs.
- If the same source image URL appears multiple times for one Museum Object, Anacronia should create one Image Asset and prefer the `primary` role when present.
- A Met Museum Object can be imported when it has at least one valid image URL, even if `primaryImage` is missing and valid URLs appear only in `additionalImages`.
- Met `primaryImageSmall` should be stored as source metadata when available, but Anacronia should not download it as a local derivative in the MVP.
- `primaryImageSmall` should not be used as a fallback source for generating `standard-1024` or `thumb-256` in the MVP.
- For the Met MVP, raw API object records should be stored as one JSON file per Museum Object.
- If a Museum Object has multiple valid image URLs, each Image Asset is accepted or rejected independently. A failed Image Asset does not block successfully processed Image Assets from the same Museum Object.
- If an object has multiple valid image URLs, Anacronia attempts multiple Image Assets up to the MVP per-object image limit of 3. This limit is enforced by the system and is not exposed as a user-facing control in the MVP.
- Image URLs beyond the per-object image limit should remain available as metadata/skipped references, even when Anacronia does not download derivatives for them.
- For the Met provider, verified matches are checked against `title`, `objectName`, `tags`, `medium`, `culture`, `period`, `classification`, and `artistDisplayName`.
- For the Met provider, Descriptors should be extracted from a broader curated field set than verified-match fields, while avoiding noisy administrative fields.
- Raw provider records should be retained so Descriptors can be regenerated if provider mapping rules improve.
- Anacronia should support regenerating Descriptors for already imported material from retained raw provider records when provider mapping rules change.
- Future AI/OpenCV/ML outputs should be stored as separate Analysis Results, not mixed into or treated as original provider metadata.
- MVP verified-match logic uses case-insensitive substring matching, not hidden semantic expansion or language inference.
- The MVP supports text-term Collections only. Provider-specific structured filters such as department, date range, geography, or medium are outside the MVP.
- Anacronia should search across Descriptors when querying imported local Collections.
- Local post-import search should use canonical fields and Descriptors, not arbitrary raw provider JSON in the MVP.
- The MVP is a local testing/research tool and does not enforce provider terms beyond provider-specific ingestion filters that Anacronia explicitly implements. Users are responsible for deciding which providers and materials they use.

## Open Questions

- What portable library backup/restore format is needed beyond dataset exports?
- What packaged Mac app distribution, signing/notarization, data-root, and update model should replace terminal-first setup after the MVP?
- Which future Providers should be rejected, warned, or admitted when their terms restrict persistent local copies? Decide this per Provider ADR before implementation.
