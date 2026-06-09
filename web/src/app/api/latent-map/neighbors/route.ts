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

export async function GET(request: NextRequest) {
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");
  const imageId = request.nextUrl.searchParams.get("image_id");

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
        );

      if (rows.length === 0) {
        return new Response("FAISS neighbors not found for selected image.", {
          status: 404,
        });
      }

      return Response.json({
        schema_version: 1,
        image_id: imageId,
        neighbors: rows.map((row) => ({
          image_id: String(row.neighbor_image_id ?? ""),
          rank: Number(row.neighbor_rank ?? 0),
          score: Number(row.score ?? 0),
        })),
        recipe_name: path.basename(relativePath, "_neighbors.jsonl"),
        run_id: runName,
      });
    }

    const neighborIndex = JSON.parse(
      await readFile(/*turbopackIgnore: true*/ neighborIndexPath, "utf-8"),
    ) as NeighborIndex;
    const neighbors = neighborIndex.neighbors_by_image_id?.[imageId];

    if (!Array.isArray(neighbors)) {
      return new Response("FAISS neighbors not found for selected image.", {
        status: 404,
      });
    }

    return Response.json({
      schema_version: 1,
      image_id: imageId,
      neighbors: neighbors.map((neighbor) => ({
        image_id: String(neighbor.image_id ?? ""),
        rank: Number(neighbor.rank ?? 0),
        score: Number(neighbor.score ?? 0),
      })),
      recipe_name: String(neighborIndex.recipe_name ?? ""),
      run_id: String(neighborIndex.run_id ?? ""),
    });
  } catch {
    return new Response("FAISS neighbor index not found.", { status: 404 });
  }
}
