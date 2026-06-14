# Batch Commands

These files are for running local Anacronia without typing terminal commands.

On macOS, double-click a `.command` file from Finder. A Terminal window will open, run the steps, and wait before closing so you can read the result.

Hugging Face auth for gated local models is stored under the repo-local `.hf-cache/` folder. The DINO setup, login, app startup, and latent-map helper commands all export `HF_HOME` to that folder so FastAPI analysis jobs and CLI checks read the same token/cache.

- `open-anacronia.command` is the daily-use button: it opens Anacronia in your browser if it is already running, or starts it and opens the browser when ready.
- `setup-local-environment.command` rebuilds the local Python environment with Python 3.12 and installs Python dependencies.
- `check-dino-apple-silicon.command` checks local MPS acceleration, DINOv3 Hugging Face access, and a public DINO-family image-embedding benchmark.
- `login-huggingface.command` logs in to Hugging Face for gated model downloads using a read token.
- `setup-dinov3-local.command` installs local image-embedding dependencies and checks Apple Silicon plus Hugging Face DINOv3 access.
- `verify-bootstrap.command` runs the current Python and web checks. It does not open the app.
- `start-anacronia.command` starts the local app and opens the browser when ready.
- `prepare-latent-map-j-shoot.command` does the slow one-time work for the J Shoot latent-map run: generated atlases, comparison UMAP layouts, HDBSCAN, graph-community, and hierarchy preset cluster results, FAISS live-query indexes, and the Next production build.
- `start-latent-map-j-shoot.command` is the fast daily-use button for this worktree on `localhost:18661`: it repairs stale `18661` UI and `18671` API listeners, verifies the precomputed atlas/UMAP/clustering files and FAISS live-query indexes, starts the prebuilt Next app plus FastAPI with the real app `data/` root, verifies the real latent-map URL, and opens it.
- `start-latent-map-j-shoot-dev.command` starts the same real-data latent-map URL on `localhost:18661` in Next dev mode for hot reload. Prefer the fast production launcher unless you specifically need dev-mode hot reload.
- `verify-durable-latent-map-j-shoot.command` is the durable Analysis Result QA button: it wraps the J Shoot legacy run as `analysis-result.json`, builds the current branch, starts the app on `localhost:18661`, checks the durable Explorer URL plus baseline atlas and FAISS 20/50-neighbor APIs, then opens the `analysisResultId` URL with a manual browser checklist.
