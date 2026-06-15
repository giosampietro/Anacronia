#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "Issue #292 verification passed."
  else
    echo "Issue #292 verification failed. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Anacronia issue #292 verification"
echo "Project: $(pwd)"
echo

if [ ! -x ".venv/bin/python" ]; then
  echo "Missing Python environment at .venv/bin/python."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

echo "1/2 Python runtime/API tests"
.venv/bin/python -m pytest -q \
  tests/test_analysis_job_runtime.py \
  tests/test_analysis_job_api.py \
  tests/test_analysis_jobs.py

echo
echo "2/2 Web Analysis Studio tests"
(
  cd web
  npm_config_cache=/private/tmp/npm-cache npm test -- \
    src/app/api/analysis-jobs/route.test.ts \
    src/app/analysis-results/page.test.tsx
)
