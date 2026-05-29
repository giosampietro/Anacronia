# Anacronia MVP PRD

## Problem Statement

Researchers, artists, and technically curious users need a reliable way to build local museum image collections for later visual analysis, AI, OpenCV, machine learning, clustering, and semantic enrichment. Existing museum APIs expose useful data, but each provider has different fields, image rules, rights metadata, and search behavior. Manually reviewing thousands of records before download is too slow, while naive scraping creates fragile datasets, duplicated files, unclear provenance, and inconsistent image quality.

Anacronia should solve the first stage of this workflow: collect museum records and images locally in a controlled, resumable, transparent, Mac-first system. The MVP focuses on the Met as the first provider, while keeping the domain model flexible enough for Europeana, V&A, and other providers later.

## Solution

Anacronia will be a local-first collection builder. It will let the user define a Collection made of explicit terms, collect matching Met records, filter to eligible public-domain material, download source images temporarily, generate local `standard-1024` and `thumb-256` derivatives, store raw provider records, extract Descriptors from provider-specific metadata, and expose the resulting Image Assets in a dense operational web interface.

The user will run Anacronia locally from the terminal. A single command will start the Next.js interface, FastAPI backend, and Python worker. The browser UI will open on `localhost:18660` when available. The worker will process one collect job at a time, prioritizing correctness, resumability, provider tolerance, and data integrity over raw speed.

The MVP will not try to become the future visual atlas. It will provide the operational foundation: create and continue Collections, monitor progress, inspect imported Image Assets, view details and source metadata, search locally across canonical fields and Descriptors, and export imported Image Assets as JSONL/CSV or complete packages.

## User Stories

