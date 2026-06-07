# Model source types explicitly

Anacronia records the kind of source that produced local material instead of assuming every source is an online Provider. Current source types are online Provider material, with Provider IDs such as `met` and `vam`, and User-Imported Local Material, with the first local source key `local-folder`. Future Are.na or Instagram workflows should introduce explicit source types or source keys rather than masquerading as museum Providers.

**Status:** accepted

**Considered Options:** Treating local folders as a fake Provider would keep one table shape but would blur rights, metadata, progress, and retry behavior. Treating every source as unrelated would make User Library facets, exports, and curation identity harder to unify.

**Consequences:** User Library facets, exports, curation actions, and source identity must carry enough source-type information to distinguish Met, V&A, local-folder material, and future sources. Provider Search applies only to online Providers. Local folder import is source material, not Provider Search.
