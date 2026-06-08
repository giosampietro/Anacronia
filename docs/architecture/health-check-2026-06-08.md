# Architecture Health Check - 2026-06-08

## Status

Anacronia is moving from MVP prototype shape toward a proper local app. The domain model is now strong enough to drive implementation: Collection, Provider Search, Provider Source, User-Imported Local Material, Source Type, Source Identity, Image Asset, Collection Membership, Collection Exclusion, Favorite, Export, and Analysis Result all have documented meaning.

The main architecture risk is no longer missing vocabulary. It is drift between accepted decisions, older UX notes, and code paths that still carry earlier defaults or Met-only assumptions.

## ADR Coverage Added

The ADR set now records the major decisions needed before hardening the app:

- local-first single-user MVP and multi-process local app shape
- Provider Search vocabulary and lifecycle
- Online archive vs Local folder trajectories
- durable `standard-1024` and `thumb-256` derivatives
- provider-specific rights rules
- User-Imported Local Material privacy
- Source Identity and Source Type
- Collection Membership vs Run history
- provider record preservation and Descriptor mappings
- Image Asset export unit and export-vs-backup separation
- `SearchSet` internal compatibility until a safe Collection migration
- Provider Search batch default fixed at `10`
- local data layout, process supervision, migrations, data safety, large-library query, and Analysis Result provenance

## Reviewer-Agent Challenges Incorporated

Four independent reviewer agents challenged the ADRs from different angles:

- Architecture skeptic: pushed the identity decision from `provider identity` to Source Identity and flagged missing Provider Search lifecycle, data layout, and curation semantics.
- Domain/product reviewer: flagged stale Met-only and Search Set UX notes, PRD V&A wording, missing source-type semantics, and mixed-source export gaps.
- Implementation reviewer: found concrete code gaps around API Provider defaults, derivative export validation, local source-file links, Collection delete lifecycle, and V&A sensitivity metadata.
- Beyond-MVP reviewer: flagged packaging, process supervision, migrations, data portability, local data safety, large-library loading, and Analysis Result provenance.

The accepted ADRs now reflect these challenges. Open implementation gaps remain below.

## Open Architecture Issues

### P1 - Close before treating multi-provider/local-folder as stable

- **API Provider selection still defaults to Met.** ADR-0004 says online archive creation requires explicit Provider selection. Current FastAPI compatibility behavior defaults blank/missing Provider to `met`, so non-UI callers can violate the decision. Candidate implementation PR: require Provider for online archive create/resume paths, while preserving any needed compatibility through explicit migration or versioned request handling.
- **Export validation trusts derivative paths too much.** ADR-0005 and ADR-0021 say usable Image Assets depend on validated derivative pairs. Export/package code should revalidate readability/settings or report invalid local assets instead of copying wrong-size/corrupt files because paths exist.
- **Mixed-source export metadata needs hardening.** ADR-0011 requires source type and source identity in exports. V&A should include `systemNumber`, IIIF/source image reference, rights/copyright/API-term statements, and sensitivity metadata when available. Local-folder exports should avoid leaking private absolute source paths by default.
- **V&A sensitivity metadata is read but not persisted or surfaced.** ADR-0010 treats rights-adjacent source flags as provenance. The V&A adapter/export/detail path should decide and implement where `sensitiveImage` lands.
- **Provider Search lifecycle needs explicit tests around parked jobs.** ADR-0014 should be backed by worker/API tests for searching, stopping, stopped, paused/error, completed-with-more, provider-exhausted, lock release, and resume.

### P2 - Needed for proper-app hardening

- **Process supervision needs a real module, not only scripts.** ADR-0019 records the one-command contract; implementation should centralize child process startup, health checks, logging, port fallback, and shutdown.
- **Migration policy needs implementation hooks.** ADR-0020 records the policy; code should expose schema/data-layout versions, startup checks, and backup/refusal behavior for risky changes.
- **Local data safety needs systematic retry behavior.** ADR-0021 should guide imports, deletes, exports, and package creation toward transaction/temp-file/final-rename patterns.
- **Large-library views need server-side query paths.** ADR-0022 should become API/storage work before thousands of images make client-side filtering unreliable.
- **Library backup/restore remains unresolved.** ADR-0018 intentionally separates dataset exports from backups. A future PRD/ADR should define portable-library backup/restore before packaging or external-disk workflows are marketed as safe.
- **Packaging/distribution is still open.** ADR-0001 and ADR-0002 avoid blocking packaged-app choices. A later ADR should decide terminal app vs packaged Mac app, bundled dependencies, signing/notarization, update model, and default data location.

## Suggested PR Sequence

1. **ADR/doc foundation PR**: land the ADR set, Source Identity vocabulary, stale UX-note banners, and V&A/local-folder PRD alignment.
2. **Explicit Provider selection PR**: remove hidden Met defaulting from online archive API creation and update tests.
3. **Export integrity PR**: revalidate derivatives during export/package and include source type/source identity metadata.
4. **V&A provenance PR**: persist/surface/export V&A sensitivity and rights-adjacent metadata.
5. **Provider Search lifecycle PR**: add worker/API tests and tighten parked resume/lock behavior.
6. **Proper-app infrastructure PRD**: split process supervision, migrations, backup/restore, data safety, and large-library query into independently grabbable issues.

## ADR Setup Note

The repo setup already pointed agents to `docs/adr/` through `docs/agents/domain.md`, but the directory had no usable ADR set before this pass. The missing ADR practice was therefore a real project-health gap, not a fatal problem. It is now corrected enough for future agents to reason from recorded decisions instead of rediscovering them.