1. As a local Anacronia user, I want to run one command to start the application, so that I do not need to manually start several services.
2. As a local Anacronia user, I want the application to open in my browser, so that I can control collect jobs through a visual interface.
3. As a local Anacronia user, I want the default URL to be stable, so that I can return to `localhost:18660` predictably.
4. As a local Anacronia user, I want the app to fall back to a free port if the default is busy, so that startup does not fail unnecessarily.
5. As a local Anacronia user, I want all project code and data to live under one Anacronia root by default, so that the project is easy to move, archive, and understand.
6. As a local Anacronia user, I want `./data` to be configurable, so that I can move large datasets to an external disk later.
7. As a non-technical Mac user, I want a guided setup script, so that I can install the project with minimal manual setup.
8. As a technical user, I want documented manual setup steps, so that I can debug installation issues.
9. As a GitHub user, I want the repository to exclude generated data, so that cloning the project does not download someone else's dataset.
10. As a collection builder, I want to create a Collection with a readable name, so that my research intent is clear.
11. As a collection builder, I want Collection names to generate stable slugs, so that folders and identifiers remain clean.
12. As a collection builder, I want reusing the same Collection name to continue the existing Collection, so that I do not create duplicate visible searches.
13. As a collection builder, I want adding new terms to an existing Collection to append terms, so that previous terms are not lost.
14. As a collection builder, I want to deactivate terms for future Runs, so that I can refine a Collection without deleting historical data.
15. As a collection builder, I want to paste multiple terms at once, so that I can create Collections quickly.
16. As a collection builder, I want each input line or comma-separated segment to be treated as one term even if it contains spaces, so that terms like `garden snake` work without quotes.
17. As a collection builder, I want duplicate terms to be deduplicated case-insensitively, so that repeated terms do not create duplicate provider queries.
18. As a collection builder, I want terms to run as separate provider searches, so that Anacronia can record which terms matched which records.
19. As a collection builder, I want provider candidates from multiple terms to be merged and deduplicated before offset and limit are applied, so that `limit` means candidate objects, not candidates per term.
20. As a collection builder, I want candidate order to follow term insertion order and provider order, so that early terms define priority.
21. As a collection builder, I want to set offset and limit for a collect job, so that I can collect the first 1,000 candidates and continue later.
22. As a collection builder, I want Continue to propose the next candidate offset, so that expanding an existing Collection is easy.
23. As a collection builder, I want offset and limit to apply to provider candidates, so that the collect operation is reproducible and explainable.
24. As a collection builder, I want the UI to hide technical Run complexity by default, so that I see one continuing Collection rather than many internal executions.
25. As a collection builder, I want technical details to remain available, so that progress, errors, and resumes can be audited.
26. As a collection builder, I want Anacronia to collect immediately without manual pre-review, so that large searches do not require me to inspect thousands of records.
27. As a collection builder, I want only public-domain Met records to be accepted in the MVP, so that the first provider has a clear rights rule.
28. As a collection builder, I want future providers to use provider-specific eligibility rules, so that Europeana-style open/reusable records can be handled later.
29. As a collection builder, I want source rights and license statements stored, so that each imported Image Asset retains provenance.
30. As a collection builder, I want the image detail panel to show source rights/license information, so that I can understand the origin of each asset.
31. As a collection builder, I want Anacronia to store raw provider records, so that data can be audited and reprocessed later.
32. As a collection builder, I want Met raw records stored as one JSON file per Museum Object, so that individual records are easy to inspect.
33. As a collection builder, I want a human-readable Met file layout, so that I can browse data folders manually if needed.
34. As a collection builder, I want Met object files grouped into numeric range folders, so that directories remain manageable without becoming opaque.
35. As a collection builder, I want per-object image folders, so that all derivatives for one Museum Object are easy to find.
36. As a collection builder, I want source image filenames and URLs stored in metadata, so that local derivative filenames can stay short and stable.
37. As a collection builder, I want local image filenames standardized, so that the filesystem is predictable.
38. As a collection builder, I want Image Asset identity based on provider, Museum Object, and source image URL, so that additional image order changes do not create duplicates.
39. As a collection builder, I want duplicate source image URLs within an object deduplicated, so that the same image is not stored twice.
40. As a collection builder, I want Anacronia to import Met objects with valid additional images even when `primaryImage` is missing, so that useful images are not discarded.
41. As a collection builder, I want Met `primaryImageSmall` stored as metadata but not downloaded, so that source information is preserved without redundant local files.
42. As a collection builder, I want `primaryImageSmall` not used as fallback for failed source downloads, so that local image quality stays consistent.
43. As a collection builder, I want valid images on an object attempted up to the MVP per-object image limit, so that additional views are considered without exploding collect size.
44. As a collection builder, I want the MVP per-object image limit to be 3 and not exposed as a routine UI control, so that collection setup stays simple.
45. As a collection builder, I want image URLs beyond the per-object limit stored as skipped references, so that I know more images exist.
46. As a collection builder, I want the detail panel to show when related images were skipped by limit, so that I understand incomplete object image coverage.
47. As a collection builder, I want each Image Asset accepted independently, so that one failed image does not block other images from the same Museum Object.
48. As a collection builder, I want an Image Asset to count as imported only when both derivatives are valid, so that imported counts represent usable local images.
49. As a collection builder, I want `standard-1024` generated for each imported Image Asset, so that I have one consistent local image for analysis and detailed viewing.
50. As a collection builder, I want `thumb-256` generated for each imported Image Asset, so that grids and dense views are fast.
51. As a collection builder, I want source originals deleted after derivative generation, so that disk usage remains controlled.
52. As a collection builder, I want original image width and height captured before deletion, so that technical source metadata is retained.
53. As a collection builder, I want Anacronia to validate local derivatives by readability, dimensions, and processing settings, so that corrupt partial files do not count as imported.
54. As a collection builder, I do not need file hashes in the MVP, so that implementation remains simpler.
55. As a collection builder, I want missing descriptive fields to be allowed, so that records without artist/date/culture are not discarded when images are valid.
56. As a collection builder, I want provider timestamps such as Met `metadataDate` retained, so that I know when provider metadata was current.
57. As a collection builder, I want Anacronia to extract Descriptors from provider-specific fields, so that local search can work across metadata shapes.
58. As a collection builder, I want Descriptors to keep their source field, so that Anacronia can explain where a term came from.
59. As a collection builder, I want Descriptor extraction driven by explicit provider mappings, so that the system is deterministic and not dependent on AI interpretation.
60. As a collection builder, I want raw provider records retained for Descriptor regeneration, so that improved mappings can update existing collections.
61. As a collection builder, I want a command to rebuild Descriptors, so that metadata improvements can be applied after collection.
62. As a collection builder, I want verified matches recorded when terms appear in inspected fields, so that I can understand why a record was collected.
63. As a collection builder, I want unverified matches retained when provider search returns records but the term is not visible in inspected fields, so that provider internal matching is not lost.
64. As a collection builder, I want verified-match logic to use simple case-insensitive substring matching, so that matching is transparent.
65. As a collection builder, I want Met verified matches checked against title, object name, tags, medium, culture, period, classification, and artist display name, so that obvious match reasons are captured.
66. As a collection builder, I want Met Descriptors extracted from a broader curated field set than verified matching, so that later local search is richer.
67. As a collection builder, I want local post-import search across canonical fields and Descriptors, so that I can find material after collection.
68. As a collection builder, I do not want MVP local search over arbitrary raw provider JSON, so that results remain explainable and not noisy.
69. As a collection builder, I want one active collect job at a time, so that the MVP remains stable and provider-friendly.
70. As a collection builder, I want no job queue in the MVP, so that system behavior stays simple.
71. As a collection builder, I want a paused job to keep the collect lock, so that I must resolve it before starting another collect.
72. As a collection builder, I want to pause and resume a collect job, so that long-running operations can be controlled.
73. As a collection builder, I want to cancel a collect job, so that a mistaken query does not block the system.
74. As a collection builder, I want canceling a collect job to preserve completed images, so that already collected data is not lost.
75. As a collection builder, I want continuing after cancel to propose the next candidate offset, so that I do not repeat processed candidates by default.
76. As a collection builder, I want progress shown by candidate processing and completed image counts, so that I understand both workflow progress and actual material collected.
77. As a collection builder, I want repeated provider failures to trigger slowdown and then pause, so that provider throttling does not cause uncontrolled failure.
78. As a collection builder, I want long-running or overnight collects to be acceptable, so that robustness takes priority over speed.
79. As a collection builder, I want disk space checked before and during collect jobs, so that the system does not fill my disk.
80. As a collection builder, I want Anacronia to show status and logs in the MVP, so that I can understand completion, pauses, and errors.
81. As a collection builder, I do not need macOS notifications in the MVP, so that the first version stays focused.
82. As a collection builder, I want a dense operational dashboard, so that collect state and controls are easy to scan.
83. As a collection builder, I want Collections as the primary navigation, so that the UI follows my research themes.
84. As a collection builder, I want provider sources shown underneath Collections, so that later multi-provider work remains organized.
85. As a collection builder, I want provider-first views available secondarily, so that I can inspect work by museum when needed.
86. As a collection builder, I want a basic image grid in the MVP, so that I can quickly see what was collected.
87. As a collection builder, I want the grid to be functional and dense, so that it behaves like an operational tool rather than a finished visual atlas.
88. As a collection builder, I want image details in a side panel, so that browsing remains fast without navigating away.
89. As a collection builder, I want the side panel to show `standard-1024`, essential metadata, source links, match info, and license info, so that each Image Asset is inspectable.
90. As a collection builder, I want a button to open the provider object page, so that I can verify source context.
91. As a collection builder, I want simple local text search inside the current Collection context, so that I can narrow visible Image Assets.
92. As a collection builder, I do not need advanced faceted filtering in the MVP, so that the interface remains focused.
93. As a collection builder, I want exports to include only imported material, so that exported datasets are clean.
94. As a collection builder, I want export rows to be Image Assets, so that multi-image Museum Objects produce one record per usable image.
95. As a collection builder, I want JSONL as the primary export format, so that large datasets are easy to process in Python.
96. As a collection builder, I want CSV as a simplified companion export, so that I can inspect data in spreadsheet tools.
97. As a collection builder, I want optional complete export packages with images plus metadata, so that I can move or share a collected dataset.
98. As a collection builder, I want future full-resolution export workflows possible, so that I can later package provider full-res images for already collected assets.
99. As a future analyst, I want AI/OpenCV/ML outputs stored as separate Analysis Results, so that generated data never overwrites provider metadata.
100. As a future analyst, I want Image Assets to support many Analysis Results, so that multiple analysis pipelines can coexist.
101. As a future user, I want unwanted Image Assets to be globally excludable or deletable later, so that manual curation can remove material I do not want.
102. As an MVP user, I do not want destructive deletion exposed yet, so that the first version avoids dangerous data loss.
103. As a developer, I want a Provider Adapter interface, so that Met, Europeana, V&A, and future sources can share collection workflows.
104. As a developer, I want provider-specific metadata preserved, so that Anacronia does not flatten away useful fields.
105. As a developer, I want a small canonical model, so that the UI and exports work across providers without pretending all museums share one schema.
106. As a developer, I want provider mapping files, so that Descriptor extraction can evolve without rewriting the pipeline.
107. As a developer, I want Next.js as the frontend, so that the UI has a better path toward future online deployment.
108. As a developer, I want shadcn/ui components, so that the interface uses consistent, maintainable UI primitives.
109. As a developer, I want Next.js to proxy calls to FastAPI where useful, so that the browser UI does not need to know every backend endpoint directly.
110. As a developer, I want FastAPI and Python workers, so that image processing and future OpenCV/ML work stay in the Python ecosystem.
111. As a developer, I want `uv` for Python dependencies and `npm` for the frontend, so that setup remains modern and straightforward.
112. As a developer, I want Homebrew support when available but not an unexplained hard dependency, so that Mac setup can handle different users.
113. As a future project maintainer, I want a terminal-based MVP install with strong documentation, so that the GitHub project is usable before a packaged installer exists.
114. As a future project maintainer, I want installer/desktop packaging left as future work, so that MVP development does not get blocked by packaging.

