# Performance Regression Diagnosis: Analysis Studio and Collection Main Panel

Date: June 18, 2026

Branch: `main`

## Status

- Historical diagnosis and implementation handoff for the June 18, 2026 sluggishness fix.
- Useful when investigating Analysis Studio, Analysis Results, Collection grid, or Latent Space Explorer startup performance.
- Not a controlling product or architecture contract.

## User-Visible Problem

The app still functioned, but feedback felt much slower than before:

- left Navigation Rail targets such as Explorer and Analysis Studio felt delayed;
- `http://localhost:18660/analysis-results` was slow to populate;
- opening collection main panels, especially `ig-j-shoot`, felt slower than expected;
- the real latent-map Analysis Result route still loaded, but first feedback was not as snappy as earlier demos.

## Diagnosis Method

The investigation used the `diagnose` loop:

1. Reproduce slow routes on the real app data.
2. Compare rendered browser timings, Next route timings, FastAPI timings, and in-process Python timings.
3. Split likely frontend refresh/render cost from backend data loading.
4. Instrument by direct timing probes over the same real data directory.
5. Patch the narrow backend hot paths.
6. Re-run tests, endpoint timings, and rendered browser checks.

Two subagents were used:

- one inspected frontend/static hot spots;
- one inspected git history and regression suspects.

## Root Causes Found

### 1. Analysis Results scanned optional render-cache artifacts too eagerly

`LocalAnalysisResultRegistry.list()` summarized every Analysis Result by statting every declared artifact, including optional render-cache thumbnails, previews, and atlas files.

For the real data set at diagnosis time:

- 9 Analysis Result manifests were present;
- about 12,776 artifact keys were declared;
- one large result declared 7,038 artifacts, mostly optional render-cache files;
- `/analysis-results` listed summaries and then called `list_sibling_groups()`, which listed summaries again.

This made the Analysis Studio overview pay for thousands of filesystem stats before it could show useful feedback.

### 2. Analysis variant/detail reads used strict summaries on startup paths

The Analysis Studio read model and latent-map Analysis Result detail route used strict summaries even when they only needed browser/open-readiness metadata.

Strict validation remains useful for explicit status/validation, but it was too expensive for normal route rendering.

### 3. Collection object query repeated cover-image subqueries per object

`list_collection_objects()` computed the selected cover image with repeated correlated subqueries.

On the real `ig-j-shoot` collection:

- image listing was already around 50 ms in-process;
- object listing was around 2,000 ms;
- the combined collection local result set paid for object listing even when the selected view was Images.

The expensive object query was the dominant cause of collection-click sluggishness.

## Implemented Fixes

### Lightweight Analysis Result summaries for list/open paths

Files:

- `src/anacronia/analysis_result_registry.py`
- `src/anacronia/api.py`
- `src/anacronia/analyses.py`

Changes:

- `summarize()` now accepts `validate_optional_artifacts`.
- `list()` uses `validate_optional_artifacts=False`.
- `list_sibling_groups()` can reuse an already computed summary list.
- `/analysis-results` computes summaries once and passes them to sibling grouping.
- Analysis variants and Analysis Result detail use the lightweight summary path.
- Strict `summarize()` remains the default for register/status/validation behavior.
- Strict status and validation paths still report missing optional render-cache artifacts.

### Storage totals keep useful declared optional sizes

When optional artifacts are not statted, list/open summaries use declared optional `byte_size` values from the manifest for storage totals. This preserves useful UI estimates without requiring a filesystem stat for every optional cache file.

### Collection object query rewritten with window functions

File:

- `src/anacronia/collection_objects.py`

Change:

- the object query now ranks image assets per object once with `ROW_NUMBER()`;
- it computes `image_count` and latest image asset ID with window functions;
- it selects the cover row from the ranked set instead of running repeated cover subqueries.

The API shape and visible sorting remain unchanged.

## Measurements

Approximate before/after timings on the user's real app data:

| Path | Before | After |
| --- | ---: | ---: |
| FastAPI `/analysis-results` | ~1,636 ms | ~282 ms |
| Next `/analysis-results` | ~2,554 ms | ~578 ms |
| FastAPI selected Analysis Result detail | ~423 ms strict summary component | ~314 ms full detail route |
| `ig-j-shoot` collection local result set | ~2,100 ms | ~120-175 ms |
| Next `/?search_set=ig-j-shoot&view=images` | not reliably snappy, about 2s class backend path | ~295 ms |
| Real latent-map route HTML | ~1,990 ms | ~1,604 ms |

The remaining latent-map first-open cost is mostly the large viewer payload and artifact loading path, not the registry summary scan.

## Verification

Commands/checks run:

- `python -m py_compile` over touched Python modules.
- Focused pytest coverage for Analysis Result registry and collection result-set paths.
- Full Python suite: `366 passed`.
- `git diff --check`.
- Browser checks through the in-app browser after restart:
  - `http://localhost:18660/analysis-results` rendered Analysis Studio overview;
  - `http://localhost:18660/?search_set=ig-j-shoot&view=images` rendered the image grid with visible tiles;
  - real latent-map route rendered a canvas;
  - no browser console errors were reported.

The local app was restarted from the patched working tree on:

- Next: `http://localhost:18660`
- FastAPI: `http://127.0.0.1:18671`

## Remaining Follow-Up

The main unresolved performance work is the Latent Space Explorer first-open path:

- route payload is still large;
- the server still parses and serializes substantial viewer data;
- client startup still builds render state and canvas resources.

Future work should measure:

- time to first canvas paint;
- RSC payload size;
- artifact fetch timing;
- client long tasks during viewer startup;
- whether route-level streaming or smaller initial viewer data can improve perceived feedback.

## Handoff Notes

If another agent continues this thread, it should not restart from git-history diagnosis. The highest-confidence fix has already landed in the working tree and was verified on real data.

Start by reading:

1. this note;
2. the diff for `analysis_result_registry.py`, `api.py`, `analyses.py`, and `collection_objects.py`;
3. `tests/test_analysis_result_registry.py`.

Then focus any remaining performance work on the latent-map startup path or on frontend perceived-feedback states, not on the already-fixed registry double scan or collection object query.
