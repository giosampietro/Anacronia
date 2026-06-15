# SigLIP2 local model assessment

Date: June 15, 2026

## Context

SigLIP2 should remain future durable Analysis Studio work, not another legacy
latent-map prototype path. The durable contract is:

- one Analysis Scope snapshot supplies the image population;
- each Analysis Recipe produces one sibling Analysis Result;
- DINOv3 and SigLIP2 stay separate embedding spaces until an explicit fusion
  recipe exists;
- the Latent Space Explorer opens one primary Analysis Result at a time.

This note captures model-selection and runtime caveats for issue
[#192](https://github.com/giosampietro/Anacronia/issues/192). It should guide
future implementation without making SigLIP2 a blocker for the current DINOv3
Analysis Studio and Project Viewer Export path.

## Current recommendation

Do not choose a single SigLIP2 model by assertion. First benchmark the two
base fixed-resolution candidates on real Anacronia collections:

| Candidate | Proposed role | Notes |
| --- | --- | --- |
| `google/siglip2-base-patch16-384` | quality candidate | 0.4B/F32 checkpoint, 768-d image embeddings, strongest base fixed-res tradeoff among 224/256/384. |
| `google/siglip2-base-patch16-256` | cost-quality candidate | Same base family, much lower patch count than 384 while retaining most of the benchmark gain over 224. |
| `google/siglip2-base-patch16-224` | last-resort fallback | Lower activation cost, but weaker than 256 and should not silently replace 384 output. |
| `google/siglip2-base-patch16-naflex` | separate early benchmark | Aspect-ratio-aware and relevant for museum/fashion/reference imagery, but different processor/model path and not automatically more detailed. |
| `google/siglip2-so400m-*` | quality ceiling later | Useful benchmark ceiling, not a default for a MacBook M1 Pro with 16 GB unified memory. |

Default first implementation candidate is still `base-patch16-384` if the
real-weight smoke test passes. The revised fallback ladder is `384 -> 256 ->
224`, where each resolution is a distinct recipe/result. Never store 224px
embeddings under a 384px recipe ID.

## Benchmark facts to preserve

Google's SigLIP2 checkpoint table reports these base fixed-res metrics:

- B/16 224: INet 78.2, COCO text-to-image 52.1, COCO image-to-text 68.9.
- B/16 256: INet 79.1, COCO text-to-image 53.2, COCO image-to-text 69.7.
- B/16 384: INet 80.6, COCO text-to-image 54.6, COCO image-to-text 71.4.

Patch count rises quickly: 224/16 gives 196 patches, 256/16 gives 256 patches,
and 384/16 gives 576 patches. That is why 256 must be tested as the likely
cost-quality knee on the user's MacBook M1 Pro.

The same table reports base NaFlex at sequence length 256 as INet 78.5, COCO
text-to-image 51.1, COCO image-to-text 67.3. NaFlex has the right
aspect-ratio bias, but the published base retrieval numbers do not make it an
automatic first default.

## Recipe identity versus runtime diagnostics

Analysis Recipe identity and reusable Image Embedding Result fingerprints
should include:

- recipe ID;
- model family;
- model ID and revision;
- processor/preprocessor ID and version;
- fixed input size or NaFlex patch policy;
- input derivative, usually `standard-1024`;
- vector kind and dimension;
- normalization;
- downstream artifact contract.

Runtime settings should not become recipe identity or first-pass Studio UI
controls:

- device/backend, such as `mps` or `cpu`;
- batch size;
- fp16/fp32 inference dtype, unless later evidence shows dtype changes output
  enough to require separate embedding fingerprints;
- sequential model loading/unloading;
- elapsed time, memory pressure, and retry history.

Record those runtime values in Analysis Job provenance, diagnostics, or
failure reports. If memory pressure requires trying a lower-resolution model,
run an explicit lower-resolution recipe instead of silently substituting
outputs.

## Loader and implementation caveats

Fixed-resolution SigLIP2 checkpoints are backwards-compatible with SigLIP and
load through the `siglip` family in Transformers. NaFlex checkpoints use the
`siglip2` family and a dynamic-resolution processor. Future code should use
`AutoConfig` and `AutoProcessor`, then branch by checkpoint family rather than
hard-coding `Siglip2Model`.

For image-only embedding work in #192, prefer loading the vision tower and
normalizing `pooler_output` to CPU `float32` before FAISS. A full text-image
`AutoModel` loads the text tower and belongs to a later text-retrieval issue
unless #192 explicitly expands scope.

The fixed-res implementation should not reuse DINOv3 image preprocessing.
SigLIP2 preprocessing belongs to the Hugging Face processor or to a recorded
Anacronia wrapper around that processor.

NaFlex should be its own recipe, not a flag on a fixed-resolution recipe. Its
provenance should record patch size, max patch count, resize policy, padding
or mask behavior, and processor/model family.

## Local MPS caveats

The user's target machine is a MacBook M1 Pro with 16 GB unified memory.
PyTorch MPS is the right local acceleration target, but the first SigLIP2 issue
must include a setup/smoke-test slice before durable integration:

- verify Python, PyTorch, Transformers, Hugging Face Hub, and safetensors in
  the app `.venv`;
- verify `torch.backends.mps.is_available()`;
- download real weights, not only processor files;
- embed one real Anacronia `standard-1024` image;
- verify output shape, finite values, nonzero norm, L2-normalized CPU
  `float32` vectors, and stable artifact metadata;
- compare CPU/MPS behavior enough to catch obvious dtype/device failures.

Do not add heavy ML dependencies to `pyproject.toml` or create a SigLIP2 setup
command as part of this capture note. That belongs to the future SigLIP2
runtime/model setup issue.

## Text and fusion non-goals

#192 should remain image-embedding work.

Text retrieval needs a separate issue because prompt templates, lowercasing,
padding/truncation, descriptor selection, search terms, and freeform prompts
are retrieval-contract choices, not just model calls.

Fusion, weighting controls, disagreement analysis, and raw vector mixing also
remain separate follow-up work. Fusion should be represented as an explicit
fusion recipe/result or documented analysis artifact after DINOv3 and SigLIP2
exist as separate sibling Analysis Results.

## Sources

- [Google big_vision SigLIP2 checkpoint table](https://raw.githubusercontent.com/google-research/big_vision/main/big_vision/configs/proj/image_text/README_siglip2.md)
- [Hugging Face SigLIP2 collection](https://huggingface.co/collections/google/siglip2)
- [Hugging Face `google/siglip2-base-patch16-384` model card](https://huggingface.co/google/siglip2-base-patch16-384)
- [Hugging Face `google/siglip2-base-patch16-256` model card](https://huggingface.co/google/siglip2-base-patch16-256)
- [Transformers SigLIP2 documentation](https://huggingface.co/docs/transformers/en/model_doc/siglip2)
- [Apple PyTorch MPS guidance](https://developer.apple.com/metal/pytorch/)
- [PyTorch MPS backend docs](https://docs.pytorch.org/docs/2.12/notes/mps.html)
