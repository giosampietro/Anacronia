#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "DINO Apple Silicon check finished."
  else
    echo "DINO Apple Silicon check failed. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Anacronia DINO Apple Silicon check"
echo "Project: $(pwd)"
echo

if [ ! -x ".venv/bin/python" ]; then
  echo ".venv is missing. Run batch-cmd/setup-local-environment.command first."
  exit 1
fi

export HF_HOME="$(pwd)/.hf-cache"
mkdir -p "$HF_HOME"

.venv/bin/python - <<'PY'
import time

try:
    import torch
    from PIL import Image
    from huggingface_hub import HfApi, get_token
    from transformers import AutoConfig, AutoImageProcessor, AutoModel, DINOv3ViTConfig, DINOv3ViTModel
except Exception as exc:
    print("Missing image-embedding dependency.")
    print("Run batch-cmd/setup-dinov3-local.command first.")
    print()
    raise

dinov3_repo = "facebook/dinov3-vits16-pretrain-lvd1689m"
smoke_repo = "facebook/dinov2-small"

print(f"PyTorch: {torch.__version__}")
print(f"MPS built: {torch.backends.mps.is_built()}")
print(f"MPS available: {torch.backends.mps.is_available()}")

if torch.backends.mps.is_available():
    x = torch.ones(4, device="mps")
    print(f"MPS tensor test: {x.device}, sum={float(x.sum().cpu())}")
else:
    print("MPS is not available in this Terminal session.")

print()
print(f"DINOv3 repo: {dinov3_repo}")
try:
    info = HfApi().model_info(dinov3_repo, files_metadata=True)
    model_file = next(
        (s for s in info.siblings if s.rfilename == "model.safetensors"),
        None,
    )
    print(f"Pipeline: {info.pipeline_tag}")
    print(f"Library: {info.library_name}")
    print(f"Gated: {info.gated}")
    if model_file and getattr(model_file, "size", None):
        print(f"Weight file: {model_file.size / 1024 / 1024:.1f} MB")
except Exception as exc:
    print("Could not read DINOv3 model metadata.")
    print(type(exc).__name__ + ": " + str(exc)[:500])

print(f"Hugging Face token present: {bool(get_token())}")
try:
    config = AutoConfig.from_pretrained(dinov3_repo)
    print(f"DINOv3 gated file access: OK ({config.model_type})")
except Exception as exc:
    print("DINOv3 gated file access: NOT AVAILABLE YET")
    print(type(exc).__name__ + ": " + str(exc)[:300])
print()

if torch.backends.mps.is_available():
    print("DINOv3 architecture MPS test")
    config = DINOv3ViTConfig()
    model = DINOv3ViTModel(config).to("mps").eval()
    pixels = torch.rand(1, 3, config.image_size, config.image_size, device="mps")
    with torch.no_grad():
        outputs = model(pixel_values=pixels)
    torch.mps.synchronize()
    print(f"last_hidden_state={tuple(outputs.last_hidden_state.shape)}")
    print(f"pooler_output={tuple(outputs.pooler_output.shape)}")
    print()

device_names = ["cpu"]
if torch.backends.mps.is_available():
    device_names.append("mps")

print(f"Public smoke-test model: {smoke_repo}")
processor = AutoImageProcessor.from_pretrained(smoke_repo)
image = Image.new("RGB", (224, 224), (240, 240, 235))

for device in device_names:
    model = AutoModel.from_pretrained(smoke_repo).to(device).eval()
    inputs = {
        key: value.to(device)
        for key, value in processor(images=image, return_tensors="pt").items()
    }

    for _ in range(2):
        with torch.no_grad():
            outputs = model(**inputs)
    if device == "mps":
        torch.mps.synchronize()

    start = time.perf_counter()
    with torch.no_grad():
        for _ in range(20):
            outputs = model(**inputs)
    if device == "mps":
        torch.mps.synchronize()
    elapsed = time.perf_counter() - start

    cls = outputs.last_hidden_state[:, 0]
    print(
        f"{device}: {elapsed / 20 * 1000:.2f} ms/image, "
        f"embedding_dim={cls.shape[-1]}, norm={float(cls.norm().cpu()):.4f}"
    )
PY
