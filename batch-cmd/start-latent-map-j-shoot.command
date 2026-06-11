#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

RUN_ID="20260609T130049Z-mvp1-j-shoot-20260609"
RUN_DIR="/private/tmp/anacronia-latent-map-runs/$RUN_ID"
VIEWER_DATA="$RUN_DIR/viewer/map-data.json"
WORKTREE_DATA_ROOT="/private/tmp/anacronia-latent-map-worktree-data"
APP_UI_PORT="18661"
APP_API_PORT="18671"
APP_ORIGIN="http://localhost:$APP_UI_PORT"
LATENT_MAP_URL="$APP_ORIGIN/latent-map?run=$RUN_ID&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=96&detail=auto&z=0.75"
WATCHER_PID=""

finish() {
  status=$?
  if [ -n "$WATCHER_PID" ]; then
    kill "$WATCHER_PID" >/dev/null 2>&1 || true
  fi
  echo
  if [ "$status" -eq 0 ]; then
    echo "Anacronia latent map stopped."
  else
    echo "Anacronia latent map stopped with an error. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Starting Anacronia latent map from this worktree"
echo "Worktree: $(pwd)"
echo "Run: $RUN_ID"
echo "URL: $LATENT_MAP_URL"
echo

if [ ! -x ".venv/bin/anacronia" ]; then
  echo "Missing Anacronia command at .venv/bin/anacronia."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

if [ ! -f "$VIEWER_DATA" ]; then
  echo "Missing viewer data:"
  echo "$VIEWER_DATA"
  echo
  echo "The J Shoot latent-map run must exist before this launcher can start."
  exit 1
fi

if curl --silent --fail --max-time 2 "$APP_ORIGIN" >/dev/null 2>&1; then
  echo "Port $APP_UI_PORT is already serving an app."
  echo "Close the other latent-map worktree Terminal window first, then run this launcher again."
  exit 1
fi

for tile_size in 32 64 96 128; do
  manifest_path="$RUN_DIR/viewer/atlases/${tile_size}px/atlas-manifest.json"
  if [ ! -f "$manifest_path" ]; then
    echo "Generating ${tile_size}px atlas"
    .venv/bin/anacronia latent-map atlas \
      --run-dir "$RUN_DIR" \
      --tile-size "$tile_size" \
      --atlas-size 2048
  fi
done

export LOKY_MAX_CPU_COUNT="${LOKY_MAX_CPU_COUNT:-8}"

for recipe in dinov3_vits_256 dinov3_vits_384; do
  for n_neighbors in 2 6 10 15 30 50; do
    layout_path="$RUN_DIR/layouts/${recipe}_umap_n${n_neighbors}_mindist0p1_seed42.json"
    if [ ! -f "$layout_path" ]; then
      echo "Generating UMAP layout for ${recipe}: n=${n_neighbors}, min_dist=0.1"
      .venv/bin/anacronia latent-map layout \
        --run-dir "$RUN_DIR" \
        --recipe "$recipe" \
        --n-neighbors "$n_neighbors" \
        --min-dist 0.1 \
        --cluster-count 12 \
        --random-state 42
    fi
  done
done

export ANACRONIA_LATENT_MAP_RUN_DIR="$RUN_DIR"
export ANACRONIA_LATENT_MAP_VIEWER_DATA="$VIEWER_DATA"
export ANACRONIA_DATA_ROOT="$WORKTREE_DATA_ROOT"
mkdir -p "$ANACRONIA_DATA_ROOT"

(
  for _ in {1..120}; do
    if curl --silent --fail --max-time 2 "$APP_ORIGIN" >/dev/null 2>&1; then
      open "$LATENT_MAP_URL"
      exit 0
    fi
    sleep 1
  done

  echo "Timed out waiting for Anacronia at $APP_ORIGIN."
) &
WATCHER_PID=$!

echo "Leave this window open while using the latent map."
echo

.venv/bin/anacronia --no-open --ui-port "$APP_UI_PORT" --api-port "$APP_API_PORT"
