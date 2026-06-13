#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

RUN_ID="20260609T130049Z-mvp1-j-shoot-20260609"
RUN_DIR="/private/tmp/anacronia-latent-map-runs/$RUN_ID"
VIEWER_DATA="$RUN_DIR/viewer/map-data.json"
WORKTREE_DATA_ROOT="/private/tmp/anacronia-latent-map-worktree-data"
HDBSCAN_CLUSTER_IDS=(
  hdbscan_fine_mcs10_ms5_eom
  hdbscan_detail_mcs15_ms5_leaf
  hdbscan_balanced_mcs25_ms10_eom
  hdbscan_broad_mcs50_ms15_eom
)
GRAPH_COMMUNITY_CLUSTER_IDS=(
  graph_communities_broad_k12_res0p7_min2
  graph_communities_balanced_k8_res0p6_min2
  graph_communities_detail_k6_res0p65_min2
  graph_communities_fine_k3_res0p7_min2
)
HIERARCHY_CLUSTER_IDS=(
  hierarchy_broad_k24_average_cosine_l2
  hierarchy_balanced_k48_average_cosine_l2
  hierarchy_detail_k96_average_cosine_l2
  hierarchy_fine_k192_average_cosine_l2
)

finish() {
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    echo "Latent-map prep is complete."
    echo "Now double-click batch-cmd/start-latent-map-j-shoot.command."
  else
    echo "Latent-map prep stopped with an error. Please send the text above in the Codex chat."
  fi
  echo
  if [ "${ANACRONIA_BATCH_NO_PAUSE:-}" != "1" ]; then
    read -r -p "Press Enter to close this window..."
  fi
  exit "$status"
}

trap finish EXIT

echo "Preparing Anacronia latent-map generated files"
echo "Worktree: $(pwd)"
echo "Run: $RUN_ID"
echo

if [ ! -x ".venv/bin/anacronia" ]; then
  echo "Missing Anacronia command at .venv/bin/anacronia."
  echo "Double-click batch-cmd/setup-local-environment.command first."
  exit 1
fi

if [ ! -f "$VIEWER_DATA" ]; then
  echo "Missing viewer data:"
  echo "$VIEWER_DATA"
  echo
  echo "The J Shoot latent-map run must exist before prep can run."
  exit 1
fi

mkdir -p "$WORKTREE_DATA_ROOT/temp/next-swc"
export LOKY_MAX_CPU_COUNT="${LOKY_MAX_CPU_COUNT:-8}"
export NEXT_SWC_PATH="$WORKTREE_DATA_ROOT/temp/next-swc"

for tile_size in 32 64 96 128; do
  manifest_path="$RUN_DIR/viewer/atlases/${tile_size}px/atlas-manifest.json"
  if [ ! -f "$manifest_path" ]; then
    echo "Generating ${tile_size}px atlas"
    .venv/bin/anacronia latent-map atlas \
      --run-dir "$RUN_DIR" \
      --tile-size "$tile_size" \
      --atlas-size 2048
  else
    echo "Found ${tile_size}px atlas"
  fi
done

for recipe in dinov3_vits_256 dinov3_vits_384; do
  for n_neighbors in 2 6 10 15 30 50; do
    layout_path="$RUN_DIR/layouts/${recipe}_umap_n${n_neighbors}_mindist0p1_seed42.json"
    if [ ! -f "$layout_path" ]; then
      echo "Generating UMAP layout for ${recipe}: n=${n_neighbors}, min_dist=0.1"
      .venv/bin/anacronia latent-map layout \
        --run-dir "$RUN_DIR" \
        --recipe "$recipe" \
        --n-neighbors "$n_neighbors" \
        --min-dist 0.1 \
        --cluster-count 12 \
        --random-state 42
    else
      echo "Found UMAP layout for ${recipe}: n=${n_neighbors}, min_dist=0.1"
    fi
  done

  neighbors_path="$RUN_DIR/indexes/${recipe}_neighbors.jsonl"
  if [ ! -f "$neighbors_path" ] || ! grep --silent '"neighbor_rank": 50' "$neighbors_path"; then
    echo "Generating FAISS top-50 neighbors for ${recipe}"
    .venv/bin/anacronia latent-map faiss-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --top-k 50
  else
    echo "Found FAISS top-50 neighbors for ${recipe}"
  fi

  hdbscan_missing=0
  for cluster_id in "${HDBSCAN_CLUSTER_IDS[@]}"; do
    if [ ! -f "$RUN_DIR/clusters/${recipe}_${cluster_id}.json" ]; then
      hdbscan_missing=1
      break
    fi
  done

  if [ "$hdbscan_missing" -eq 1 ]; then
    echo "Generating HDBSCAN presets for ${recipe}"
    .venv/bin/anacronia latent-map hdbscan-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --preset all
  else
    echo "Found HDBSCAN presets for ${recipe}"
  fi

  graph_communities_missing=0
  for cluster_id in "${GRAPH_COMMUNITY_CLUSTER_IDS[@]}"; do
    if [ ! -f "$RUN_DIR/clusters/${recipe}_${cluster_id}.json" ]; then
      graph_communities_missing=1
      break
    fi
  done

  if [ "$graph_communities_missing" -eq 1 ]; then
    echo "Generating graph-community presets for ${recipe}"
    .venv/bin/anacronia latent-map graph-communities-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --preset all
  else
    echo "Found graph-community presets for ${recipe}"
  fi

  hierarchy_missing=0
  for cluster_id in "${HIERARCHY_CLUSTER_IDS[@]}"; do
    if [ ! -f "$RUN_DIR/clusters/${recipe}_${cluster_id}.json" ]; then
      hierarchy_missing=1
      break
    fi
  done

  if [ "$hierarchy_missing" -eq 1 ]; then
    echo "Generating hierarchy presets for ${recipe}"
    .venv/bin/anacronia latent-map hierarchy-build \
      --run-dir "$RUN_DIR" \
      --recipe "$recipe" \
      --preset all
  else
    echo "Found hierarchy presets for ${recipe}"
  fi
done

echo "Building Next production app"
(
  cd web
  npm run build
)
