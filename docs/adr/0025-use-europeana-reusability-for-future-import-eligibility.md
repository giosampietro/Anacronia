# Use Europeana reusability for future import eligibility

For a future Europeana Provider, Anacronia should use Europeana's `reusability` signal as the provider-specific ingestion gate. Import records matching the user-facing `Can I use this?` states `Yes` and `Yes, with conditions`, corresponding to API values `open` and `restricted`. Reject `Maybe, seek permission`, corresponding to API value `permission`.

**Status:** accepted

**Considered Options:** Importing only `open` records would be stricter but would exclude Europeana material that is explicitly reusable with restrictions. Importing `permission` records would admit material that requires explicit permission and would blur the difference between reusable-with-conditions and permission-needed material. A global public-domain-only rule would not match Europeana's rights model.

**Consequences:** A Europeana adapter should query or filter with `reusability=open` and `reusability=restricted`, require usable media, preserve the raw EDM record for imported material, and store the exact rights statement and media/WebResource metadata per Image Asset. `permission` records should become skipped candidates, not imported material.

Europeana search flags such as `media=true`, thumbnail availability, `edmPreview`, `edmIsShownBy`, and `hasView` are candidate signals only. The adapter must not accept a record until at least one source media candidate from the record's aggregation/WebResource data returns an HTTP success response, image content, decodable bytes, and complete local `standard-1024` plus `thumb-256` derivatives. A Europeana thumbnail may be stored as preview metadata, but it should not be treated as the import-grade source image for AI work. Records whose source media is blocked, missing, HTML/challenge content, or otherwise undecodable should become skipped candidates even when Europeana can display or proxy a thumbnail.

This ADR does not implement Europeana; it records the future eligibility rule so provider scaffolding can stay coherent.
