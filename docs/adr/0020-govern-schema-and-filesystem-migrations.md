# Govern schema and filesystem migrations

SQLite schema changes, source layout changes, and terminology migrations must be versioned and run through explicit startup or setup migration paths. Risky migrations should create a restorable backup or clearly refuse to proceed before mutating local user data.

**Status:** accepted

**Considered Options:** Opportunistic in-place fixes inside feature code are fast during MVP work but make local user data unpredictable. A fully external migration framework may be more structure than the current app needs, but the migration policy still needs to be explicit.

**Consequences:** New persisted names should avoid `SearchSet` when they are not preserving compatibility. Existing `SearchSet` tables, routes, and query keys stay until a planned Collection migration exists. Data-layout migrations must account for missing files, external data roots, and manually inspected local folders.
