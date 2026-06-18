# Latent Map First-Open Measurement - 2026-06-18

## Status

- Role: measurement handoff for GitHub #337.
- Branch: `codex/issue-337-latent-first-open-performance`.
- Scope: real-data first-open performance for the durable Analysis Result Explorer route.
- Non-goal: thumbnail LOD, image visibility policy, or renderer strategy changes.

## Measurement Path Added

The branch adds an opt-in server-side startup measurement path for the latent-map route:

- Query flag: `measureStartup=1`.
- Script: `web/scripts/measure-latent-map-first-open.mjs`.
- npm entry: `npm run measure:latent-map -- --url <latent-map-url>`.
- Double-click wrapper: `batch-cmd/measure-latent-map-first-open.command`.

The normal route does not include measurement JSON unless the query flag is present.

The hidden measurement JSON is rendered with `data-testid="latent-map-startup-measurement"` and includes:

- Analysis Result detail fetch and parse timings.
- Per-artifact fetch bytes and timings.
- Per-artifact JSON/JSONL parse timings.
- Vector ID map validation timing.
- Analysis Result viewer normalization timing.
- exported viewer-data normalization timing.
- JSON serialization-size estimate for the initial viewer data.

## Real-Data Result

Measured result:

- Analysis Result: `analysis-result-20260616T235200Z-dinov3_vits_384`.
- Scope: `Ig J Shoot, Hands/Mani, snake`.
- Images: 3,504.
- Route: `/latent-map?analysisResultId=analysis-result-20260616T235200Z-dinov3_vits_384`.

Quiet no-measure user-route checks on the final branch:

```text
quiet1 total=1.683533 start=1.657670 size=6908347
quiet2 total=1.662989 start=1.636257 size=6908347
quiet3 total=1.623665 start=1.595193 size=6908347
```

Measurement-route sample:

```text
Route: status 200, response 1747.6 ms, first chunk 1777.5 ms, total 1830.6 ms, decoded 6919258 bytes
Startup: total 1528.6 ms, detail fetch 302.6 ms, artifact fetch 2292.2 ms, artifact parse 17.1 ms
Contract: atlas manifests 1338.1 ms, vector validation 0.5 ms, normalization 31.2 ms, serialization 22.1 ms / 6343005 bytes
Artifact bytes: 8597531
```

The measurement route is expected to be heavier than the normal route because it records and embeds the diagnostic payload. Compare normal route checks for user-facing performance and use the measurement route to compare breakdown shape.

## Findings

The bottleneck is still the initial server/data contract, not WebGL drawing:

- Point-mode first open still produces a 6.9 MB decoded document.
- The initial viewer-data serialization estimate is about 6.34 MB.
- Artifact parsing, vector validation, and object normalization are small compared with artifact transfer and serialized payload size.
- Vector ID map validation is negligible in the measured result and should not be removed for performance.
- The route currently loads all thumbnail atlas manifests before first paint, even for point-mode first open.
- The route currently reads both cluster-result artifacts for the selected recipe so it can choose a default cluster result.

Top measured artifact fetches in the final run:

```text
viewer/atlases/96px/atlas-manifest.json: 451.2 ms, 1,819,448 bytes
viewer/atlases/32px/atlas-manifest.json: 443.2 ms, 1,821,824 bytes
viewer/atlases/64px/atlas-manifest.json: 434.0 ms, 1,820,755 bytes
clusters/dinov3_vits_384_hdbscan_detail_mcs15_ms5_leaf.json: 274.0 ms, 466,904 bytes
clusters/dinov3_vits_384_kmeans_k12_seed42.json: 272.5 ms, 255,693 bytes
manifest.jsonl: 143.9 ms, 1,454,227 bytes
indexes/dinov3_vits_384_faiss_id_map.json: 137.1 ms, 568,107 bytes
layouts/dinov3_vits_384_umap_n15_mindist0p05_seed42.json: 136.3 ms, 390,573 bytes
```

## Tested Dead End

Parallelizing independent artifact fetches was tested on this branch and backed out.

It looked plausible because the route has multiple independent artifact reads. On the local real-data app it made the measured route worse by stacking several large artifact responses onto the local server path at once. The safe conclusion is to reduce what the route needs before first paint, not to request the same payloads concurrently.

## Recommended Next Routes

1. Add a lazy atlas-manifest contract for point-mode first open.
   - Do not load atlas manifests in the initial document unless the URL opens directly in thumbnail mode.
   - Add a thumbnail-mode fetch path that loads atlas metadata before using generated atlas rendering.
   - Preserve the current generated-atlas renderer when thumbnails are active.

2. Choose the default cluster artifact from registry metadata without reading every cluster-result artifact.
   - Preserve the current default ordering semantics.
   - Keep HDBSCAN detail as the expected default for this result unless the registry says otherwise.

3. After those two, reconsider whether the initial point payload itself should be streamed or split.
   - This is wider because the map needs all points for immediate navigation.
   - Treat it as a separate contract only after atlas/default-cluster reductions are measured.

## Parked Work

- Thumbnail LOD remains parked under the existing LOD planning docs.
- Image visibility/readability policy remains separate from this first-open payload issue.
- Renderer changes are not justified by this measurement, because first open is point mode with no thumbnails loaded.
