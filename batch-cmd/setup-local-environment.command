#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "Anacronia local environment is ready."
  else
    echo "Setup failed. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Anacronia local environment setup"
echo "Project: $(pwd)"
echo

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "Anacronia requires an Apple Silicon Mac, M1 or newer."
  exit 1
fi

if [ ! -x "/opt/homebrew/bin/python3.12" ]; then
  if [ ! -x "/opt/homebrew/bin/brew" ]; then
    echo "Homebrew is required to install Python 3.12 automatically."
    echo "Ask Codex to help install Homebrew and Python 3.12."
    exit 1
  fi

  echo "Python 3.12 is missing. Homebrew will install it now."
  echo "This can take several minutes."
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to continue, or close this window to stop..."
  fi
  /opt/homebrew/bin/brew install python@3.12
fi

echo "Using Python:"
/opt/homebrew/bin/python3.12 --version

echo
echo "Rebuilding .venv with Python 3.12"
/opt/homebrew/bin/python3.12 -m venv --clear .venv

echo
echo "Installing Anacronia Python dependencies"
.venv/bin/python -m pip install -e '.[dev]'
