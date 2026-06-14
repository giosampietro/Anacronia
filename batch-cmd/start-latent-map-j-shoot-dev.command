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
LATENT_MAP_URL="$APP_ORIGIN/latent-map?run=$RUN_ID&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=hierarchy_balanced_k48_average_cosine_l2&mode=thumbnails&thumb=64&detail=auto&neighbors=20&relation=closest&z=0.75"
WATCHER_PID=""
HDBSCAN_CLUSTER_IDS=(
  hdbscan_fine_mcs10_ms5_eom
  hdbscan_detail_mcs15_ms5_leaf
  hdbscan_balanced_mcs25_ms10_eom
  hdbscan_broad_mcs50_ms15_eom
)
GRAPH_COMMUNITY_CLUSTER_IDS=(
  graph_communities_broad_k12_res0p7_min2
  graph_communities_balanced_k8_res0p6_min2
  graph_communities_detail_k6_res0p65_min2
  graph_communities_fine_k3_res0p7_min2
)
HIERARCHY_CLUSTER_IDS=(
  hierarchy_broad_k24_average_cosine_l2
  hierarchy_balanced_k48_average_cosine_l2
  hierarchy_detail_k96_average_cosine_l2
  hierarchy_fine_k192_average_cosine_l2
)

finish() {
  status=$?
  if [ -n "$WATCHER_PID" ]; then
    kill "$WATCHER_PID" >/dev/null 2>&1 || true
  fi
  echo
  if [ "$status" -eq 0 ]; then
    echo "Anacronia latent map dev server stopped."
  else
    echo "Anacronia latent map dev server stopped with an error. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Starting Anacronia latent map dev server from this worktree"
echo "Worktree: $(pwd)"
echo "Run: $RUN_ID"
echo "URL: $LATENT_MAP_URL"
echo

ulimit -n 8192 >/dev/null 2>&1 || true

if [ ! -x ".venv/bin/anacronia" ]; then
  echo "Missing Anacronia command at .venv/bin/anacronia."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

if [ ! -f "$VIEWER_DATA" ]; then
  echo "Missing viewer data:"
  echo "$VIEWER_DATA"
  exit 1
fi

if curl --silent --fail --location --max-time 2 "$LATENT_MAP_URL" >/dev/null 2>&1; then
  echo "Latent map is already running and healthy on port $APP_UI_PORT."
  open "$LATENT_MAP_URL"
  exit 0
fi

existing_pid="$(lsof -nP -tiTCP:"$APP_UI_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)"
if [ -n "$existing_pid" ]; then
  echo "Port $APP_UI_PORT is occupied but the latent-map page is not healthy."
  echo "Stop PID $existing_pid or run batch-cmd/start-latent-map-j-shoot.command to repair the production launcher."
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

for recipe in dinov3_vits_256 dinov3_vits_384; do
  index_path="$RUN_DIR/indexes/${recipe}_flat_ip.faiss"
  id_map_path="$RUN_DIR/indexes/${recipe}_faiss_id_map.json"
  if [ ! -f "$index_path" ] || [ ! -f "$id_map_path" ]; then
    echo "Generating FAISS live-query index for ${recipe}"
    .venv/bin/anacronia latent-map faiss-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --top-k 50
  else
    echo "Found FAISS live-query index for ${recipe}"
  fi

  hdbscan_missing=0
  for cluster_id in "${HDBSCAN_CLUSTER_IDS[@]}"; do
    if [ ! -f "$RUN_DIR/clusters/${recipe}_${cluster_id}.json" ]; then
      hdbscan_missing=1
      break
    fi
  done

  if [ "$hdbscan_missing" -eq 1 ]; then
    echo "Generating HDBSCAN presets for ${recipe}"
    .venv/bin/anacronia latent-map hdbscan-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --preset all
  fi

  graph_communities_missing=0
  for cluster_id in "${GRAPH_COMMUNITY_CLUSTER_IDS[@]}"; do
    if [ ! -f "$RUN_DIR/clusters/${recipe}_${cluster_id}.json" ]; then
      graph_communities_missing=1
      break
    fi
  done

  if [ "$graph_communities_missing" -eq 1 ]; then
    echo "Generating graph-community presets for ${recipe}"
    .venv/bin/anacronia latent-map graph-communities-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --preset all
  fi

  hierarchy_missing=0
  for cluster_id in "${HIERARCHY_CLUSTER_IDS[@]}"; do
    if [ ! -f "$RUN_DIR/clusters/${recipe}_${cluster_id}.json" ]; then
      hierarchy_missing=1
      break
    fi
  done

  if [ "$hierarchy_missing" -eq 1 ]; then
    echo "Generating hierarchy presets for ${recipe}"
    .venv/bin/anacronia latent-map hierarchy-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --preset all
  fi
done

export ANACRONIA_LATENT_MAP_RUN_DIR="$RUN_DIR"
export ANACRONIA_LATENT_MAP_VIEWER_DATA="$VIEWER_DATA"
export ANACRONIA_DATA_ROOT="$WORKTREE_DATA_ROOT"
export ANACRONIA_API_PORT="$APP_API_PORT"
export ANACRONIA_UI_PORT="$APP_UI_PORT"
export NEXT_SWC_PATH="$WORKTREE_DATA_ROOT/temp/next-swc"
mkdir -p "$ANACRONIA_DATA_ROOT" "$NEXT_SWC_PATH"

(
  for _ in {1..120}; do
    if curl --silent --fail --location --max-time 2 "$LATENT_MAP_URL" >/dev/null 2>&1; then
      open "$LATENT_MAP_URL"
      exit 0
    fi
    sleep 1
  done

  echo "Timed out waiting for Anacronia at $APP_ORIGIN."
) &
WATCHER_PID=$!

echo "Leave this window open while iterating on the latent map."
echo "This uses Next dev mode, so UI code changes hot-reload on $APP_ORIGIN."
echo

cd web
npm run dev -- --hostname 127.0.0.1 --port "$APP_UI_PORT"
