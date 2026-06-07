# Use configurable data root with readable source layouts

Generated local data lives under a configurable data root, defaulting to `./data` for the current repo-based MVP. Within that root, storage should prefer human-readable source-specific layouts for raw records, derivatives, manifests, and export artifacts. Opaque sharding is a fallback when source IDs or paths are unsuitable for readable directories.

**Status:** accepted

**Considered Options:** A single opaque content-addressed tree would simplify some filesystem constraints but would make local inspection and repair harder for the intended Mac-first research workflow. Keeping generated data beside code without a configurable root would block external disks and future packaged app layouts.

**Consequences:** Provider-specific layouts such as Met numeric range folders are intentional. V&A and local-folder layouts should be readable where practical while preserving filesystem safety. The data root must remain movable/configurable, generated data stays out of git, and future layout migrations need explicit migration handling.
