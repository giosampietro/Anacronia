#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "DINOv3 local setup check finished."
  else
    echo "DINOv3 local setup failed. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Anacronia DINOv3 local setup"
echo "Project: $(pwd)"
echo

if [ ! -x ".venv/bin/python" ]; then
  echo ".venv is missing. Run batch-cmd/setup-local-environment.command first."
  exit 1
fi

export HF_HOME="$(pwd)/.hf-cache"
mkdir -p "$HF_HOME"

echo "Installing local image-embedding dependencies"
.venv/bin/python -m pip install --upgrade \
  "torch" \
  "torchvision" \
  "transformers" \
  "huggingface_hub" \
  "safetensors" \
  "numpy" \
  "faiss-cpu" \
  "umap-learn" \
  "scikit-learn"

echo
echo "Checking Apple Silicon acceleration and DINOv3 access"
.venv/bin/python - <<'PY'
import platform

import torch
from huggingface_hub import HfApi

repo_id = "facebook/dinov3-vits16-pretrain-lvd1689m"

print(f"Python platform: {platform.platform()}")
print(f"PyTorch: {torch.__version__}")
print(f"MPS available: {torch.backends.mps.is_available()}")

try:
    info = HfApi().model_info(repo_id)
except Exception as exc:
    print()
    print(f"Could not read Hugging Face model info for {repo_id}.")
    print(str(exc))
    raise

print()
print(f"Model: {repo_id}")
print(f"Downloads: {getattr(info, 'downloads', 'unknown')}")
print(f"Gated: {getattr(info, 'gated', 'unknown')}")
print()
print("If model loading later fails with a gated/auth error:")
print("1. Open https://hf.co/facebook/dinov3-vits16-pretrain-lvd1689m")
print("2. Accept Meta's model terms.")
print("3. Log in locally with a Hugging Face read token.")
PY
