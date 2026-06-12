import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LATENT_MAP_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";

type NeighborIndex = {
  neighbors_by_image_id?: Record<
    string,
    { image_id?: unknown; rank?: unknown; score?: unknown }[]
  >;
  recipe_name?: unknown;
  run_id?: unknown;
  schema_version?: unknown;
};

type NeighborJsonlRow = {
  image_id?: unknown;
  neighbor_image_id?: unknown;
  neighbor_rank?: unknown;
  score?: unknown;
};

type NeighborRow = {
  image_id: string;
  rank: number;
  score: number;
};

type FaissRelationMode = "closest" | "opposite" | "both";

type FaissIdMapRow = {
  faiss_id?: unknown;
  image_id?: unknown;
  relative_path?: unknown;
  source_path?: unknown;
};

type EmbeddingIndex = {
  idMap: FaissIdMapRow[];
  imageIdToFaissId: Map<string, number>;
  normalizedVectors: Float32Array;
  vectorCount: number;
  vectorDim: number;
};

const embeddingIndexCache = new Map<string, Promise<EmbeddingIndex>>();

export async function GET(request: NextRequest) {
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");
  const imageId = request.nextUrl.searchParams.get("image_id");
  const topK = parseTopK(request.nextUrl.searchParams.get("top_k"));
  const relationMode = parseRelationMode(
    request.nextUrl.searchParams.get("relation"),
  );

  if (!runName || !relativePath || !imageId) {
    return new Response("Missing latent-map neighbor configuration.", {
      status: 404,
    });
  }

  const resolvedRunsRoot = path.resolve(LATENT_MAP_RUNS_ROOT);
  const resolvedRunDir = path.resolve(resolvedRunsRoot, runName);
  const neighborIndexPath = path.resolve(resolvedRunDir, relativePath);
  const allowedPrefix = `${resolvedRunDir}${path.sep}`;
  const allowedRootPrefix = `${resolvedRunsRoot}${path.sep}`;

  if (
    !resolvedRunDir.startsWith(allowedRootPrefix) ||
    (neighborIndexPath !== resolvedRunDir &&
      !neighborIndexPath.startsWith(allowedPrefix))
  ) {
    return new Response("Neighbor path is outside the latent-map run.", {
      status: 403,
    });
  }

  try {
    const closestResult =
      relationMode === "opposite"
        ? {
            recipeName: recipeNameFromNeighborPath(relativePath),
            rows: [],
          }
        : await loadClosestNeighbors({
            imageId,
            neighborIndexPath,
            relativePath,
            topK,
          });

    if (
      relationMode !== "opposite" &&
      closestResult.rows.length === 0
    ) {
      return new Response("FAISS neighbors not found for selected image.", {
        status: 404,
      });
    }

    const oppositeRows =
      relationMode === "closest"
        ? []
        : await queryEmbeddingRelations({
            imageId,
            recipeName: closestResult.recipeName,
            relation: "opposite",
            runDir: resolvedRunDir,
            topK,
          });

    return Response.json({
      schema_version: 1,
      image_id: imageId,
      neighbors: closestResult.rows,
      opposites: oppositeRows,
      recipe_name: closestResult.recipeName,
      relation: relationMode,
      run_id: runName,
      top_k: topK,
    });
  } catch {
    return new Response("FAISS neighbor index not found.", { status: 404 });
  }
}

