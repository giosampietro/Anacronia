# Use Collection-scoped curation and delete lifecycle

Manual curation distinguishes Collection-scoped removal from global local deletion. `Remove from Collection` removes material only from the current Collection and creates a Collection Exclusion for that Collection. `Delete` removes selected material from User Library and all Collections, deletes local files where no active material needs them, keeps audit history, and does not create a global never-import-again rule. Favorites are global, and active local material with no Collection Membership remains visible in User Library as `No Collection`.

**Status:** accepted

**Considered Options:** Deleting rows immediately would simplify queries but would weaken audit history, re-import stability, and cross-Collection behavior. A global blacklist would be simple but would incorrectly let one Collection's curation intent block other research intents.

**Consequences:** Collection Exclusions are source-identity based and Collection-scoped. A whole Collection delete preserves shared material, preserves favorited exclusive material as `No Collection`, deletes non-favorite exclusive files, deletes that Collection's exclusions, and leaves exports untouched. Counts, detail views, filters, and exports should be based on current Collection Membership, not Run history.
