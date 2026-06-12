# Latent Map Clustering Roadmap PRD

Date: June 12, 2026

Branch: `codex/latent-map-instanced-thumbnails`

## Goal

Record the next clustering directions for the latent-map explorer after the first HDBSCAN experiment.

The purpose is durable project memory: future agents should not rediscover the same options from chat history. This document is scoped to the latent-map explorer and its analysis artifacts. It does not change the core Collection, Provider Search, or User Library model.

## Where This Memory Lives

- This PRD is the planning memory for latent-map clustering experiments.
- `latent-map-hdbscan-clustering-prd.md` records the first HDBSCAN implementation and its current limitations.
- GitHub Issues hold executable vertical slices.
- ADR-0023 already covers the architectural boundary: clustering outputs are versioned Analysis Results with provenance.

A new ADR is not needed until Anacronia changes the cross-module contract between the core local app, the analysis pipeline, and the latent-map viewer.

## Module Boundaries

Anacronia has related but distinct environments:

- Core local app: Collections, Provider Sources, User-Imported Local Material, Image Assets, curation, exports, and provenance.
- Analysis pipeline: DINO embeddings, FAISS indexes, UMAP layouts, clustering artifacts, diagnostics, and comparison reports.
- Latent-map explorer: WebGL navigation, thumbnail display, focus controls, method selection, and visual inspection.

These modules should communicate through saved Analysis Result artifacts, not through live browser-only computation or hidden UI state.

## Current Finding

Direct HDBSCAN on normalized DINO vectors is useful as an experiment but not currently useful as the main grouping tool for the J Shoot run.

Observed behavior:

- Some presets assign most images to `unassigned`.
- Other presets create one broad group that is too vague to support exploration.
- The `detail` preset exposes a few small groups, but the unassigned bucket remains too large.

This does not mean there is no structure in the image set. It means density-separated islands are not the best first assumption for this dataset and embedding space.

## Option Ranking

| Order | Option | Implementation Priority | Product Value | Risk |
| ---: | --- | --- | --- | --- |
| 1 | FAISS kNN graph communities | First | High | Medium |
| 2 | Hierarchical clustering with a granularity slider | Second | High | Medium |
| 3 | Cluster diagnostics | Alongside 1 and 2 | High | Low |
| 4 | HDBSCAN on reduced features | Later experiment | Medium | Medium |
| 5 | Direct HDBSCAN on DINO vectors | Keep as baseline | Low for current data | Low |
| 6 | K-means | Keep temporarily | Low | Low |
| 7 | Richer embeddings or hybrid signals | Later architecture work | Potentially high | High |

## Recommended Implementation Order

### 1. FAISS kNN Graph Communities

Use the nearest-neighbor structure already powering FAISS exploration as the clustering substrate.

Concept:

- Each image is a node.
- FAISS nearest-neighbor relationships are edges.
- Edge weights come from similarity or distance.
- A community detection algorithm finds groups of images that are mutually connected through local similarity.

Why this should come first:

- It uses the similarity signal that already feels useful in the viewer.
- It matches user behavior: click an image, inspect close images, then scale that idea to groups.
- It avoids forcing density islands where the dataset may instead have chains, neighborhoods, and overlapping visual families.

Initial knobs:

- `k`: number of neighbors used to build the graph.
- Similarity threshold.
- Resolution: how strongly images keep their own label during community propagation.
- Minimum group size.

User-facing UI:

- Cluster result option: `Graph communities`.
- Presets: `Broad`, `Balanced`, `Detail`, `Fine`.
- Group focus dropdown reuses the existing group focus behavior.
- Non-focused images remain visible as small dark-pink points.

### 2. Hierarchical Clustering With Granularity Slider

Build a tree of image relationships, then let the user choose how broadly or finely the tree is cut.

Concept:

- Start with each image as its own group.
- Merge the most similar groups step by step.
- The full result is a hierarchy.
- A slider chooses the current cut of that hierarchy.

Why it should follow graph communities:

