# Use permanent local Standard-1024 and Thumb-256 derivatives

Imported Image Assets are considered usable only when both `standard-1024` and `thumb-256` derivatives exist and validate. Anacronia stores these local derivatives permanently for Met, V&A testing, and user-imported local folders, while full-resolution source originals are not retained by default after derivative generation. The derivative pair is the default imported threshold, not the only artifact class Anacronia may ever store.

**Status:** accepted

**Considered Options:** Keeping full-resolution originals would preserve more source data but increases local disk pressure and complicates the MVP. Preview-only or cache-limited derivatives would weaken local-first analysis, export, and curation workflows.

**Consequences:** Counts, grids, detail views, exports, and future analysis should treat complete derivative pairs as the imported Image Asset threshold. Export and package workflows should either revalidate derivative readability/settings before copying or clearly report invalid local assets instead of trusting path existence alone. Any future full-resolution workflow, regenerated derivative class, or analysis-specific artifact should be added as an explicit decision.
