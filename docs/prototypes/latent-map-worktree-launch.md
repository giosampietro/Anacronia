# Latent Map Worktree Launch

Use this when validating the latent-map viewer from the `codex/latent-map-instanced-thumbnails` worktree.

## One-Click Launch

Double-click:

`batch-cmd/start-latent-map-j-shoot.command`

The launcher runs from the worktree that contains the script, so it does not accidentally start a different checkout. It also sets:

- `ANACRONIA_LATENT_MAP_RUN_DIR=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609`
- `ANACRONIA_LATENT_MAP_VIEWER_DATA=/private/tmp/anacronia-latent-map-runs/20260609T130049Z-mvp1-j-shoot-20260609/viewer/map-data.json`

It verifies that the generated `32px`, `64px`, and `96px` atlas manifests exist before starting the app. Missing atlas sizes are generated automatically.

## Expected URL

The launcher opens:

`http://localhost:18660/latent-map?run=20260609T130049Z-mvp1-j-shoot-20260609&recipe=dinov3_vits_256&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=96&z=24`

Use the thumbnail-size dropdown to switch between `32px`, `64px`, and `96px`. The page should keep using the generated atlas size that matches the selected dropdown value.

## Avoiding The Wrong Worktree

Close any other Anacronia Terminal window before launching. The script refuses to start if `http://localhost:18660` is already serving another app, because that is how the viewer can appear to load the wrong worktree or fallback data.

For a correct real-data launch, the top of the page should show the latent-map controls and the canvas should render the J Shoot run, not fixture data.
