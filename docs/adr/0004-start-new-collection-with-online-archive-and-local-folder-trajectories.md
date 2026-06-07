# Start New Collection with Online archive and Local folder trajectories

New Collection starts by asking the user to choose between `Online archive` and `Local folder` because those workflows have different inputs, rights assumptions, state, progress, and failure behavior. Online archive requires a title, search keywords, explicit Provider selection, and target image count; Local folder requires a title and folder path, with no keywords, Provider Search batch target, metadata, manifest, source URL, public-domain flag, or rights declaration.

**Status:** accepted

**Consequences:** These trajectories should stay visibly distinct in UI, docs, code, and API contracts. Non-UI callers should not silently default online archive creation to Met when the request is missing a Provider; that behavior is now a compatibility gap to close. Future source types such as Are.na or Instagram should be evaluated as additional source trajectories rather than forced into Provider Search.
