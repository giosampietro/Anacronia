# Use atomic retryable local data mutations

Local data mutations should be atomic or retryable across SQLite rows and filesystem files. Database changes should use transactions. File writes should use temporary files and final renames where practical. Delete and export workflows should fail honestly, leave retryable state, and avoid presenting partially completed mutations as successful.

**Status:** accepted

**Considered Options:** Best-effort file writes are simpler but make corrupt derivatives, partial deletes, and package exports hard to diagnose. Blocking all mutations behind a heavy transaction manager would be premature for the MVP.

**Consequences:** Image import validates derivatives before marking Image Assets imported. Export/package code should re-check derivative validity when correctness matters. Delete Collection and global Delete must remain retry-safe when file deletion or database updates fail partway through.