## Implementation Decisions

- Build Anacronia as a single-user local application for Apple Silicon Mac-first use, targeting M1 or newer Macs in the MVP.
- Keep all project code and default data under one Anacronia project root, with `./data` as the default data directory and config override support for larger storage needs.
- Use `localhost:18660` as the default user-facing UI port, with incremental fallback. Use an internal FastAPI port defaulting to `18670`, also with fallback.
- Use Next.js for the frontend and shadcn/ui for interface components.
- Use Next.js route handlers as a lightweight UI/API gateway that proxies application calls to FastAPI where useful.
- Use FastAPI for the local backend API.
- Use a Python worker for collect jobs, image processing, descriptor rebuilding, and future OpenCV/ML paths.
- Use SQLite as the local operational database.
- Use `uv` for Python dependency management and `npm` for frontend dependencies.
- Provide a guided setup script plus documented manual setup.
- Use Homebrew if available, but document alternatives or remediation when absent.
- Prefer user-facing language `collect` over `import` for collection-building workflows.
- Expose CLI commands such as `anacronia`, `anacronia collect`, `anacronia status`, `anacronia pause`, `anacronia resume`, and `anacronia rebuild-descriptors`.
- Start Next.js, FastAPI, and the worker through a single `anacronia` command.
- Keep the worker running while Anacronia is open, idle when no job exists.
- Support one active collect job at a time in the MVP.
- Do not implement a job queue in the MVP.
- Prevent starting a new collect while a job is active or paused.
- Support canceling a collect job; cancel stops future work, preserves completed Image Assets, and frees the collect lock.
- Continuing after cancel should propose the next candidate offset after the last processed candidate.
- Define the domain model around Collection, Provider Source, Run, Candidate, Museum Object, Image Asset, Descriptor, Match, Verified Match, Unverified Match, Standard-1024, Thumb-256, Export, and Analysis Result.
- Make Collections user-visible research intents with display names and stable slugs.
- Treat matching Collection slugs as continuation rather than duplicate creation unless a user explicitly creates a distinct name.
- Add new terms to an existing Collection rather than replacing prior terms.
- Allow terms to be deactivated for future Runs without deleting existing material or historical matches.
- Parse multiline and comma-separated term input as one term per line or comma-separated segment, including terms with spaces.
- Trim and deduplicate terms case-insensitively.
- Query each term separately against the provider.
- Merge and deduplicate candidate object IDs across term queries before applying candidate offset and candidate limit.
- Preserve candidate ordering by term insertion order, then provider ordering within each term, skipping duplicates.
- Apply candidate offset and limit to deduplicated provider candidates, not final imported images.
- Hide Run complexity from the primary UI while retaining Run data for state, progress, and auditing.
- Treat provider drift across days or weeks as non-blocking; continuation should use the current provider response without interrupting the user.
- MVP provider support is Met only.
- Met accepted material requires `isPublicDomain === true`.
- Met Museum Objects can be accepted when at least one valid image URL exists across `primaryImage` or `additionalImages`.
- Met `primaryImageSmall` is stored as source metadata but not downloaded locally.
- Met `primaryImageSmall` is not used as a fallback source for derivatives.
- Future providers can use provider-specific material eligibility rules, including broader open/reusable rights where appropriate.
- Store source provider rights/license statements and show them in image detail views and exports.
- The MVP is a local testing/research tool and does not enforce provider terms beyond implemented provider-specific ingestion filters; users are responsible for provider/material usage decisions.
- Store raw provider records so metadata can be audited and Descriptors can be regenerated.
- Store Met raw records as one JSON file per Museum Object.
- Use human-readable provider-specific filesystem layouts where possible.
- For Met, group object files by numeric range folders and store images in per-object folders.
- Use standardized local derivative filenames such as `primary-standard-1024.jpg`, `primary-thumb-256.jpg`, `additional-001-standard-1024.jpg`, and `additional-001-thumb-256.jpg`.
- Store source filenames and source URLs in metadata rather than local filenames.
- Define Image Asset identity by provider, Museum Object, and source image URL.
- Deduplicate repeated source image URLs within a Museum Object and prefer the `primary` role if present.
- Attempt multiple Image Assets per Museum Object up to the MVP per-object image limit of 3.
- Do not expose the per-object image limit as a routine UI control in the MVP.
- Preserve metadata/skipped references for image URLs beyond the per-object image limit.
- Accept or reject each Image Asset independently; failed Image Assets do not block other images from the same Museum Object.
- Count an Image Asset as imported only when both `standard-1024` and `thumb-256` exist and validate.
- Generate `standard-1024` as a JPEG derivative with 1024-pixel long edge and quality 90.
- Generate `thumb-256` as a JPEG derivative with 256-pixel long edge and quality 75.
- Download source originals only as temporary inputs for derivative generation.
- Delete source originals after successful derivative processing.
- Capture original width and height before deleting source originals.
- Do not require image hashes in the MVP.
- Validate local image files through existence, readability, derivative dimensions, and stored processing settings.
- Prioritize correctness, provider tolerance, resumability, and robustness over speed; overnight or long-running collects are acceptable.
- Implement progressive slowdown/backoff for repeated provider or download failures, then automatic pause if failures continue past a configured threshold.
- Check disk availability before and during collect jobs.
- Use UI/log status for completion and pauses; macOS notifications are future work.
- Do not expose destructive deletion from the MVP UI.
- Design the model to support future global user-driven exclusion or deletion of unwanted Image Assets.
- Store future AI/OpenCV/ML outputs as separate Analysis Results rather than provider metadata.
- Build provider-specific Descriptor mappings instead of assuming universal `tags`.
- Store each Descriptor value with descriptor type and provider source field.
- Use explicit mapping rules for Descriptor extraction and descriptor type assignment, not AI interpretation.
- Support rebuilding Descriptors from retained raw provider records when mappings improve.
- For the Met provider, verified matches are checked against `title`, `objectName`, `tags`, `medium`, `culture`, `period`, `classification`, and `artistDisplayName`.
- Use case-insensitive substring matching for MVP verified-match logic.
- Store unverified matches when the provider returned a candidate but no inspected field explains the match.
- Extract Met Descriptors from a broader curated field set than verified-match fields while avoiding noisy administrative fields.
- MVP Collections are text-term only. Provider-specific structured filters such as department, date range, geography, and medium are out of scope.
- Local post-import search should use canonical fields and Descriptors, not arbitrary raw provider JSON.
- Build a dense, clear, operational MVP interface.
- Organize the primary UI by Collection, with Provider Sources underneath.
- Provider-focused views can exist as secondary navigation.
- Include a dashboard for collect control and status.
- Include a basic image grid for imported Image Assets.
- Selecting an Image Asset opens a side detail panel.
- The detail panel shows `standard-1024`, essential metadata, source provider object link, match info, license/rights information, and skipped related image counts when applicable.
- The grid supports simple local text search within the current Collection context.
- Advanced faceted filtering is out of scope.
- Export only imported Image Assets and their metadata, not failed or skipped candidates.
- Use one Image Asset per exported JSONL object or CSV row, with linked Museum Object metadata included or referenced.
- Support JSONL as the primary export format and CSV as a simplified companion format.
- Support a lightweight manifest export and a complete package export workflow.
- Future export workflows may optionally fetch/package provider full-resolution images for imported Image Assets.

