# Run one active Provider Search with parked resume

Provider Search runs through one actively searching or stopping job at a time. A running job owns the global search lock; a stopped or paused/error job is parked and does not block starting another Collection search. Resuming a parked search is allowed only when no other Provider Search is searching or stopping. Batch target means target usable downloaded Image Assets, while candidate cursor and candidate limit remain internal Run mechanics.

**Status:** accepted

**Considered Options:** A queue would make long-running work feel automatic but adds ordering, cancellation, and failure semantics before the MVP needs them. Concurrent Provider Searches would increase provider throttling risk and make local filesystem/SQLite correctness harder to reason about.

**Consequences:** `Stop search` finishes the current Museum Object at a safe checkpoint, preserves completed material, and records a resumable cursor. Repeated provider/network/download failures should slow down first and then pause. Worker, API, and UI tests should cover searching, stopping, stopped, paused/error, completed-with-more, provider-exhausted, lock release, and resume behavior.
