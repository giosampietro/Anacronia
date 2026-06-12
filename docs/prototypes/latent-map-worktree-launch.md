# Latent Map Worktree Launch

Use this when validating the latent-map viewer from the `codex/latent-map-instanced-thumbnails` worktree.

## One-Click Launch

Double-click:

`batch-cmd/start-latent-map-j-shoot.command`

This is the fast daily-use launcher. It runs from the worktree that contains the script, so it does not accidentally start a different checkout. It also:

- reuses the server if the exact latent-map URL is already healthy;
- restarts only the reserved worktree port `18661` if that port has a stale or unhealthy listener;
- starts the built Next app directly instead of the full Python app wrapper;
- verifies the exact real-data `/latent-map` URL before opening the browser;
- leaves the main app port `18660` alone.

It sets:

- `ANACRONIA_LATENT_MAP_RUN_DIR=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609`
- `ANACRONIA_LATENT_MAP_VIEWER_DATA=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609/viewer/map-data.json`
- `ANACRONIA_DATA_ROOT=/private/tmp/anacronia-latent-map-worktree-data`
- UI port `18661`, leaving the main Anacronia app on `18660`
- API port `18671`

The fast launcher verifies that the generated `32px`, `64px`, `96px`, and `128px` atlas manifests exist before starting the app. It does not generate missing files during normal launch, because launch must stay under 10-15 seconds.

## One-Time Prep

Double-click this only when generated files or the production build are missing:

`batch-cmd/prepare-latent-map-j-shoot.command`

The prepare command can take minutes. It verifies or generates the comparison UMAP layouts for both `dinov3_vits_256` and `dinov3_vits_384`:

- `n=2`, `min_dist=0.1`
- `n=6`, `min_dist=0.1`
- `n=10`, `min_dist=0.1`
- `n=15`, `min_dist=0.1`
- `n=30`, `min_dist=0.1`
- `n=50`, `min_dist=0.1`

Missing layout files are generated from the existing embedding vectors with UMAP `init=spectral`; prep does not rerun DINO image embedding.

Prep also verifies the FAISS neighbor cache for both `dinov3_vits_256` and `dinov3_vits_384` contains rank-50 rows. Missing or older top-20 neighbor files are regenerated with `--top-k 50` so the viewer can slice `3`, `5`, `10`, `20`, and `50` closest neighbors from the same cache.

Prep finishes by running `npm run build` for the web app. After that, the daily launcher can start from the existing `.next` build without rebuilding.

## Expected URL

The launcher opens:

`http://localhost:18661/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=96&detail=auto&neighbors=20&relation=closest&z=0.75`

Use the thumbnail-size dropdown to switch the visual thumbnail size between `32px`, `64px`, and `96px`. Use the texture-detail dropdown to choose which generated atlas detail to load. `Auto` resolves from the current canvas zoom and can move through any generated atlas levels such as `32px`, `64px`, `96px`, and `128px`, while a manual detail such as `96px` stays fixed when the visual size changes.

## Avoiding The Wrong Worktree

The main app can keep running on `http://localhost:18660`. This launcher uses a separate temporary data root, UI port `18661`, and API port `18671`. Close only another latent-map worktree Terminal window if `http://localhost:18661` is already serving an app, because that is how the viewer can appear to load the wrong worktree or fallback data.

For a correct real-data launch, the top of the page should show the latent-map controls and the canvas should render the J Shoot run, not fixture data.

For the implementation history after commit `bd3d257`, see [Latent Map Implementation Log After `bd3d257`](latent-map-post-bd3d257-implementation-log.md).

## Fast Iteration Protocol

Use this as the default loop while editing the latent-map viewer:

1. Keep the app fixed on `http://localhost:18661`.
2. Use `batch-cmd/start-latent-map-j-shoot.command` for normal relaunch and user-facing QA.
3. Keep the browser fixed on the expected URL below; only change query params needed for the feature under test.
4. Use the in-app browser or Chrome DevTools against that tab for UI checks.
5. Use `batch-cmd/start-latent-map-j-shoot-dev.command` only when hot reload is worth the risk of dev-mode file watching. If dev mode reports `EMFILE` or returns `404`, stop it and use the production launcher.
6. Do not restart the server after every UI check. Reload the browser tab first; relaunch only when the process is unhealthy or the production build changed.
7. After code changes that need the production launcher, run `npm run build` or `batch-cmd/prepare-latent-map-j-shoot.command` before starting.

Expected dev URL:

`http://localhost:18661/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=96&detail=auto&neighbors=20&relation=closest&z=0.75`
