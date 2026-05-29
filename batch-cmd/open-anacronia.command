#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_URL="http://localhost:18660"

echo "Opening Anacronia"
echo

if curl --silent --fail --max-time 2 "$APP_URL" >/dev/null 2>&1; then
  echo "Anacronia is already running."
  echo "Opening $APP_URL in your browser."
  open "$APP_URL"
  echo
  echo "Done. You can close this window."
  read -r -p "Press Enter to close this window..."
  exit 0
fi

echo "Anacronia is not running yet."
echo "Starting it now. Keep this Terminal window open while using the app."
echo "The browser will open automatically when Anacronia is ready."
echo

exec ./batch-cmd/start-anacronia.command