async function loadClosestNeighbors({
  imageId,
  neighborIndexPath,
  relativePath,
  topK,
}: {
  imageId: string;
  neighborIndexPath: string;
  relativePath: string;
  topK: number;
}): Promise<{ recipeName: string; rows: NeighborRow[] }> {
  if (neighborIndexPath.endsWith(".jsonl")) {
    const rows = (await readFile(
      /*turbopackIgnore: true*/ neighborIndexPath,
      "utf-8",
    ))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as NeighborJsonlRow)
      .filter((row) => String(row.image_id ?? "") === imageId)
      .sort(
        (left, right) =>
          Number(left.neighbor_rank ?? 0) - Number(right.neighbor_rank ?? 0),
      )
      .slice(0, topK);

    return {
      recipeName: recipeNameFromNeighborPath(relativePath),
      rows: rows.map((row) => ({
        image_id: String(row.neighbor_image_id ?? ""),
        rank: Number(row.neighbor_rank ?? 0),
        score: Number(row.score ?? 0),
      })),
    };
  }

  const neighborIndex = JSON.parse(
    await readFile(/*turbopackIgnore: true*/ neighborIndexPath, "utf-8"),
  ) as NeighborIndex;
  const neighbors = neighborIndex.neighbors_by_image_id?.[imageId];

  if (!Array.isArray(neighbors)) {
    return {
      recipeName: String(neighborIndex.recipe_name ?? ""),
      rows: [],
    };
  }

  return {
    recipeName: String(neighborIndex.recipe_name ?? ""),
    rows: neighbors.slice(0, topK).map((neighbor) => ({
      image_id: String(neighbor.image_id ?? ""),
      rank: Number(neighbor.rank ?? 0),
      score: Number(neighbor.score ?? 0),
    })),
  };
}

async function queryEmbeddingRelations({
  imageId,
  recipeName,
  relation,
  runDir,
  topK,
}: {
  imageId: string;
  recipeName: string;
  relation: "opposite";
  runDir: string;
  topK: number;
}): Promise<NeighborRow[]> {
  if (!recipeName) {
    throw new Error("FAISS recipe is unavailable.");
  }

  const embeddingIndex = await loadEmbeddingIndex({ recipeName, runDir });
  const faissId = embeddingIndex.imageIdToFaissId.get(imageId);

  if (faissId === undefined || faissId >= embeddingIndex.vectorCount) {
    throw new Error("Image ID not found in FAISS map.");
  }

  const scoredRows: { faissId: number; score: number }[] = [];
  const queryOffset = faissId * embeddingIndex.vectorDim;

  for (let candidateId = 0; candidateId < embeddingIndex.vectorCount; candidateId += 1) {
    if (candidateId === faissId) {
      continue;
    }

    let score = 0;
    const candidateOffset = candidateId * embeddingIndex.vectorDim;

    for (let dim = 0; dim < embeddingIndex.vectorDim; dim += 1) {
      score +=
        embeddingIndex.normalizedVectors[queryOffset + dim] *
        embeddingIndex.normalizedVectors[candidateOffset + dim];
    }

    scoredRows.push({ faissId: candidateId, score });
  }

  scoredRows.sort((left, right) =>
    relation === "opposite" ? left.score - right.score : right.score - left.score,
  );

  return scoredRows.slice(0, topK).map((row, index) => {
    const idMapRow = embeddingIndex.idMap[row.faissId];

    return {
      image_id: String(idMapRow?.image_id ?? ""),
      rank: index + 1,
      score: row.score,
    };
  });
}

async function loadEmbeddingIndex({
  recipeName,
  runDir,
}: {
  recipeName: string;
  runDir: string;
}): Promise<EmbeddingIndex> {
  const key = `${runDir}:${recipeName}`;
  const cachedIndex = embeddingIndexCache.get(key);

  if (cachedIndex) {
    return cachedIndex;
  }

  const indexPromise = readEmbeddingIndex({ recipeName, runDir });
  embeddingIndexCache.set(key, indexPromise);

  return indexPromise;
}

