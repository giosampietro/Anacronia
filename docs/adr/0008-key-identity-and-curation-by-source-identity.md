# Key identity and curation by source identity

Museum Object and Image Asset identity is keyed by source identity rather than volatile local database row identity. Online Provider material uses Provider plus provider object identity, with Image Assets additionally keyed by source image identity. User-Imported Local Material uses a local source namespace plus generated local object/image identities; it is source material but not Provider material. Collection Membership, Collection Exclusions, Favorites, delete, re-import, and cross-Collection visibility use source identity.

**Status:** accepted

**Considered Options:** Local database row IDs are simpler to pass around but make V&A string IDs, re-import, cross-Collection curation, and local folder identity harder to reason about. Forcing local folders into Provider identity would keep one shape but distort the domain.

**Consequences:** Met numeric IDs are normalized into string-capable source IDs. V&A `systemNumber` values can share the online Provider identity model. Local folder identity may use generated local identifiers and private source-file provenance without requiring image hashes in the MVP. Code and exports should expose source type plus source identity, not just database row IDs.
