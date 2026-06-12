# Latent Map HDBSCAN Clustering PRD

Date: June 12, 2026

Branch: `codex/latent-map-instanced-thumbnails`

## Goal

Add density-based cluster results to the latent-map workflow so visual group focus is useful beyond K-means.

HDBSCAN should run after DINO embeddings for each imported image folder. The viewer should expose HDBSCAN results beside K-means, let the user focus one returned group, and keep every image discoverable on the map.

## User Outcome

The user can switch between multiple HDBSCAN clustering levels without knowing how many groups will exist in advance.

- Fine and Detail expose smaller, more specific groups.
- Balanced is the default general exploration preset.
- Broad exposes larger, fewer groups.
- K-means remains available for comparison but is no longer the preferred exploration path.
- When focusing a group, matching images stay as normal thumbnails and non-matching images become small dark-pink map points. They are not hidden.
- FAISS selected/neighbor/opposite focus remains visually above group focus.

## Presets

Use saved artifacts, not live browser clustering:

| Preset | Label | `min_cluster_size` | `min_samples` | Selection |
| --- | --- | ---: | ---: | --- |
| fine | `HDBSCAN · Fine` | 10 | 5 | `eom` |
| detail | `HDBSCAN · Detail` | 15 | 5 | `leaf` |
| balanced | `HDBSCAN · Balanced` | 25 | 10 | `eom` |
| broad | `HDBSCAN · Broad` | 50 | 15 | `eom` |

All presets use L2-normalized DINO vectors and Euclidean distance. For normalized vectors, this preserves the same neighbor geometry intuition as cosine/IP similarity.

## Functional Requirements

- Generate HDBSCAN cluster artifacts from saved DINO embedding matrices.
- Store artifacts under `clusters/{recipe}_{cluster_id}.json`.
- Include method metadata, preset params, group summaries, unassigned count, and optional membership strength.
- Use stable group keys:
  - `cluster:<id>` for HDBSCAN groups.
  - `unassigned` for noise/unassigned images.
  - numeric string fallback for older K-means artifacts.
- Populate the latent-map method dropdown from available cluster artifacts.
- Sort HDBSCAN presets as Fine, Detail, Balanced, Broad; keep K-means available after HDBSCAN.
- Populate the Group focus dropdown from the selected cluster result's saved groups.
- Persist group focus with the existing `cluster=` URL parameter.
- Ignore invalid group focus values when switching cluster results.
- Keep source filtering as a real data filter, but treat group focus as a render state.
- Export cluster result metadata and group selections in result exports.
- Include HDBSCAN status and presets in method comparison exports.

## Launch and Pipeline

The slow prep command generates missing HDBSCAN presets for both J Shoot DINO recipes. The fast launcher only verifies that the HDBSCAN artifacts exist; it does not run clustering during daily launch.

For future image-folder imports, HDBSCAN generation should be chained after DINO embedding generation and before viewer launch/export.

## ADR Note

No new ADR is required for this slice. HDBSCAN cluster files are versioned analysis-result artifacts and fit ADR-0023's provenance model.
