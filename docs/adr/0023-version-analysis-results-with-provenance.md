# Version Analysis Results with provenance

Analysis Results from AI, OpenCV, ML, embeddings, clustering, segmentation, or similar pipelines must be stored separately from source metadata and versioned with provenance. Each result should identify the pipeline, version/configuration, input Image Asset or derivative, creation time, and enough parameters to decide whether it can be trusted, recomputed, deleted, or exported.

**Status:** accepted

**Considered Options:** Writing generated labels back into provider metadata would make early UI simpler but would destroy provenance. Treating every analysis output as an export-only artifact would prevent later local search, comparison, and recomputation.

**Consequences:** Provider records and Descriptors remain source-derived. Analysis modules need their own storage model, recompute/delete/export rules, and resource limits. Analysis-specific derivatives or embeddings may be added later without changing the imported Image Asset threshold.

**2026-06-12 clarification:** ADR-0026 and the Analysis Studio PRD extend this decision from generic future analysis metadata into durable local Analysis Results. Analysis Results should now be modeled with stable IDs, immutable manifests, scope snapshots, recipe provenance, artifact lists, sizes, checksums where useful, retention classes, and cloud-compatible artifact keys. This does not add cloud storage or hosted SaaS now; it prepares local analysis outputs to become Project Viewer Exports later.
