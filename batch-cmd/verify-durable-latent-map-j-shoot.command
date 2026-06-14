#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKTREE_ROOT="$(pwd)"
RUN_ID="20260609T130049Z-mvp1-j-shoot-20260609"
ANALYSIS_RESULT_ID="latent-map-$RUN_ID"
RUNS_ROOT="/private/tmp/anacronia-latent-map-runs"
RUN_DIR="$RUNS_ROOT/$RUN_ID"
APP_DATA_ROOT="$WORKTREE_ROOT/data"
WORKTREE_RUNTIME_ROOT="/private/tmp/anacronia-latent-map-worktree-runtime"
APP_UI_PORT="18661"
APP_API_PORT="18671"
APP_ORIGIN="http://127.0.0.1:$APP_UI_PORT"
LATENT_MAP_URL="$APP_ORIGIN/latent-map?analysisResultId=$ANALYSIS_RESULT_ID&recipe=dinov3_vits_384&layout=umap_n30_mindist0p1_seed42&clusterResult=hdbscan_detail_mcs15_ms5_leaf&mode=thumbnails&thumb=64&detail=auto&neighbors=20&relation=closest&z=0.75"
PID_DIR="$WORKTREE_RUNTIME_ROOT/run"
LOG_DIR="$WORKTREE_RUNTIME_ROOT/logs"
PID_FILE="$PID_DIR/durable-latent-map-ui-$APP_UI_PORT.pid"
LOG_FILE="$LOG_DIR/durable-latent-map-ui-$APP_UI_PORT.log"
API_PID_FILE="$PID_DIR/durable-latent-map-api-$APP_API_PORT.pid"
API_LOG_FILE="$LOG_DIR/durable-latent-map-api-$APP_API_PORT.log"
NEXT_BIN="$WORKTREE_ROOT/web/node_modules/next/dist/bin/next"
PYTHON_BIN="$WORKTREE_ROOT/.venv/bin/python"
SERVER_PID=""
API_SERVER_PID=""

