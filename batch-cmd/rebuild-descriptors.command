#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "Descriptor rebuild finished."
  else
    echo "Descriptor rebuild failed. Please send the text above in the Codex chat."
  fi
  echo
  read -r -p "Press Enter to close this window..."
  exit "$status"
}

trap finish EXIT

echo "Rebuilding Anacronia Descriptors from retained raw provider records..."
echo

if [ ! -x ".venv/bin/anacronia" ]; then
  echo "Missing Anacronia command at .venv/bin/anacronia."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

.venv/bin/anacronia rebuild-descriptors
