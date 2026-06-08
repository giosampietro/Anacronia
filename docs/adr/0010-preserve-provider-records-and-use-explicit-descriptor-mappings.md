# Preserve provider records and use explicit Descriptor mappings

Anacronia preserves raw provider records for online Provider material and extracts Descriptors through explicit provider mapping rules. This keeps provenance auditable and lets descriptor mappings evolve later without overwriting provider metadata or relying on AI interpretation. The canonical cross-provider model stays intentionally small; provider-specific records and rights-adjacent flags remain available as source metadata instead of being flattened away.

**Status:** accepted

**Considered Options:** Flattening all provider metadata into one generic schema would make early UI easier but would lose source-specific meaning. AI-inferred descriptors are deferred because deterministic provenance matters more for the MVP.

**Consequences:** Provider adapters should retain raw source records where provider records exist, keep Descriptor source fields, and preserve source metadata that affects provenance, rights display, export, or user interpretation, including V&A sensitivity flags when exposed. User-Imported Local Material is not required to invent provider records. Analysis Results remain separate from provider metadata and are governed by the Analysis Results ADR.
