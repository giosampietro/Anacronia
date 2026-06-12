# Anacronia Concierge Hosted Viewer BRD/PRD

Date: June 12, 2026

Branch: `codex/latent-map-instanced-thumbnails`

Related ADR: [0026 - Use concierge hosted viewers before full cloud SaaS](../adr/0026-use-concierge-hosted-viewer-before-full-cloud-saas.md)

Related PRD: [Anacronia Analysis Studio PRD](anacronia-analysis-studio-prd.md)

## Executive Summary

Anacronia should not jump directly from local single-user research app to full multi-user SaaS. The next commercial step is a concierge hosted-viewer workflow: run analysis locally or on a controlled worker, then publish a private online latent-map viewer for a client project.

This lets the project test whether creative studios, designers, art directors, and fashion/image researchers value the experience before Anacronia pays the full complexity cost of client upload, account billing, team collaboration, abuse handling, and production GPU infrastructure.

## Business Goal

Validate that external creative users will pay for visual latent-space exploration of their own image collections.

The first monetization model is project-based consultancy:

- client has a defined image project or archive;
- Giorgio processes the images privately;
- Anacronia generates a private hosted viewer;
- client uses the viewer for a limited project window;
- Giorgio invoices the project through the existing business setup.

Subscription billing is intentionally deferred.

## Product Goal

Create a repeatable workflow where an Anacronia local analysis can become a private, online, client-reviewable project viewer without rebuilding the analysis pipeline for SaaS first.

The core product promise for the first external user is:

> Give us a project image set and we will return a private visual space where you can navigate, compare, cluster, and curate it.

## Current Starting Point

Anacronia already has:

- local Collections and local-folder imports;
- DINOv3 image embedding experiments;
- FAISS nearest-neighbor truth;
- UMAP navigation layouts;
- HDBSCAN/K-means clustering artifacts;
- a Three.js latent-map viewer with points, thumbnails, atlas pages, hover previews, and URL state;
- local run/export scripts and tests.

Anacronia does not yet have:

- durable first-class Analysis Results in the core app database;
- a general Artifact Store boundary;
- a stable Project Viewer Export contract;
- hosted private viewer deployment;
- client accounts, quotas, billing, or upload security.

## Strategy

Keep two product tracks:

| Track | Purpose | Ownership | Near-term Role |
| --- | --- | --- | --- |
| Anacronia Local | Private processing, research, analysis experiments | Giorgio/local operator | Main production backend for early projects |
| Anacronia Hosted Viewer | Private online project output | Giorgio-controlled access | Client-facing result surface |

Do not distribute a local app to clients yet. Do not build self-service cloud upload yet. Local distribution would require packaging, updates, licensing, expiry enforcement, and client machine support. Self-service upload would require zip security, multi-tenant storage, quotas, abuse handling, and production job infrastructure before commercial value is proven.

## Phased Scope

### Phase 0: Architecture Memory

Capture the decision and planning docs.

Required outputs:

- ADR for concierge hosted viewer direction.
- BRD/PRD for workflow, phases, requirements, and deferred work.
- Issue breakdown after review.

### Phase 1: Durable Local Analysis Results

Make latent-map runs first-class local product entities instead of disposable prototype outputs.

Requirements:

- Store Analysis Result records with stable IDs.
- Store Analysis Results as immutable outputs. Changed scope, changed recipe, or newly added images create a new Analysis Result rather than mutating the old one.
- Record source scope: collection, imported folder, or future multi-collection scope.
- Record recipe and versions: model, image resolution, embedding dimension, FAISS parameters, UMAP parameters, clustering method and parameters.
- Record artifact manifest: layouts, cluster results, thumbnails, atlases, FAISS index, embeddings, reports, diagnostics.
- Record created time, run status, input counts, output counts, artifact byte sizes, checksums where useful, retention classes, and provenance.
- Record package/model/library versions and random seeds where they affect reproducibility.
- Record source snapshot membership so removed images can be hidden gracefully and new images can be reported as absent from old results.
- Keep generated analysis data separate from provider metadata and Image Asset identity.
- Keep manifests and viewer payloads free of local absolute paths, temp paths, tokens, usernames, and secrets.

Non-goals:

- No multi-user permissions yet.
- No cloud object storage yet.
- No billing or client accounts.

### Phase 2: Artifact Store Boundary

Stop letting analysis/viewer code depend on arbitrary local absolute paths.

Requirements:

- Introduce an Artifact Store interface or equivalent module boundary.
- Local filesystem is the first implementation.
- Artifacts are referenced by stable keys and metadata, not by incidental paths.
- Viewer and export code request artifacts through the boundary.
- Artifact records include content type, size, logical role, retention class, durable/cache classification, and optional checksum.
- Design the key shape so a later R2/S3 implementation can use the same logical contract.
- Keep cloud compatibility in the key and manifest shape, but do not introduce cloud storage until the local boundary is stable.

