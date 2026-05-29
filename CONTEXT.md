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

### Search Set

A named research intent made from explicit search terms. A Search Set is what the user sees and manages.

- Example: `snake-study` with terms `snake`, `serpent`, `cobra`.
- Not: A single API call or a single import attempt.

Search Sets have a user-facing display name and a generated stable slug for paths and identifiers.

If a new Search Set request resolves to an existing slug, Anacronia should treat it as continuing or expanding the existing Search Set rather than creating a duplicate.

If an existing Search Set is continued with new terms, the new terms are added to the Search Set. Existing terms are not removed or replaced implicitly.

Search Set terms can be deactivated for future Runs. Deactivating a term does not delete already imported Image Assets or historical match records.

The interface should support adding multiple Search Set terms at once. Each line is one term, even when the term contains spaces. Quotes are not required for multi-word terms.

Search Set terms should be trimmed and deduplicated case-insensitively.

### Provider Collection

The local material accumulated for one Search Set against one Provider.

- Example: `snake-study / met`.
- Not: A separate visible search every time the user expands or resumes work.

The primary user interface should organize work by Search Set, with Provider Collections shown underneath. Provider-focused views can exist as secondary navigation.

The MVP includes a basic image grid for imported Image Assets. Advanced clustering, maps, and WebGL visualization are future work.

The MVP interface should be dense, clear, and operational. Image grid and detail views should be polished, but the immersive visual atlas is future work.

Selecting an Image Asset in the MVP grid opens a side detail panel with the `standard-1024` image and essential metadata.

The image detail panel should provide a link to open the original provider object page when available.

The image detail panel should show match information, including matched terms, verified or unverified status, and matched fields when available.

The image detail panel should show source provider rights/license information. The MVP grid does not need license badges.

The image detail panel can show when related provider images were skipped because of the per-object image limit.

### Collect

The user-facing action of building or expanding a Provider Collection from a Search Set. "Collect" is preferred over "import" in user-facing CLI and UI language when it describes the research workflow.

The MVP image grid should support simple local text search within the current collection context. Broader faceted filtering is outside the MVP.

### Run

An internal execution of a Provider Collection with a specific candidate offset, candidate limit, and term snapshot. Runs are kept for resume, audit, progress, and error handling, but the user interface should primarily show the Search Set and Provider Collection, not expose a technical list of runs.

### Candidate

A provider object returned by searching the provider with the terms from a Search Set, before Anacronia applies local filters such as public-domain status and valid image availability.

### Candidate Offset

The starting position in the deduplicated candidate list for a Run. It applies to provider candidates, not guaranteed final imported images.

### Candidate Limit

The maximum number of deduplicated provider candidates processed by a Run.

### Museum Object

A museum record for an artwork or collection object. It may have one or more related images.

### Image Asset

One image associated with a Museum Object. A single Museum Object can have multiple Image Assets.

- An Image Asset is considered imported only when both its `standard-1024` and `thumb-256` derivatives exist and pass validation.
- Future user-driven exclusion or deletion of an Image Asset is global across Anacronia, not limited to a single Search Set.

### Match

The reason a candidate is connected to a Search Set term.

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

- A Search Set can have Provider Collections for multiple Providers.
- A Provider Collection belongs to exactly one Search Set and one Provider.
- A Run belongs to one Provider Collection.
- A Museum Object belongs to one Provider.
- A Museum Object can have many Image Assets.
- A Provider Collection can include many Image Assets through their Museum Objects.
- A Museum Object or Image Asset can belong to many Search Sets without duplicating local image files.
- A Museum Object can have many Descriptors extracted from provider-specific metadata.
- An Image Asset can have many Analysis Results generated by Anacronia.

## Invariants

