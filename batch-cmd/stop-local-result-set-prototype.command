#!/bin/zsh
set -euo pipefail

LABEL="com.anacronia.local-result-set-prototype"
PORT="18661"

echo "Stopping Local Result Set prototype server..."

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 ||
    launchctl remove "${LABEL}" >/dev/null 2>&1 ||
    true
fi

PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${PIDS}" ]]; then
  echo "${PIDS}" | xargs kill >/dev/null 2>&1 || true
fi

echo "Prototype server stopped."
echo
echo "You can close this window."
