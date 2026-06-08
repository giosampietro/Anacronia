# Keep Anacronia local-first and single-user through the MVP

Anacronia is a local-first application for building museum image collections on the user's Mac, with generated data stored locally under a configurable data root. The MVP remains single-user because ingestion, curation, local derivatives, and future analysis workflows need a stable local foundation before account, sync, collaboration, or hosted deployment concerns are added. The MVP may default that data root to `./data`, but local-first ownership is not the same decision as permanently binding all future app data to the repository folder.

**Status:** accepted

**Consequences:** Local data ownership, local process supervision, SQLite, filesystem paths, and Mac setup remain first-class architectural concerns. Hosted or multi-user behavior must be introduced as a later architecture decision, not assumed into MVP modules. Future packaged builds may move the default data root to Application Support or an external user-selected location without reversing the local-first decision.
