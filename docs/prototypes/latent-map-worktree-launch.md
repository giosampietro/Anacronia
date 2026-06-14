# Latent Map Worktree Launch

Use this when validating the latent-map viewer from the `codex/latent-map-instanced-thumbnails` worktree.

## One-Click Launch

Double-click:

`batch-cmd/start-latent-map-j-shoot.command`

This is the fast daily-use launcher. It runs from the worktree that contains the script, so it does not accidentally start a different checkout. It also:

- restarts the reserved worktree UI port `18661` so stale UIs cannot keep old build or env state;
- restarts the reserved worktree API port `18671` so stale APIs cannot point at a temporary empty database;
- starts the built Next app directly and starts FastAPI with the worktree's real `data/` root;
- verifies the exact real-data `/latent-map` URL before opening the browser;
- leaves the main app port `18660` alone.

It sets:

- `ANACRONIA_LATENT_MAP_RUN_DIR=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609`
- `ANACRONIA_LATENT_MAP_VIEWER_DATA=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609/viewer/map-data.json`
- `ANACRONIA_DATA_ROOT=<worktree>/data`
- `NEXT_SWC_PATH=/private/tmp/anacronia-latent-map-worktree-runtime/temp/next-swc`
- UI port `18661`, leaving the main Anacronia app on `18660`
- API port `18671`

The fast launcher verifies that the generated `32px`, `64px`, `96px`, and `128px` atlas manifests exist before starting the app. It also verifies that the four HDBSCAN presets exist for both `dinov3_vits_256` and `dinov3_vits_384`. It does not generate missing files during normal launch, because launch must stay under 10-15 seconds.

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

Prep also verifies or generates the HDBSCAN preset ladder for both `dinov3_vits_256` and `dinov3_vits_384`:

- `HDBSCAN · Fine`
- `HDBSCAN · Detail`
- `HDBSCAN · Balanced`
- `HDBSCAN · Broad`

Prep finishes by running `npm run build` for the web app. After that, the daily launcher can start from the existing `.next` build without rebuilding.

## Expected URL

The launcher opens:

`http://localhost:18661/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=64&detail=auto&neighbors=20&relation=closest&z=0.75`

Use the thumbnail-size dropdown to switch the visual thumbnail size between `32px`, `64px`, and `96px`. Use the texture-detail dropdown to choose which generated atlas detail to load. `Auto` resolves from the current canvas zoom and can move through any generated atlas levels such as `32px`, `64px`, `96px`, and `128px`, while a manual detail such as `96px` stays fixed when the visual size changes.

Use the Clusters dropdown to switch from K-means to the HDBSCAN presets. With an HDBSCAN result selected, the Group dropdown focuses a returned group such as `Group 0`; non-focused images remain visible as small dark-pink canvas points.

Canvas shortcuts:

- `Left` / `Right`: cycle thumbnail display size.
- `Up` / `Down`: cycle texture detail through `Auto` and available atlas sizes.
- `P`: toggle Points/Thumbnails.
- `F`: hide or restore the UI overlays for canvas-only viewing; hover preview still works.
- `H`: recenter the canvas.

## Avoiding The Wrong Worktree

The main app can keep running on `http://localhost:18660`. This launcher uses the worktree's real `data/` folder for Anacronia Collections and Analysis Studio, plus a separate temporary runtime folder only for logs, pid files, and Next SWC cache. It owns the reserved worktree API port `18671`; if something is already listening there, the launcher restarts it with the real data root. Do not use the temporary runtime folder as `ANACRONIA_DATA_ROOT`; doing that makes Analysis Studio look like it has no Collections and causes the form to enter its empty-data state.

Close only another latent-map worktree Terminal window if `http://localhost:18661` is already serving an app, because that is how the viewer can appear to load the wrong worktree or fallback data.

For a correct real-data launch, the top of the page should show the latent-map controls and the canvas should render the J Shoot run, not fixture data.

For the implementation history after commit `bd3d257`, see [Latent Map Implementation Log After `bd3d257`](latent-map-post-bd3d257-implementation-log.md).

## Fast Iteration Protocol

Use this as the default loop while editing the latent-map viewer:

1. Keep the app fixed on `http://localhost:18661`.
2. Use `batch-cmd/start-latent-map-j-shoot.command` for normal relaunch and user-facing QA.
3. Keep the browser fixed on the expected URL below; only change query params needed for the feature under test.
4. Use the Browser plugin in-app browser against that tab for UI checks. If Chrome DevTools is already attached to the correct tab, it can be used, but do not keep using it when it reports `about:blank` or a different browser context.
5. Use `batch-cmd/start-latent-map-j-shoot-dev.command` only when hot reload is worth the risk of dev-mode file watching. If dev mode reports `EMFILE` or returns `404`, stop it and use the production launcher.
6. Do not restart the server after every UI check. Reload the browser tab first; relaunch only when the process is unhealthy or the production build changed.
7. After code changes that need the production launcher, run `npm run build` or `batch-cmd/prepare-latent-map-j-shoot.command` before starting.

Avoid standalone Playwright launching the installed macOS Chrome for routine QA. In this Codex desktop sandbox that path can hit Chrome Crashpad/profile permission failures and make Chrome appear to crash. Use the in-app browser tab's built-in inspection API instead.

Expected dev URL:

`http://localhost:18661/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=64&detail=auto&neighbors=20&relation=closest&z=0.75`
