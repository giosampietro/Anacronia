# Model online ingestion as Provider Search

Online archive work is modeled as Provider Search: the user builds or extends a Provider Source inside a locked Collection by searching an online Provider. User-facing UI uses `Start search`, `Stop search`, `Resume search`, and `Keep searching`; `collect` can remain only as internal technical vocabulary where existing worker, CLI, or code concepts use it. Local folder import, local result search, and future non-provider source trajectories are separate workflows.

**Status:** accepted

**Considered Options:** The earlier `collect` language fit internal ingestion but made the primary workflow sound like a generic import action. Provider Search better separates online Provider behavior from local folder import, local result search, and future analysis.

**Consequences:** New UI copy and issue wording should use Provider Search language. Existing internal names may migrate gradually, but new primary UI should not reintroduce `collect` labels. Architecture reviews should not treat every way of adding material as Provider Search.
