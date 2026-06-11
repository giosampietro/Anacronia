# Latent Map Worktree Launch

Use this when validating the latent-map viewer from the `codex/latent-map-instanced-thumbnails` worktree.

## One-Click Launch

Double-click:

`batch-cmd/start-latent-map-j-shoot.command`

The launcher runs from the worktree that contains the script, so it does not accidentally start a different checkout. It also sets:

- `ANACRONIA_LATENT_MAP_RUN_DIR=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609`
- `ANACRONIA_LATENT_MAP_VIEWER_DATA=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609/viewer/map-data.json`
- `ANACRONIA_DATA_ROOT=/private/tmp/anacronia-latent-map-worktree-data`
- UI port `18661`, leaving the main Anacronia app on `18660`
- API port `18671`

It verifies that the generated `32px`, `64px`, `96px`, and `128px` atlas manifests exist before starting the app. Missing atlas sizes are generated automatically.

It also verifies the comparison UMAP layouts for both `dinov3_vits_256` and `dinov3_vits_384`:

- `n=2`, `min_dist=0.1`
- `n=6`, `min_dist=0.1`
- `n=10`, `min_dist=0.1`
- `n=15`, `min_dist=0.1`
- `n=30`, `min_dist=0.1`
- `n=50`, `min_dist=0.1`

Missing layout files are generated from the existing embedding vectors with UMAP `init=spectral`; the launcher does not rerun DINO image embedding.

## Expected URL

The launcher opens:

`http://localhost:18661/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=96&detail=auto&z=0.75`

Use the thumbnail-size dropdown to switch the visual thumbnail size between `32px`, `64px`, and `96px`. Use the texture-detail dropdown to choose which generated atlas detail to load. `Auto` resolves from the current canvas zoom and can move through any generated atlas levels such as `32px`, `64px`, `96px`, and `128px`, while a manual detail such as `96px` stays fixed when the visual size changes.

## Avoiding The Wrong Worktree

The main app can keep running on `http://localhost:18660`. This launcher uses a separate temporary data root, UI port `18661`, and API port `18671`. Close only another latent-map worktree Terminal window if `http://localhost:18661` is already serving an app, because that is how the viewer can appear to load the wrong worktree or fallback data.

For a correct real-data launch, the top of the page should show the latent-map controls and the canvas should render the J Shoot run, not fixture data.
