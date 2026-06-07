# Distinguish dataset exports from library backups

Image Asset JSONL, CSV, manifest, and package exports are downstream dataset outputs. They are not the canonical portable library format, a database backup, a migration bundle, or a restore mechanism for the user's Anacronia installation.

**Status:** accepted

**Considered Options:** Treating complete package exports as backups would be tempting because they include images and metadata, but they omit operational state such as Runs, parked resumes, local database versions, exclusions, and some audit details.

**Consequences:** Export code can optimize for downstream analysis and sharing selected material. Backup/restore, data-root moves, external-disk portability, and app-data manifests require a separate library portability decision before they are exposed as product features.
