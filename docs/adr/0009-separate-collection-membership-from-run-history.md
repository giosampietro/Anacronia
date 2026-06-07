# Separate Collection Membership from Run history

Collection Membership is the current inclusion of a Museum Object or Image Asset in a Collection, while Runs explain how material was found. This separation allows removing material from one Collection without deleting it from User Library, other Collections, local files, source records, or source identity.

**Status:** accepted

**Consequences:** `Remove from Collection` creates a Collection Exclusion for that Collection and should not create a global never-import-again rule. Deletion, favorites, orphan local material, exports, and cross-Collection views must reason from current membership instead of assuming Run history equals visibility. Run history and matches remain audit records even when active membership changes.
