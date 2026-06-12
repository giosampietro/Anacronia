# Architecture Decision Records

ADRs record architectural decisions that are hard to reverse, surprising without context, or the result of a real trade-off. `CONTEXT.md` remains the domain glossary and product model; ADRs explain why Anacronia chose a particular architecture or scope boundary.

Before changing Provider Search, local storage, source identity, curation semantics, exports, packaging, or source-provider behavior, read the relevant ADRs in this directory and surface conflicts before changing code.

## Index

- [0001 - Keep Anacronia local-first and single-user through the MVP](0001-keep-anacronia-local-first-and-single-user-through-mvp.md)
- [0002 - Use Next.js, FastAPI, a Python worker, and SQLite as the local app shape](0002-use-next-fastapi-python-worker-and-sqlite-as-the-local-app-shape.md)
- [0003 - Model online ingestion as Provider Search](0003-model-online-ingestion-as-provider-search.md)
- [0004 - Start New Collection with Online archive and Local folder trajectories](0004-start-new-collection-with-online-archive-and-local-folder-trajectories.md)
- [0005 - Use permanent local Standard-1024 and Thumb-256 derivatives](0005-use-permanent-local-standard-1024-and-thumb-256-derivatives.md)
- [0006 - Apply provider-specific rights rules instead of one global rights gate](0006-apply-provider-specific-rights-rules-instead-of-one-global-rights-gate.md)
- [0007 - Treat user-imported local material as private local material](0007-treat-user-imported-local-material-as-private-local-material.md)
- [0008 - Key identity and curation by source identity](0008-key-identity-and-curation-by-source-identity.md)
- [0009 - Separate Collection Membership from Run history](0009-separate-collection-membership-from-run-history.md)
- [0010 - Preserve provider records and use explicit Descriptor mappings](0010-preserve-provider-records-and-use-explicit-descriptor-mappings.md)
- [0011 - Export imported Image Assets as the primary export unit](0011-export-imported-image-assets-as-the-primary-export-unit.md)
- [0012 - Preserve SearchSet internal names until a safe Collection rename](0012-preserve-searchset-internal-names-until-a-safe-collection-rename.md)
- [0013 - Default Provider Search batch target is 10](0013-default-provider-search-batch-target-is-10.md)
- [0014 - Run one active Provider Search with parked resume](0014-run-one-active-provider-search-with-parked-resume.md)
- [0015 - Model source types explicitly](0015-model-source-types-explicitly.md)
- [0016 - Use configurable data root with readable source layouts](0016-use-configurable-data-root-with-readable-source-layouts.md)
- [0017 - Use Collection-scoped curation and delete lifecycle](0017-use-collection-scoped-curation-and-delete-lifecycle.md)
- [0018 - Distinguish dataset exports from library backups](0018-distinguish-dataset-exports-from-library-backups.md)
- [0019 - Supervise local processes through one command](0019-supervise-local-processes-through-one-command.md)
- [0020 - Govern schema and filesystem migrations](0020-govern-schema-and-filesystem-migrations.md)
- [0021 - Use atomic retryable local data mutations](0021-use-atomic-retryable-local-data-mutations.md)
- [0022 - Query large libraries server-side](0022-query-large-libraries-server-side.md)
- [0023 - Version Analysis Results with provenance](0023-version-analysis-results-with-provenance.md)
- [0024 - Preserve full Provider records for imported material](0024-preserve-full-provider-records-for-imported-material.md)
- [0025 - Use Europeana reusability for future import eligibility](0025-use-europeana-reusability-for-future-import-eligibility.md)
- [0026 - Use concierge hosted viewers before full cloud SaaS](0026-use-concierge-hosted-viewer-before-full-cloud-saas.md)