Example key shape:

```text
projects/{project_id}/analysis/{analysis_result_id}/viewer/manifest.json
projects/{project_id}/analysis/{analysis_result_id}/viewer/atlases/64px/page-000.png
projects/{project_id}/analysis/{analysis_result_id}/embeddings/dinov3_vits_384.npy
projects/{project_id}/analysis/{analysis_result_id}/indexes/faiss.index
```

Non-goals:

- Do not migrate all existing local data immediately.
- Do not introduce Cloudflare R2 until the local boundary is stable.

### Phase 3: Project Viewer Export

Create a portable viewer package from a local Analysis Result.

Requirements:

- Export only what the viewer needs.
- Include manifest, layout data, cluster summaries, nearest-neighbor data required by the UI, atlas pages, thumbnail/preview assets, method metadata, and minimal item metadata.
- Exclude originals unless explicitly requested.
- Exclude secrets, local absolute paths, private machine paths, and unnecessary source records.
- Preserve image aspect ratio and viewer display metadata.
- Include a simple static or server-backed load path that can run outside the local Anacronia app.
- Include a validation step that proves the package can be opened independently.
- Include a path-hygiene validation step that fails if local absolute paths, temp paths, credentials, or machine usernames appear in viewer-facing manifests or payloads.

Non-goals:

- No client upload.
- No public gallery.
- No editable cloud collection library.

### Phase 4: Manual Private Hosted Viewer

Host one exported project viewer online under controlled access.

Requirements:

- Private-by-default access.
- Access can be revoked.
- Access can expire by date or manual takedown.
- Hosted assets must not expose local filesystem paths.
- Viewer must load generated thumbnails/atlases, not originals.
- Viewer must preserve key controls from the local latent-map explorer.
- Viewer must be usable by a non-technical client from a browser.

Possible first implementations:

- Cloudflare Pages/Workers with protected routes and private object storage.
- A simple container or Node host if Cloudflare deployment friction is too high.
- Manual password gate for the first private demo, followed by proper auth when the flow proves useful.

### Phase 5: Authenticated Project Portal

Add accounts only after the manual hosted viewer proves useful.

Requirements:

- User login.
- Project list for the authenticated user.
- Private project viewer access.
- Expiry/archival status.
- Project deletion request or manual takedown process.
- Admin project controls.

Recommended stack:

- Supabase Auth and Postgres for users, project metadata, access records, and future RLS.
- Cloudflare R2 for images and analysis artifacts.
- Cloudflare Pages/Workers or a conventional hosted app for the viewer and signed artifact access.

### Phase 6: Client Upload and Self-Service Analysis

Only after the hosted viewer and account model work.

Requirements:

- Browser zip upload or resumable object upload.
- Zip-slip and zip-bomb protection.
- File-count, byte-size, pixel-count, decode, and MIME limits.
- EXIF/GPS stripping by default.
- Per-user quotas.
- Job queue and retry model.
- Worker leasing and per-user concurrency limits.
- GPU cost controls.

Non-goals until this phase:

- Client self-service upload.
- Multi-user SaaS.
- Stripe billing.

## First Hosted Beta Slice

The smallest credible beta is:

1. Create a project locally.
2. Import one folder or zip locally.
3. Run one default analysis recipe: DINOv3 384, FAISS, UMAP, HDBSCAN.
4. Generate baseline viewer assets and atlas.
5. Export a private viewer package.
6. Host the package manually.
7. Give one client controlled browser access.
8. Gather feedback on whether the viewer improves creative review, grouping, comparison, and curation.

## Non-Goals

The following are explicitly deferred:

- Client self-service upload.
- Public sharing.
- Team workspaces and roles.
- Stripe or subscription billing.
- Provider ingestion in the hosted beta.
- Cross-collection and library-wide hosted analysis.
- SigLIP2/fusion embeddings in the first hosted beta.
- Patch-token workflows.
- Google Drive, Dropbox, Are.na, or Instagram imports.
- Vector database productization.
- Packaged local app distribution to clients.

## Security Requirements

Before any external client sees hosted output:

- Hosted project assets are private by default.
- No local absolute paths appear in manifests, URLs, logs, or browser payloads.
- Original images are not hosted unless the project explicitly requires them.
- Client images are not used for model training.
- Access can be revoked.
- Access can expire or be manually disabled.
- Deletion/retention terms are defined per project.
- Logs redact credentials, tokens, local paths, and private filenames where possible.
- Public indexing is disabled.

Before any external client can upload files:

