#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULT_ID="analysis-result-20260616T235200Z-dinov3_vits_384"
APP_URL="http://localhost:18660/latent-map?analysisResultId=${RESULT_ID}"

cd "$ROOT_DIR/web"

echo "Measuring latent-map first-open startup on the running Anacronia app..."
echo "$APP_URL"
echo

npm run measure:latent-map -- --url "$APP_URL"

echo
echo "Done. Press any key to close this window."
read -k 1