- It gives the user a direct control for broad-to-fine exploration.
- It assigns every image to a group, unlike HDBSCAN.
- It is easy to explain visually: broad groups split into smaller groups as the slider increases detail.

Risk:

- It can force weak relationships because every image must belong somewhere.
- It needs diagnostics and representative examples so false structure is obvious.

User-facing UI:

- Cluster result option: `Hierarchy`.
- Granularity control: `Broad` to `Fine`, backed by saved cuts or a small finite ladder.
- Group focus dropdown updates based on the selected cut.
- The URL persists both the selected hierarchy result and the granularity level.

### 3. Cluster Diagnostics

Diagnostics should ship with or immediately after the first graph/hierarchy slice.

Useful diagnostics:

- Number of groups.
- Largest groups and smallest groups.
- Unassigned count where the method can refuse assignment.
- Representative examples for each group.
- Average neighbor similarity within each group.
- Outlier or weak-member indicators.
- Method parameters and artifact provenance.

Purpose:

- Make it obvious whether a method is finding useful visual families or only creating technical labels.
- Let the user compare K-means, HDBSCAN, graph communities, and hierarchy without trusting the method name.

### 4. HDBSCAN on Reduced Features

Try HDBSCAN after reducing DINO vectors into a more clusterable lower-dimensional feature space.

Possible pipelines:

- DINO vectors -> PCA 50D -> HDBSCAN.
- DINO vectors -> UMAP 10D or 15D -> HDBSCAN.
- DINO vectors -> PCA -> UMAP 10D or 15D -> HDBSCAN.

Important distinction:

This is not "UMAP clustering." UMAP would be a preprocessing step. HDBSCAN would still produce the labels.

Risk:

- UMAP can distort density and create artificial gaps.
- The clusterable UMAP used for this should be separate from the 2D UMAP layout used for visual navigation.

## Artifact Contract

New methods should reuse the existing cluster-result artifact shape wherever possible:

- stable `cluster_result` id;
- method label;
- method params;
- group summaries;
- point memberships;
- optional confidence or strength;
- optional unassigned group;
- provenance linking back to recipe, layout where relevant, embeddings, FAISS index, and algorithm settings.

The viewer should consume cluster artifacts uniformly. It should not need method-specific browser logic beyond labels, groups, and optional diagnostics.

## Non-Goals

- Do not replace FAISS closest/opposite search in this work.
- Do not hide non-focused images when a group is selected.
- Do not treat a dense thumbnail carpet as an acceptable result.
- Do not move clustering into live browser computation.
- Do not change core Collection or Image Asset identity semantics.
- Do not remove K-means or direct HDBSCAN until better methods have been compared on real runs.

## First Issues

1. [#221 Latent map: add FAISS kNN graph community clustering](https://github.com/giosampietro/Anacronia/issues/221)
2. [#222 Latent map: add hierarchical clustering with granularity control](https://github.com/giosampietro/Anacronia/issues/222)

Both issues should be vertical slices through the analysis artifact generator, live/export loaders, viewer UI, URL state, tests, and real-data QA.

## Issue #221 Implementation Note

The first graph-community slice uses deterministic weighted label propagation over the saved FAISS nearest-neighbor graph.

Why not connected components:

- A thresholded connected-component pass reproduced too much of HDBSCAN's unassigned-image problem.
- Label propagation produced more useful first-pass communities on the real J Shoot run without adding a new graph-clustering dependency.

Current preset ladder:

| Preset | Label | `k` | `resolution` | `min_group_size` |
| --- | --- | ---: | ---: | ---: |
| broad | `Graph communities · Broad` | 12 | 0.70 | 2 |
| balanced | `Graph communities · Balanced` | 8 | 0.60 | 2 |
| detail | `Graph communities · Detail` | 6 | 0.65 | 2 |
| fine | `Graph communities · Fine` | 3 | 0.70 | 2 |

Real J Shoot `dinov3_vits_384` counts after issue #221:

- Broad: 127 communities, 1 unassigned image.
- Balanced: 227 communities, 1 unassigned image.
- Detail: 354 communities, 32 unassigned images.
- Fine: 633 communities, 340 unassigned images.