### Module Sketch

- **Domain/Core**: Owns core Anacronia vocabulary, state rules, and relationships. This should be a deep module with stable interfaces for Collections, Provider Sources, Runs, Museum Objects, Image Assets, Descriptors, Matches, Exports, and Analysis Results.
- **Provider Adapter Interface**: Defines what any provider must supply: search candidates, fetch records, extract image references, evaluate provider-specific eligibility, normalize minimal canonical fields, produce raw records, and provide descriptor mappings.
- **Met Provider**: Implements the first provider adapter against the Met Collection API, including term search, object fetch, public-domain filter, image extraction, verified-match logic, and descriptor extraction.
- **Descriptor Mapping Engine**: Applies explicit provider mapping rules, records source fields, assigns descriptor types, and supports rebuilds from raw records.
- **Collection Engine**: Owns Collection term handling, candidate merge/deduplication/order, offset/limit, continuation, cancel semantics, and membership between Provider Sources and Image Assets.
- **Image Pipeline**: Downloads source images temporarily, captures original metadata, creates derivatives, validates outputs, and deletes originals.
- **Storage Layer**: Owns SQLite schema access, filesystem layout, raw JSON persistence, derivative paths, state persistence, and idempotent checks.
- **Worker**: Owns the single active collect lifecycle, pause/resume/cancel, provider backoff, disk checks, and progress state.
- **FastAPI Backend**: Exposes backend operations to the UI gateway and CLI.
- **Next.js UI/Gateway**: Provides the operational interface, route-handler proxying, dashboard, collect form, progress display, image grid, detail panel, and export interactions.
- **CLI**: Provides local commands for startup and operational workflows.
- **Exporter**: Produces JSONL, CSV, manifest, and complete package exports.
- **Setup/Docs**: Provides setup script, manual setup docs, and user-facing README.

