#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKTREE_ROOT="$(pwd)"
RUN_ID="20260609T130049Z-mvp1-j-shoot-20260609"
RUN_DIR="/private/tmp/anacronia-latent-map-runs/$RUN_ID"
VIEWER_DATA="$RUN_DIR/viewer/map-data.json"
WORKTREE_DATA_ROOT="/private/tmp/anacronia-latent-map-worktree-data"
APP_UI_PORT="18661"
APP_API_PORT="18671"
APP_ORIGIN="http://localhost:$APP_UI_PORT"
LATENT_MAP_URL="$APP_ORIGIN/latent-map?run=$RUN_ID&recipe=dinov3_vits_384&layout=umap_n15_mindist0p05_seed42&clusterResult=kmeans_k12_seed42&mode=thumbnails&thumb=64&detail=auto&neighbors=20&relation=closest&z=0.75"
PID_DIR="$WORKTREE_DATA_ROOT/run"
LOG_DIR="$WORKTREE_DATA_ROOT/logs"
PID_FILE="$PID_DIR/latent-map-ui-$APP_UI_PORT.pid"
LOG_FILE="$LOG_DIR/latent-map-ui-$APP_UI_PORT.log"
NEXT_BIN="$WORKTREE_ROOT/web/node_modules/next/dist/bin/next"
SERVER_PID=""

finish() {
  status=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ "$status" -ne 0 ]; then
    pause_for_error
  fi
  exit "$status"
}

pause_for_error() {
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    echo
    read -r -p "Press Enter to close this window..."
  fi
}

fail() {
  echo
  echo "$1"
  if [ -f "$LOG_FILE" ]; then
    echo
    echo "Last server log lines:"
    tail -60 "$LOG_FILE" || true
  fi
  exit 1
}

open_latent_map() {
  if [ "${ANACRONIA_BATCH_NO_OPEN:-}" != "1" ]; then
    open "$LATENT_MAP_URL"
  fi
}

page_is_healthy() {
  curl --silent --fail --location --max-time 2 "$LATENT_MAP_URL" >/dev/null 2>&1
}

port_pid() {
  lsof -nP -tiTCP:"$APP_UI_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

stop_pid() {
  pid="$1"
  if [ -z "$pid" ]; then
    return 0
  fi

  kill "$pid" >/dev/null 2>&1 || return 0
  for _ in {1..20}; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      sleep 0.2
    else
      return 0
    fi
  done
  kill -9 "$pid" >/dev/null 2>&1 || true
}

require_file() {
  path="$1"
  label="$2"
  if [ ! -f "$path" ]; then
    echo "Missing $label:"
    echo "$path"
    return 1
  fi
  return 0
}

trap finish EXIT INT TERM

echo "Starting Anacronia latent map from this worktree"
echo "Worktree: $WORKTREE_ROOT"
echo "Run: $RUN_ID"
echo "URL: $LATENT_MAP_URL"
echo

mkdir -p "$PID_DIR" "$LOG_DIR" "$WORKTREE_DATA_ROOT/temp/next-swc"

missing=0
require_file "$VIEWER_DATA" "viewer data" || missing=1
require_file "$WORKTREE_ROOT/web/.next/BUILD_ID" "Next production build" || missing=1
require_file "$NEXT_BIN" "Next server binary" || missing=1

for tile_size in 32 64 96 128; do
  require_file "$RUN_DIR/viewer/atlases/${tile_size}px/atlas-manifest.json" "${tile_size}px atlas manifest" || missing=1
done

for recipe in dinov3_vits_256 dinov3_vits_384; do
  neighbors_path="$RUN_DIR/indexes/${recipe}_neighbors.jsonl"
  require_file "$neighbors_path" "${recipe} FAISS neighbor cache" || missing=1
  if [ -f "$neighbors_path" ] && ! grep --silent '"neighbor_rank": 50' "$neighbors_path"; then
    echo "FAISS cache is not top-50:"
    echo "$neighbors_path"
    missing=1
  fi

  for n_neighbors in 2 6 10 15 30 50; do
    require_file "$RUN_DIR/layouts/${recipe}_umap_n${n_neighbors}_mindist0p1_seed42.json" "${recipe} UMAP n=${n_neighbors} min=0.1 layout" || missing=1
  done
done

if [ "$missing" -ne 0 ]; then
  fail "Fast launch cannot stay under 10-15 seconds because precomputed files are missing. Run batch-cmd/prepare-latent-map-j-shoot.command once, then run this launcher again."
fi

if page_is_healthy; then
  echo "Latent map is already running and healthy on port $APP_UI_PORT."
  open_latent_map
  echo "URL: $LATENT_MAP_URL"
  exit 0
fi

existing_pid="$(port_pid || true)"
if [ -n "$existing_pid" ]; then
  echo "Port $APP_UI_PORT has an unhealthy listener (PID $existing_pid). Restarting only this worktree port."
  stop_pid "$existing_pid"
fi

existing_pid="$(port_pid || true)"
if [ -n "$existing_pid" ]; then
  fail "Port $APP_UI_PORT is still occupied by PID $existing_pid. This launcher never touches main on 18660; stop the 18661 process and try again."
fi

export ANACRONIA_LATENT_MAP_RUN_DIR="$RUN_DIR"
export ANACRONIA_LATENT_MAP_VIEWER_DATA="$VIEWER_DATA"
export ANACRONIA_DATA_ROOT="$WORKTREE_DATA_ROOT"
export ANACRONIA_API_PORT="$APP_API_PORT"
export ANACRONIA_UI_PORT="$APP_UI_PORT"
export NEXT_SWC_PATH="$WORKTREE_DATA_ROOT/temp/next-swc"

start_epoch="$(date +%s)"
: > "$LOG_FILE"

(
  cd "$WORKTREE_ROOT/web"
  node "$NEXT_BIN" start --hostname 127.0.0.1 --port "$APP_UI_PORT"
) >> "$LOG_FILE" 2>&1 &
SERVER_PID="$!"
server_pid="$SERVER_PID"
echo "$server_pid" > "$PID_FILE"

for _ in {1..15}; do
  if page_is_healthy; then
    elapsed="$(( $(date +%s) - start_epoch ))"
    open_latent_map
    echo "Latent map is ready in ${elapsed}s."
    echo "PID: $server_pid"
    echo "Log: $LOG_FILE"
    echo "URL: $LATENT_MAP_URL"
    if [ "${ANACRONIA_BATCH_EXIT_AFTER_READY:-}" = "1" ]; then
      stop_pid "$server_pid"
      SERVER_PID=""
      exit 0
    fi
    echo
    echo "Leave this window open while using the latent map."
    wait "$server_pid"
    server_status="$?"
    SERVER_PID=""
    exit "$server_status"
  fi

  if ! kill -0 "$server_pid" >/dev/null 2>&1; then
    fail "Latent map server exited before the page became healthy."
  fi
  sleep 1
done

fail "Timed out waiting 15 seconds for $LATENT_MAP_URL."
