# Export imported Image Assets as the primary export unit

Exports use imported Image Assets as the primary unit: one JSONL object or CSV row per usable image, with linked Museum Object metadata, Match information, Descriptors, source type, source identity, paths, and curation state included where available. JSONL is the primary export format, CSV is a simplified companion, and package exports may include copied derivatives plus metadata.

**Status:** accepted

**Consequences:** Exports include successfully imported material, not failed candidates or skipped technical records. Multi-image Museum Objects produce multiple export rows, which is better for downstream Python, OpenCV, ML, and clustering workflows. Mixed-source exports must discriminate Met, V&A, local-folder, and future source types; V&A exports should include system number, IIIF/source image reference, rights/copyright/API-term statements, and sensitivity metadata when available. Local-folder exports should preserve local identity without unintentionally exposing private absolute source paths.
