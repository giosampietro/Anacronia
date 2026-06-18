# Anacronia Docs

Start here after `CONTEXT.md`.

## Status

- Role: canonical doc router and short current snapshot.
- For most tasks, read `CONTEXT.md`, then this file, then `docs/current-contract.md`, then only task-specific docs.
- This file prevents old PRDs, prototype logs, and research notes from competing with current contracts.

## Current Snapshot

Anacronia is a local-first, single-user Mac app.

Current App Spaces:

- `Library / Collections`: owns source material, imports, Collection Membership, curation, provider/local provenance, derivatives, and delete/export lifecycle.
- `Analysis Studio`: owns Analysis Scopes, Analysis Recipes, Analysis Jobs, durable Analysis Results, reusable Image Embedding Results, Artifact Store/Registry concerns, and analysis status.
- `Latent Space Explorer`: opens completed Analysis Results and visualizes artifacts. It is read-only over analysis data.

Current analysis thesis:

```text
global DINO finds visual families
graph bridges find outward connections
patch-level DINO can later find motifs
```

Signal boundaries:

- DINOv3: pixel-derived visual features only.
- FAISS: vector search over saved embeddings.
- UMAP: navigation layout, not similarity truth.
- Graph communities / bridges: visual-formal relations over DINO/FAISS graph structure.
- Patch tokens: future local-region visual descriptors for motif search and heatmaps.
- SigLIP2: future image/text-aligned embedding space.
- Fusion/disagreement: future explicit recipe or relation artifacts.
- Feature sidecars: future interpretable visual descriptors for diagnostics, filtering, duplicate suppression, or reranking.
- Provider/local metadata: separate provenance/context signal, never DINO output.
- Generated metadata: interpretation, not provider source truth.

## Read Order

For most coding tasks:

1. `CONTEXT.md`
2. `docs/README.md`
3. `docs/current-contract.md`
4. Relevant ADRs in `docs/adr/`
5. The task issue or PRD named by the user
6. Only the specific prototype/UX/research note needed for the task

Do not read every PRD by default.

## Canonical Docs

| Scope | Read | Role |
| --- | --- | --- |
| Domain vocabulary and invariants | `CONTEXT.md` | Canonical product language and rules |
| Compact current contract | `docs/current-contract.md` | Grouped current rules for implementation planning |
| Original local collection-builder MVP | `docs/prd/anacronia-mvp-prd.md` | Canonical for Provider Search, local folder import, Library/Collections |
| Analysis Studio and Explorer architecture | `docs/prd/anacronia-analysis-studio-prd.md` | Current controlling analysis PRD; aligns with GitHub #286 |
| Hosted client viewer strategy | `docs/prd/anacronia-concierge-hosted-viewer-prd.md` | Business/product path after local Analysis Results |
| Architecture decisions | `docs/adr/` | Accepted durable decisions |
| Agent doc reading behavior | `docs/agents/domain.md` | How agents should consume docs |

## Latent Map / Analysis Memory

| Need | Read | Status |
| --- | --- | --- |
| Graph communities, hierarchy, clustering roadmap | `docs/prototypes/latent-map-clustering-roadmap-prd.md` | Active planning memory |
| HDBSCAN result and limitations | `docs/prototypes/latent-map-hdbscan-clustering-prd.md` | Historical experiment outcome |
| Neighborhood layout mode | `docs/prototypes/latent-map-neighborhood-layout-prd.md` | Implemented feature contract |
| Atlas/LOD rendering | `docs/prototypes/latent-map-texture-lod-prd.md` | Prototype rendering memory |
| Instanced thumbnail rendering | `docs/prototypes/latent-map-instanced-thumbnail-rendering.md` | Prototype implementation memory |
| J Shoot launch workflow | `docs/prototypes/latent-map-worktree-launch.md` | Local QA/worktree instructions |
| Analysis Studio and Collection sluggishness fix | `docs/prototypes/performance-regression-diagnosis-2026-06-18.md` | Historical diagnosis and performance handoff |
| Latent map first-open measurement | `docs/prototypes/latent-map-first-open-measurement-2026-06-18.md` | Current measurement handoff for #337 |
| Post-commit implementation record | `docs/prototypes/latent-map-post-bd3d257-implementation-log.md` | Historical log, not controlling product contract |

## UX / Workflow Contracts

| Need | Read | Status |
| --- | --- | --- |
| New Collection flow | `docs/ux/start-new-collection-contract.md` | Current workflow contract |
| Local result set/grid behavior | `docs/ux/local-result-set-contract.md` | Current workflow contract |
| Curation actions | `docs/ux/curation-actions-contract.md` | Current workflow contract |
| Delete Collection | `docs/ux/delete-collection-contract.md` | Current workflow contract |
| UI rules | `docs/ux/ui-rules.md` | Current design rules |
| Old Search Set notes/mockups | `docs/ux/*search-set*`, `docs/ux/*mockup*`, `docs/ux/current-prototype-review.md` | Historical visual/reference artifacts |

## Scoped References

| Need | Read | Status |
| --- | --- | --- |
| Export field contract | `docs/export-schema.md` | Current scoped contract |
| Provider source research | `docs/providers/public-domain-image-sources-handoff.md` | Research backlog, not implementation contract |
| Security baseline | `docs/security/README.md`, `docs/security/security-risk-register-2026-06-08.md` | Dated baseline; rerun before security work |
| Architecture health | `docs/architecture/health-check-2026-06-08.md` | Dated gap register |

## Research Notes

Research notes preserve reasoning and dead ends. They are not current contracts unless a PRD points to a specific section.

| Note | Use |
| --- | --- |
| `research-notes/dinov3-latent-map-prototype-summary.md` | Short prototype history and multi-embedding summary |
| `research-notes/siglip2-local-model-assessment.md` | SigLIP2 model/runtime candidate notes for future #192 work |
| `research-notes/anacronia-latent-map-prototype-prd.md` | Historical prototype issue map for #179 |
| `research-notes/anacronia_latent_prototype_brief.md` | Long historical raw brief; read only for archaeology |

## Do Not Read By Default

- long historical research notes;
- implementation logs;
- raw chat exports;
- HTML mockups;
- old Search Set notes;
- old prototype run/worktree notes.

Open these only when the task names them or current docs explicitly point to them.

## Issue Context

Current issue anchors:

- #286: controlling Analysis Studio consolidation PRD.
- #192: future SigLIP2 separate embedding space.
- #193: future DINO/SigLIP fusion and disagreement.
- #221, #222, #223: closed graph-community, hierarchy, and diagnostics implementation history.
- Future issue still needed: patch-token/region-level analysis.
- Future issue still needed: interpretable visual feature sidecars.

## Doc Hygiene Rules

- Prefer adding current summaries and status headers over deleting historical detail.
- Keep `CONTEXT.md` as glossary/invariant source.
- Keep ADRs short and decision-focused.
- Mark historical docs as historical instead of letting them compete with current PRDs.
- Do not encode provider metadata, generated metadata, and model outputs as the same signal.
