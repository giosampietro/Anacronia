#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "Hugging Face login finished."
  else
    echo "Hugging Face login failed. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Anacronia Hugging Face login"
echo "Project: $(pwd)"
echo

if [ ! -x ".venv/bin/hf" ]; then
  echo "The Hugging Face CLI is missing."
  echo "Run batch-cmd/setup-dinov3-local.command first."
  exit 1
fi

export HF_HOME="$(pwd)/.hf-cache"
mkdir -p "$HF_HOME"

echo "Before logging in:"
echo "1. Open https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m"
echo "2. Log in to Hugging Face and request/accept access to the model."
echo "3. Open https://huggingface.co/settings/tokens"
echo "4. Create a token with read access."
echo
echo "Do not paste the token into Codex chat. Paste it only into this Terminal window."
echo "The token will be stored locally under .hf-cache/, which is ignored by Git."
echo

.venv/bin/hf auth login --force --no-add-to-git-credential
