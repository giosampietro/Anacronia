#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "All Anacronia bootstrap checks passed."
  else
    echo "A check failed. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Anacronia bootstrap verification"
echo "Project: $(pwd)"
echo "This checks the project. It does not open the app."
echo "To open Anacronia in your browser, double-click batch-cmd/open-anacronia.command."
echo

if [ ! -x ".venv/bin/python" ]; then
  echo "Missing Python environment at .venv/bin/python."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

.venv/bin/python - <<'PY'
import platform
import sys

if sys.version_info < (3, 12):
    raise SystemExit("Anacronia requires Python 3.12 or newer.")

if platform.system() != "Darwin" or platform.machine() not in {"arm64", "arm64e"}:
    raise SystemExit("Anacronia requires an Apple Silicon Mac, M1 or newer.")
PY

if [ ! -d "web/node_modules" ]; then
  echo "Missing web dependencies at web/node_modules."
  echo "Ask Codex to install the web dependencies again."
  exit 1
fi

echo "1/4 Python tests"
.venv/bin/python -m pytest tests

echo
echo "2/4 Web tests"
(
  cd web
  npm_config_cache=/private/tmp/npm-cache npm test
)

echo
echo "3/4 Web lint"
(
  cd web
  npm_config_cache=/private/tmp/npm-cache npm run lint
)

echo
echo "4/4 Web production build"
(
  cd web
  npm_config_cache=/private/tmp/npm-cache npm run build
)