- The user should see one continuing Search Set/Provider Collection rather than separate visible searches for each Run.
- Anacronia should avoid duplicate visible Search Sets for the same slug; matching slugs indicate continuation unless the user explicitly creates a distinct name.
- When a Search Set is expanded after provider results have changed, Anacronia should continue importing from the current provider response without interrupting the user. Historical run details may remain available internally, but provider drift is not a blocking user-facing event.
- Candidate offset and candidate limit apply after term queries are merged, deduplicated, and ordered.
- Candidate order follows term insertion order, preserving provider order within each term and skipping duplicates already seen.
- Import progress should show candidate processing progress and completed image counts. Candidate progress drives the main progress bar; image counts show the material actually imported.
- For accepted Met material, Anacronia must require `isPublicDomain === true`.
- Anacronia stores local `standard-1024` and `thumb-256` derivatives, not full-resolution originals by default.
- User-facing imported image counts include only complete Image Assets with validated `standard-1024` and `thumb-256` derivatives.
- Missing descriptive fields such as date, artist, culture, or period do not prevent import when public-domain and image-derivative requirements are satisfied.
- The MVP should not expose destructive deletion from the interface, but the domain model should allow future user-driven global exclusion or deletion of unwanted Image Assets.
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
- The MVP supports one active collect job at a time and does not need a job queue. Starting another collect while one is active should be prevented.
- A paused collect job still owns the collect lock. The user must resume, cancel, or otherwise resolve it before starting another collect.
- The MVP should support canceling a collect job. Canceling stops future processing but keeps already completed Image Assets and metadata.
- Continuing a Search Set after cancel should propose the next candidate offset after the last processed candidate, rather than restarting the canceled range by default.
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
- Image Asset identity should be based on provider, Museum Object, and source image URL, not only on the image's position in a provider array.
- If the same source image URL appears multiple times for one Museum Object, Anacronia should create one Image Asset and prefer the `primary` role when present.
- A Met Museum Object can be imported when it has at least one valid image URL, even if `primaryImage` is missing and valid URLs appear only in `additionalImages`.
- Met `primaryImageSmall` should be stored as source metadata when available, but Anacronia should not download it as a local derivative in the MVP.
- `primaryImageSmall` should not be used as a fallback source for generating `standard-1024` or `thumb-256` in the MVP.
- For the Met MVP, raw API object records should be stored as one JSON file per Museum Object.
- If a Museum Object has multiple valid image URLs, each Image Asset is accepted or rejected independently. A failed Image Asset does not block successfully processed Image Assets from the same Museum Object.
- If an object has multiple valid image URLs, Anacronia attempts multiple Image Assets up to the configured per-object image limit. The default per-object image limit is 10 and should be exposed in the interface.
- Image URLs beyond `max_images_per_object` should remain available as metadata/skipped references, even when Anacronia does not download derivatives for them.
- For the Met provider, verified matches are checked against `title`, `objectName`, `tags`, `medium`, `culture`, `period`, `classification`, and `artistDisplayName`.
- For the Met provider, Descriptors should be extracted from a broader curated field set than verified-match fields, while avoiding noisy administrative fields.
- Raw provider records should be retained so Descriptors can be regenerated if provider mapping rules improve.
- Anacronia should support regenerating Descriptors for already imported material from retained raw provider records when provider mapping rules change.
- Future AI/OpenCV/ML outputs should be stored as separate Analysis Results, not mixed into or treated as original provider metadata.
- MVP verified-match logic uses case-insensitive substring matching, not hidden semantic expansion or language inference.
- The MVP supports text-term Search Sets only. Provider-specific structured filters such as department, date range, geography, or medium are outside the MVP.
- Anacronia should search across Descriptors when querying imported local collections.
- Local post-import search should use canonical fields and Descriptors, not arbitrary raw provider JSON in the MVP.
- The MVP is a local testing/research tool and does not enforce provider terms beyond provider-specific ingestion filters that Anacronia explicitly implements. Users are responsible for deciding which providers and materials they use.

## Open Questions

- How should Anacronia balance a shared cross-provider model with provider-specific metadata that should not be flattened away?
- Should Anacronia exclude or restrict future providers whose terms prohibit persistent local storage or local copies of images?
