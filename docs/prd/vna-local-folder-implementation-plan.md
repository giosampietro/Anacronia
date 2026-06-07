# V&A and Plain Local Folder Implementation Plan

## Status

Planning and milestone guide for the `codex/vna-requirements` branch.

## Product Decisions

- V&A is the next online museum Provider after Met.
- V&A imports are private local testing imports and should create permanent local `standard-1024` and `thumb-256` derivatives.
- V&A should retain source rights/copyright/API-term statements when available.
- A future V&A notice should be non-blocking. It informs the user about V&A API-use expectations and timing, but does not block private local import, export, curation, or analysis.
- Plain local folder import is separate from Provider Search.
- Plain local folder import requires no metadata, no manifest, no source URL, no public-domain flag, and no rights declaration.

## Tracker

- #156 - PRD: V&A private local derivative provider
- #157 - Support string source object IDs for multi-provider material
- #158 - Introduce provider adapter foundation for Met and V&A
- #159 - Add V&A provider adapter for private local derivative import
- #160 - Import plain local image folders as private local material

## Frozen Milestones

Each milestone should end with a commit on `codex/vna-requirements`, passing tests, and a browser-visible check when UI behavior is affected.

### Milestone 0: Requirements and Tracker

Goal: lock the product decision and issue sequence.

Deliverables:

- `CONTEXT.md` updated with V&A/private local derivative and plain local folder rules.
- MVP PRD updated with V&A and plain local folder source requirements.
- GitHub issues #156-#160 created and linked.

Verification:

- Documentation diff review.
- `git status` shows only intentional docs changes before commit.

### Milestone 1: String Source Object IDs

Goal: make Met continue to work while source object IDs become string-capable.

Deliverables:

- Core local material identity supports string source object IDs.
- Existing Met object IDs are preserved as string-compatible provider identities.
- API and frontend selection/route keys accept string object IDs.

Verification:

- Backend and frontend tests pass.
- Existing Met Collection grid still loads with real local data.
- Detail overlay opens for an existing Met object.
- Export and curation smoke paths still see the same Met material.

### Milestone 2: Provider Adapter Foundation

Goal: move Met through a provider adapter path without changing user-visible behavior.

Deliverables:

- Provider-neutral local material schema ownership.
- Provider adapter boundary for search, record fetch, eligibility, images, descriptors, matches, raw record paths, derivative paths, and notices.
- Met adapter proves the abstraction.

Verification:

- Met Provider Search still starts, stops, resumes, and keeps searching.
- Existing Collection/User Library counts match pre-milestone behavior.
- Browser check on the real app data confirms Met grid/detail/export paths still work.

### Milestone 3: V&A Provider Adapter

Goal: add V&A as a second museum Provider with permanent local derivatives.

Deliverables:

- `vam` Provider Source available.
- V&A searches locked Collection terms with `images_exist=1`.
- V&A imports raw records, descriptors, matches, IIIF image references, and permanent derivatives.
- V&A source detail/export metadata includes system number, source link, IIIF/source image reference, and copyright/terms text when available.
- V&A public-domain filtering is not enforced.

Verification:

- Recorded V&A fixtures pass tests.
- A small V&A search imports local derivatives.
- Browser check shows a Collection with V&A material visible in the grid and detail overlay.
- User Library can filter or show V&A material.

### Milestone 4: Plain Local Folder Import

Goal: import a folder of user image files as private local material.

Deliverables:

- User can provide a local folder path.
- Import recursively discovers supported image files.
- Import generates derivatives and creates Collection Membership.
- No metadata/manifest/source URL/rights input is required.

Verification:

- Test fixture folder imports successfully.
- Browser check shows imported folder images in the target Collection and User Library.
- Detail/export/favorite/remove/delete smoke paths work for folder images.

### Milestone 5: Mixed Source Regression Pass

Goal: prove Met, V&A, and folder images coexist.

Deliverables:

- Mixed-source Collection/User Library views behave coherently.
- Counts and Provider/source facets do not double count.
- Export output represents each source type clearly enough for downstream analysis.

Verification:

- Full backend and frontend test suites pass.
- Browser check with real data confirms Met, V&A, and folder-imported images can be inspected.
- Final branch diff contains no temporary issue-body files or generated data.