- Enforce zip-slip and zip-bomb protections.
- Enforce file count, total bytes, per-file bytes, pixel count, and image decode limits.
- Strip EXIF/GPS by default.
- Treat filenames and embedded metadata as untrusted.
- Use private object storage keys.
- Require authenticated ownership checks before every artifact URL is issued.
- Rate-limit upload, processing, and viewer access.
- Add an admin kill switch.

## Business Requirements

- The workflow must support project-based consulting and manual invoicing.
- The first project can be operated manually by Giorgio.
- The system should record enough usage to estimate future pricing: image count, total bytes, analysis runtime, artifact storage size, viewer access duration, and manual labor.
- The hosted viewer should support limited-time access.
- The project should have a deletion/archive decision at the end of the engagement.
- The workflow must avoid committing to subscription billing until real projects show repeatable value.

## Technical Requirements

- Analysis Results are immutable once produced; changed parameters create a new result.
- Viewer exports are reproducible from stored Analysis Result metadata and artifacts.
- Viewer exports are portable across local and hosted environments.
- The local viewer and hosted viewer consume the same exported artifact contract where possible.
- Artifact keys are stable and cloud-compatible.
- Artifact manifests distinguish durable analysis truth from disposable render cache.
- Checksums are required for exported package validation where they meaningfully protect against partial or stale artifact copies.
- Deletion and retention rules distinguish source material, reusable Image Embedding Results, scope-level Analysis Results, render caches, and hosted Project Viewer Exports.
- Heavy analysis remains Python-side.
- Cloudflare Workers and Supabase Edge Functions are orchestration/gateway candidates, not DINO/SigLIP/FAISS batch execution environments.
- Large vectors, FAISS indexes, atlas pages, and embeddings stay out of Postgres.

## Cost Requirements

- Avoid persistent GPU cost for the first beta.
- Use local processing or a controlled worker first.
- Keep uploaded zips temporary once extraction succeeds.
- Keep generated derivatives and viewer assets that are needed for the project.
- Track artifact size per analysis.
- Default to a minimal atlas/detail ladder unless a project needs more.
- Do not store vectors or binary analysis artifacts in Supabase Postgres.

Current provider guidance used for planning, subject to change:

- Cloudflare R2 is attractive for image/artifact storage because it has a 10 GB-month free tier, low per-GB storage pricing, and no egress charges.
- Supabase is attractive for Auth, Postgres, and RLS, but its free storage quota is small for image-heavy workloads.
- Cloudflare Workers and Supabase Edge Functions are not appropriate for heavy image analysis jobs.
- Modal and RunPod are plausible future GPU-worker options once manual/local processing is not enough.

## Success Metrics

Product validation:

- A client can understand and use the viewer without installation.
- The latent map helps the client discover, compare, or curate images faster than ordinary folders/contact sheets.
- The client wants to reuse the workflow for another project or pay for the current one.

Operational validation:

- A project can be processed end-to-end from folder/zip to hosted viewer.
- The viewer export opens independently from the local Anacronia app.
- Hosted access can be disabled.
- No local paths or private machine details leak into the hosted package.
- Total project storage and processing time are recorded.

Engineering validation:

- The same Analysis Result artifact contract works locally and in the exported viewer.
- Adding R2 later does not require rewriting analysis algorithms.
- Adding Supabase later does not require rewriting viewer artifacts.

## Immediate Planning Issues

After this PRD is reviewed, create issues for:

1. Durable local Analysis Result records and manifest schema.
2. Artifact Store boundary with local filesystem implementation.
3. Project Viewer Export package contract and validator.
4. Hosted-viewer package smoke test using a real latent-map run.
5. Remove local absolute paths from viewer-export payloads.
6. Project-level usage accounting: image count, artifact bytes, processing time.
7. Manual private hosted viewer spike.
8. Hosted access model spike: password gate vs Supabase Auth vs Cloudflare Access.
9. Retention/deletion policy for client projects.
10. Future client-upload threat model.
11. Analysis Result deletion policy: source assets, reusable embeddings, scope artifacts, render caches, and exported packages.
12. Artifact checksum and export validation policy.

## Open Questions

- Is the hosted viewer a static package with a small access gate, or a live app backed by an API?
- What is the first acceptable access-control mechanism for a paid client project?
- Should the first hosted private viewer use Cloudflare Pages/Workers, a conventional Node/FastAPI host, or a simple protected object-storage site?
- What is the standard project retention period after delivery?
- Are originals ever hosted, or only generated derivatives and atlases?
- What client materials are unacceptable to process?
- What minimal export/curation output does a creative client need after using the viewer?
- How should usage be priced later: per project, per image count, per retained month, or per analysis recipe?

## Reference Links

- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Supabase billing and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Supabase Storage pricing](https://supabase.com/docs/guides/storage/pricing)
- [Modal pricing](https://modal.com/pricing)
- [RunPod pricing](https://www.runpod.io/pricing)
