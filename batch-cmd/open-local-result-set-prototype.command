#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_URL="http://localhost:18660"
PROTOTYPE_URL="$APP_URL/prototype/local-result-set?scope=collection&search_set=snake-study&view=objects"

finish() {
  status=$?
  echo
  if [ "$status" -ne 0 ]; then
    echo "Prototype launcher stopped with an error. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Opening Anacronia Local Result Set prototype"
echo

if curl --silent --fail --max-time 2 "$APP_URL" >/dev/null 2>&1; then
  echo "Anacronia is already running."
  echo "Opening $PROTOTYPE_URL"
  open "$PROTOTYPE_URL"
  exit 0
fi

if [ ! -x ".venv/bin/anacronia" ]; then
  echo "Missing Anacronia command at .venv/bin/anacronia."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

echo "Anacronia is not running yet."
echo "Starting it now. Keep this Terminal window open while using the prototype."
echo

.venv/bin/anacronia --no-open &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup INT TERM

for _ in $(seq 1 120); do
  if curl --silent --fail --max-time 2 "$APP_URL" >/dev/null 2>&1; then
    echo "Opening $PROTOTYPE_URL"
    open "$PROTOTYPE_URL"
    wait "$APP_PID"
    exit $?
  fi
  sleep 1
done

echo "Timed out waiting for Anacronia at $APP_URL."
cleanup
exit 1
