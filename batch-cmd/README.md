# Batch Commands

These files are for running local Anacronia without typing terminal commands.

On macOS, double-click a `.command` file from Finder. A Terminal window will open, run the steps, and wait before closing so you can read the result.

- `open-anacronia.command` is the daily-use button: it opens Anacronia in your browser if it is already running, or starts it and opens the browser when ready.
- `setup-local-environment.command` rebuilds the local Python environment with Python 3.12 and installs Python dependencies.
- `check-dino-apple-silicon.command` checks local MPS acceleration, DINOv3 Hugging Face access, and a public DINO-family image-embedding benchmark.
- `login-huggingface.command` logs in to Hugging Face for gated model downloads using a read token.
- `setup-dinov3-local.command` installs local image-embedding dependencies and checks Apple Silicon plus Hugging Face DINOv3 access.
- `verify-bootstrap.command` runs the current Python and web checks. It does not open the app.
- `start-anacronia.command` starts the local app and opens the browser when ready.
- `prepare-latent-map-j-shoot.command` does the slow one-time work for the J Shoot latent-map run: generated atlases, comparison UMAP layouts, HDBSCAN, graph-community, and hierarchy preset cluster results, FAISS live-query indexes, and the Next production build.
- `start-latent-map-j-shoot.command` is the fast daily-use button for this worktree on `localhost:18661`: it reuses a healthy server, repairs stale `18661` listeners, verifies the precomputed atlas/UMAP/clustering files and FAISS live-query indexes, starts the prebuilt Next app directly, verifies the real latent-map URL, and opens it.
- `start-latent-map-j-shoot-dev.command` starts the same real-data latent-map URL on `localhost:18661` in Next dev mode for hot reload. Prefer the fast production launcher unless you specifically need dev-mode hot reload.