## Testing Decisions

- Tests should verify external behavior and domain outcomes, not internal implementation details.
- Tests should prefer deterministic fixtures over live provider calls.
- Live provider calls should be reserved for explicit integration/smoke checks because provider responses and throttling can change.
- Provider adapters should be tested against representative recorded responses.
- The Met Provider should be tested for candidate search parsing, object fetch parsing, strict `isPublicDomain` filtering, image URL extraction, `primaryImageSmall` metadata behavior, additional image handling, and verified/unverified match classification.
- Descriptor Mapping should be tested with provider fixtures to prove correct value extraction, descriptor type assignment, source field retention, duplicate handling, and rebuild behavior.
- Collection Engine should be tested for term normalization, multiline parsing, term deduplication, candidate merge/deduplication, ordering, offset/limit application, continuation, cancellation, and single-active-job lock rules.
- Image Pipeline should be tested with local image fixtures to prove derivative sizing, JPEG settings, validation behavior, original metadata capture, temporary file cleanup, and independent image failure handling.
- Storage should be tested for Met range folder generation, per-object image folder paths, raw JSON path generation, standardized derivative filenames, idempotent validation, and persistence of skipped image references.
- Worker should be tested as a state machine for idle, running, paused, canceled, completed, failed, backoff, and auto-pause conditions.
- Worker tests should verify that paused jobs retain the collect lock and canceled jobs release it.
- Exporter should be tested for one row/object per Image Asset, JSONL structure, CSV simplification, clean exclusion of failed/skipped candidates, and package generation.
- FastAPI should have API contract tests for collect creation, status, pause, resume, cancel, grid query, detail query, descriptor rebuild, and export initiation.
- Next.js UI should have smoke/interaction tests for creating a Collection, starting a collect, seeing progress, viewing the grid, opening the detail panel, searching within a collection, and exporting.
- CLI should have command-level tests for startup orchestration, collect invocation, status, pause, resume, cancel, and descriptor rebuild.
- Setup script should have at least smoke-level validation on a clean Mac-like environment or CI approximation.
- Good tests should avoid asserting database table internals or component implementation structure unless the test is specifically for storage layout.