finish() {
  status=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$API_SERVER_PID" ] && kill -0 "$API_SERVER_PID" >/dev/null 2>&1; then
    kill "$API_SERVER_PID" >/dev/null 2>&1 || true
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

api_port_pid() {
  lsof -nP -tiTCP:"$APP_API_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

api_is_healthy() {
  curl --silent --fail --max-time 2 "http://127.0.0.1:$APP_API_PORT/health" >/dev/null 2>&1
}

stop_pid() {
  pid="$1"
  if [ -z "$pid" ]; then
    return 0
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  if ! kill "$pid" >/dev/null 2>&1; then
    echo "Could not stop PID $pid."
    return 1
  fi

  for _ in {1..20}; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      sleep 0.2
    else
      return 0
    fi
  done

  if ! kill -9 "$pid" >/dev/null 2>&1; then
    echo "Could not force-stop PID $pid."
    return 1
  fi
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

run_contract_check() {
  echo
  echo "Running durable Analysis Result contract check"
  node scripts/verify-durable-latent-map-real-data.mjs \
    --origin "$APP_ORIGIN" \
    --runs-root "$RUNS_ROOT" \
    --run-id "$RUN_ID" \
    --analysis-result-id "$ANALYSIS_RESULT_ID"
}

print_manual_checklist() {
  echo
  echo "Manual browser QA checklist:"
  echo "1. Canvas renders the J Shoot map, not fixture data."
  echo "2. Wheel/trackpad zoom and drag pan are smooth; top bar does not page-zoom."
  echo "3. Toggle points/thumbnails, then return to UMAP layout."
  echo "4. Click a thumbnail, press n, and verify Neighborhood Layout Mode opens."
  echo "5. Click several FAISS neighbors inside that layout; press n or Escape to return."
  echo "6. Change Neighbors from 20 to 50, repeat one neighbor click, and confirm it stays responsive."
  echo "7. Keep DevTools console/network clean: no relevant errors or failed app requests."
  echo
}

trap finish EXIT INT TERM

echo "Verifying durable Anacronia latent map from this worktree"
echo "Worktree: $WORKTREE_ROOT"
echo "App data root: $APP_DATA_ROOT"
echo "Analysis Result: $ANALYSIS_RESULT_ID"
echo "URL: $LATENT_MAP_URL"
echo

mkdir -p "$PID_DIR" "$LOG_DIR" "$WORKTREE_RUNTIME_ROOT/temp/next-swc" "$APP_DATA_ROOT"

if [ ! -x ".venv/bin/anacronia" ]; then
  fail "Missing .venv/bin/anacronia. Double-click batch-cmd/setup-local-environment.command first."
fi

if [ ! -f "$RUN_DIR/manifest.jsonl" ]; then
  fail "Missing J Shoot latent-map run. Run batch-cmd/prepare-latent-map-j-shoot.command after creating the run."
fi

echo "Wrapping legacy run as durable Analysis Result"
.venv/bin/anacronia latent-map analysis-result-wrap --run-dir "$RUN_DIR" >/dev/null

missing=0
require_file "$RUN_DIR/analysis-result.json" "Analysis Result manifest" || missing=1
require_file "$RUN_DIR/viewer/atlases/32px/atlas-manifest.json" "32px baseline atlas manifest" || missing=1
require_file "$RUN_DIR/viewer/atlases/64px/atlas-manifest.json" "64px atlas manifest" || missing=1
require_file "$RUN_DIR/indexes/dinov3_vits_384_flat_ip.faiss" "DINOv3 384 FAISS index" || missing=1
require_file "$RUN_DIR/indexes/dinov3_vits_384_faiss_id_map.json" "DINOv3 384 FAISS ID map" || missing=1
require_file "$RUN_DIR/layouts/dinov3_vits_384_umap_n30_mindist0p1_seed42.json" "DINOv3 384 UMAP n=30 layout" || missing=1
require_file "$RUN_DIR/clusters/dinov3_vits_384_hdbscan_detail_mcs15_ms5_leaf.json" "DINOv3 384 HDBSCAN detail cluster result" || missing=1
require_file "$NEXT_BIN" "Next server binary" || missing=1
require_file "$PYTHON_BIN" "Python virtualenv" || missing=1

if [ "$missing" -ne 0 ]; then
  fail "Durable QA prerequisites are missing. Run batch-cmd/prepare-latent-map-j-shoot.command once, then run this command again."
fi

if [ "${ANACRONIA_SKIP_NEXT_BUILD:-}" != "1" ]; then
  echo "Building Next production app for this branch"
  (cd web && npm run build)
fi

export ANACRONIA_LATENT_MAP_RUNS_ROOT="$RUNS_ROOT"
export ANACRONIA_DATA_ROOT="$APP_DATA_ROOT"
export ANACRONIA_API_PORT="$APP_API_PORT"
export ANACRONIA_UI_PORT="$APP_UI_PORT"
export NEXT_SWC_PATH="$WORKTREE_RUNTIME_ROOT/temp/next-swc"
export HF_HOME="$WORKTREE_ROOT/.hf-cache"
mkdir -p "$HF_HOME"

existing_pid="$(port_pid || true)"
if [ -n "$existing_pid" ]; then
  echo "Port $APP_UI_PORT has an existing UI listener (PID $existing_pid). Restarting this worktree UI with the real app data root."
  stop_pid "$existing_pid"
fi

existing_pid="$(port_pid || true)"
if [ -n "$existing_pid" ]; then
  fail "Port $APP_UI_PORT is still occupied by PID $existing_pid. Stop the 18661 process and try again."
fi

existing_api_pid="$(api_port_pid || true)"
if [ -n "$existing_api_pid" ]; then
  echo "Port $APP_API_PORT has an existing API listener (PID $existing_api_pid). Restarting this worktree API with the real app data root."
  stop_pid "$existing_api_pid"
fi

existing_api_pid="$(api_port_pid || true)"
if [ -n "$existing_api_pid" ]; then
  fail "Port $APP_API_PORT is still occupied by PID $existing_api_pid. Stop the 18671 process and try again."
fi

: > "$API_LOG_FILE"
(
  cd "$WORKTREE_ROOT"
  "$PYTHON_BIN" -m uvicorn anacronia.api:create_app \
    --host 127.0.0.1 \
    --port "$APP_API_PORT" \
    --log-level info \
    --factory
) >> "$API_LOG_FILE" 2>&1 &
API_SERVER_PID="$!"
api_server_pid="$API_SERVER_PID"
echo "$api_server_pid" > "$API_PID_FILE"

for _ in {1..15}; do
  if api_is_healthy; then
    break
  fi

  if ! kill -0 "$api_server_pid" >/dev/null 2>&1; then
    fail "FastAPI backend exited before it became healthy."
  fi
  sleep 1
done

if ! api_is_healthy; then
  fail "Timed out waiting 15 seconds for the FastAPI backend on port $APP_API_PORT."
fi

start_epoch="$(date +%s)"
: > "$LOG_FILE"

(
  cd "$WORKTREE_ROOT/web"
  node "$NEXT_BIN" start --hostname 127.0.0.1 --port "$APP_UI_PORT"
) >> "$LOG_FILE" 2>&1 &
SERVER_PID="$!"
server_pid="$SERVER_PID"
echo "$server_pid" > "$PID_FILE"

for _ in {1..20}; do
  if page_is_healthy; then
    elapsed="$(( $(date +%s) - start_epoch ))"
    run_contract_check
    open_latent_map
    print_manual_checklist
    echo "Durable latent map is ready in ${elapsed}s."
    echo "PID: $server_pid"
    echo "Log: $LOG_FILE"
    echo "URL: $LATENT_MAP_URL"
    if [ "${ANACRONIA_BATCH_EXIT_AFTER_READY:-}" = "1" ]; then
      stop_pid "$server_pid"
      SERVER_PID=""
      exit 0
    fi
    echo
    echo "Leave this window open while using the durable latent map."
    wait "$server_pid"
    server_status="$?"
    SERVER_PID=""
    exit "$server_status"
  fi

  if ! kill -0 "$server_pid" >/dev/null 2>&1; then
    fail "Durable latent map server exited before the page became healthy."
  fi
  sleep 1
done

fail "Timed out waiting 20 seconds for $LATENT_MAP_URL."
