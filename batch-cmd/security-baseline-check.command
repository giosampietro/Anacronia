#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "Anacronia security baseline check"
echo "Repository: $REPO_ROOT"
echo

if [ ! -x ".venv/bin/python" ]; then
  echo "Missing .venv/bin/python. Run batch-cmd/setup-local-environment.command first."
  echo
  read -r "REPLY?Press Return to close..."
  exit 1
fi

echo "Running Python tests..."
.venv/bin/python -m pytest
echo

echo "Running web tests..."
(
  cd web
  npm test
)
echo

echo "Running production dependency audit..."
(
  cd web
  npm audit --omit=dev || true
)
echo

cat <<'MESSAGE'
Local baseline finished.

This command does not run the full Codex Security plugin scan.
For the full rerun, ask Codex:

Run @codex-security repository-wide and compare it to docs/security/security-risk-register-2026-06-08.md
MESSAGE

echo
read -r "REPLY?Press Return to close..."