## Out of Scope

- Providers beyond the Met in the MVP.
- Full Europeana or V&A implementation.
- A universal museum metadata model.
- AI/chatbot-based descriptor interpretation.
- OpenCV, embeddings, clustering, visual similarity, segmentation, generated semantic metadata, or other Analysis Result pipelines.
- The immersive visual atlas, WebGL maps, spatial clustering, or advanced image exploration.
- Advanced provider-specific structured filters such as department, date range, geography, artist/culture toggles, or medium filters.
- Advanced faceted filtering in the MVP grid.
- Multi-user profiles, authentication, permissions, or shared server deployment.
- Online/cloud deployment.
- Postgres, object storage, external worker queues, or multi-worker infrastructure.
- Multiple concurrent collect jobs or a job queue.
- Destructive deletion from the MVP UI.
- macOS notifications.
- Database backup/restore from the UI.
- Packaged macOS installer or desktop app wrapper.
- Full-resolution image storage by default.
- Full-resolution export/package workflow in the MVP.
- File hashes in the MVP.
- Searching arbitrary raw provider JSON in local post-import search.
- Automatic enforcement of all provider legal terms beyond implemented eligibility filters.

## Further Notes

- The current folder is not a git repository and no issue tracker is configured, so this PRD is written locally rather than published to an issue tracker.
- The project has been renamed from OpenMuseum to Anacronia. Future folders, commands, configuration, and documentation should use Anacronia naming.
- `CONTEXT.md` contains the domain vocabulary and should remain the source of truth for terms during implementation.
- The Met API has live behavior that requires defensive handling: `tags` can be `null`, wildcard search behavior is not a reliable canonical source, and repeated API sampling can trigger `403` responses. The implementation should use documented endpoints, conservative requests, retry/backoff, and robust filtering.
- V&A and Europeana findings informed the model but are not MVP provider work. They justify the raw + canonical minimal + provider-specific + Descriptor mapping approach.
