# Apply provider-specific rights rules instead of one global rights gate

Anacronia applies rights eligibility as a provider-specific ingestion rule, not as one global rule for all material. Met uses strict `isPublicDomain === true`; V&A testing retains rights/copyright/API-term statements and should show a future non-blocking notice, but private local derivative generation is not blocked by a Met-style public-domain gate. The V&A test Provider is explicitly admitted as private local testing work. Europeana future eligibility is governed by ADR-0025: accept `reusability=open` and `reusability=restricted`, reject `reusability=permission`. Other Providers with terms that restrict persistent local copies need an explicit Provider ADR before Anacronia treats them as importable.

**Status:** accepted

**Considered Options:** A single global public-domain gate would be simpler but would incorrectly treat V&A and future Providers as if they expose the same rights model as Met. Ignoring rights metadata entirely would make provenance and export weaker.

**Consequences:** Provider adapters must preserve source rights statements and may implement provider-specific eligibility. New Providers need explicit mapping rules before their material is treated as reusable or blocked. A future notice is product copy around a recorded Provider decision; it is not a hidden runtime veto unless a Provider ADR says so.
