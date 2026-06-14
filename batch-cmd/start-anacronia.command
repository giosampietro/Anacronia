#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "Anacronia stopped."
  else
    echo "Anacronia stopped with an error. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Starting Anacronia"
echo "Leave this window open while using the app."
echo "The browser will open automatically at http://localhost:18660 when Anacronia is ready."
echo

if [ ! -x ".venv/bin/anacronia" ]; then
  echo "Missing Anacronia command at .venv/bin/anacronia."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

export HF_HOME="$(pwd)/.hf-cache"
mkdir -p "$HF_HOME"

.venv/bin/python - <<'PY'
import platform
import sys

if sys.version_info < (3, 12):
    raise SystemExit("Anacronia requires Python 3.12 or newer.")

if platform.system() != "Darwin" or platform.machine() not in {"arm64", "arm64e"}:
    raise SystemExit("Anacronia requires an Apple Silicon Mac, M1 or newer.")
PY

.venv/bin/anacronia