async function readEmbeddingIndex({
  recipeName,
  runDir,
}: {
  recipeName: string;
  runDir: string;
}): Promise<EmbeddingIndex> {
  const embeddingPath = path.join(runDir, "embeddings", `${recipeName}.npy`);
  const idMapPath = path.join(runDir, "indexes", `${recipeName}_faiss_id_map.json`);
  const [embeddingBuffer, rawIdMap] = await Promise.all([
    readFile(/*turbopackIgnore: true*/ embeddingPath),
    readFile(/*turbopackIgnore: true*/ idMapPath, "utf-8"),
  ]);
  const idMap = JSON.parse(rawIdMap) as FaissIdMapRow[];
  const matrix = parseFloat32NpyMatrix(embeddingBuffer);
  const vectorCount = Math.min(matrix.rows, idMap.length);
  const normalizedVectors = normalizeVectorMatrix({
    cols: matrix.cols,
    rows: vectorCount,
    values: matrix.values,
  });
  const imageIdToFaissId = new Map<string, number>();

  idMap.slice(0, vectorCount).forEach((row, index) => {
    const imageId = String(row.image_id ?? "");
    const faissId = Number(row.faiss_id ?? index);

    if (imageId && Number.isInteger(faissId)) {
      imageIdToFaissId.set(imageId, faissId);
    }
  });

  return {
    idMap,
    imageIdToFaissId,
    normalizedVectors,
    vectorCount,
    vectorDim: matrix.cols,
  };
}

function parseFloat32NpyMatrix(buffer: Buffer): {
  cols: number;
  rows: number;
  values: Float32Array;
} {
  if (buffer.subarray(0, 6).toString("latin1") !== "\u0093NUMPY") {
    throw new Error("Embedding file is not a NumPy array.");
  }

  const majorVersion = buffer[6];
  const headerLength =
    majorVersion === 1 ? buffer.readUInt16LE(8) : buffer.readUInt32LE(8);
  const headerStart = majorVersion === 1 ? 10 : 12;
  const header = buffer
    .subarray(headerStart, headerStart + headerLength)
    .toString("latin1");
  const descriptor = header.match(/'descr':\s*'([^']+)'/)?.[1];
  const fortranOrder = header.match(/'fortran_order':\s*(False|True)/)?.[1];
  const shape = header.match(/'shape':\s*\((\d+),\s*(\d+),?\)/);

  if (descriptor !== "<f4" && descriptor !== "|f4") {
    throw new Error("Embedding array must be little-endian float32.");
  }
  if (fortranOrder !== "False") {
    throw new Error("Embedding array must be C-contiguous.");
  }
  if (!shape) {
    throw new Error("Embedding array shape is unavailable.");
  }

  const rows = Number(shape[1]);
  const cols = Number(shape[2]);
  const byteOffset = headerStart + headerLength;
  const byteLength = rows * cols * Float32Array.BYTES_PER_ELEMENT;
  const values = new Float32Array(
    buffer.buffer.slice(
      buffer.byteOffset + byteOffset,
      buffer.byteOffset + byteOffset + byteLength,
    ),
  );

  return { cols, rows, values };
}

function normalizeVectorMatrix({
  cols,
  rows,
  values,
}: {
  cols: number;
  rows: number;
  values: Float32Array;
}): Float32Array {
  const normalized = new Float32Array(rows * cols);

  for (let row = 0; row < rows; row += 1) {
    const offset = row * cols;
    let norm = 0;

    for (let col = 0; col < cols; col += 1) {
      const value = values[offset + col];
      norm += value * value;
    }

    const scale = norm > 0 ? 1 / Math.sqrt(norm) : 1;

    for (let col = 0; col < cols; col += 1) {
      normalized[offset + col] = values[offset + col] * scale;
    }
  }

  return normalized;
}

function parseTopK(value: string | null): number {
  const topK = Number(value);

  if (!Number.isInteger(topK) || topK < 1) {
    return 50;
  }

  return Math.min(topK, 100);
}

function parseRelationMode(value: string | null): FaissRelationMode {
  return value === "opposite" || value === "both" ? value : "closest";
}

function recipeNameFromNeighborPath(relativePath: string): string {
  const fileName = path.basename(relativePath);
  const suffix = "_neighbors.jsonl";

  return fileName.endsWith(suffix) ? fileName.slice(0, -suffix.length) : "";
}
