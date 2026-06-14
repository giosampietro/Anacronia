import { execFile, type ExecFileOptions } from "node:child_process";
import path from "node:path";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LATENT_MAP_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";
const FAISS_QUERY_TIMEOUT_MS = 10_000;

export type NeighborRow = {
  image_id: string;
  rank: number;
  score: number;
};

type FaissRelationMode = "closest" | "opposite" | "both";

type LiveFaissNeighbor = {
  image_id?: unknown;
  score?: unknown;
};

type LiveFaissPayload = {
  neighbors?: LiveFaissNeighbor[];
  opposites?: LiveFaissNeighbor[];
};

export async function GET(request: NextRequest) {
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");
  const imageId = request.nextUrl.searchParams.get("image_id");
  const requestedRecipeName = request.nextUrl.searchParams.get("recipe");
  const topK = parseTopK(request.nextUrl.searchParams.get("top_k"));
  const relationMode = parseRelationMode(
    request.nextUrl.searchParams.get("relation"),
  );

  if (!runName || !imageId) {
    return new Response("Missing latent-map neighbor configuration.", {
      status: 404,
    });
  }

  const resolvedRunsRoot = path.resolve(LATENT_MAP_RUNS_ROOT);
  const resolvedRunDir = path.resolve(resolvedRunsRoot, runName);
  const allowedRootPrefix = `${resolvedRunsRoot}${path.sep}`;

  if (!resolvedRunDir.startsWith(allowedRootPrefix)) {
    return new Response("Neighbor path is outside the latent-map run.", {
      status: 403,
    });
  }

  try {
    const recipeName = await resolveRecipeName({
      relativePath,
      requestedRecipeName,
    });

    if (!recipeName) {
      throw new Error("FAISS recipe is unavailable.");
    }

    const relationRows = await queryLiveFaissRelations({
      imageId,
      recipeName,
      relationMode,
      runDir: resolvedRunDir,
      topK,
    });

    if (relationMode !== "opposite" && relationRows.neighbors.length === 0) {
      return new Response("FAISS neighbors not found for selected image.", {
        status: 404,
      });
    }

    return Response.json({
      schema_version: 1,
      image_id: imageId,
      neighbors: relationRows.neighbors,
      opposites: relationRows.opposites,
      recipe_name: recipeName,
      relation: relationMode,
      run_id: runName,
      top_k: topK,
    });
  } catch {
    return new Response("FAISS neighbor index not found.", { status: 404 });
  }
}

async function resolveRecipeName({
  relativePath,
  requestedRecipeName,
}: {
  relativePath: string | null;
  requestedRecipeName: string | null;
}): Promise<string> {
  const parsedRecipeName = parseRecipeName(requestedRecipeName);

  if (parsedRecipeName) {
    return parsedRecipeName;
  }

  if (!relativePath) {
    return "";
  }

  const recipeNameFromPath = parseRecipeName(recipeNameFromNeighborPath(relativePath));

  if (recipeNameFromPath) {
    return recipeNameFromPath;
  }

  return "";
}

async function queryLiveFaissRelations({
  imageId,
  recipeName,
  relationMode,
  runDir,
  topK,
}: {
  imageId: string;
  recipeName: string;
  relationMode: FaissRelationMode;
  runDir: string;
  topK: number;
}): Promise<{ neighbors: NeighborRow[]; opposites: NeighborRow[] }> {
  if (!recipeName) {
    throw new Error("FAISS recipe is unavailable.");
  }

  const projectRoot = resolveProjectRoot();
  const pythonPath =
    process.env.ANACRONIA_PYTHON ??
    path.join(projectRoot, ".venv", "bin", "python");
  const pythonPathEntries = [
    path.join(projectRoot, "src"),
    process.env.PYTHONPATH,
  ].filter(Boolean);
  const stdout = await execFileText(
    pythonPath,
    [
      "-m",
      "anacronia.cli",
      "latent-map",
      "faiss-query",
      "--run-dir",
      runDir,
      "--recipe",
      recipeName,
      "--image-id",
      imageId,
      "--top-k",
      String(topK),
      "--relation",
      relationMode,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: pythonPathEntries.join(path.delimiter),
      },
      maxBuffer: 1024 * 1024,
      timeout: FAISS_QUERY_TIMEOUT_MS,
    },
  );
  const payload = JSON.parse(stdout) as LiveFaissPayload;

  return {
    neighbors: toNeighborRows(payload.neighbors ?? []),
    opposites: toNeighborRows(payload.opposites ?? []),
  };
}

function execFileText(
  file: string,
  args: string[],
  options: ExecFileOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(String(stdout));
    });
  });
}

function toNeighborRows(rows: LiveFaissNeighbor[]): NeighborRow[] {
  return rows
    .map((row, index) => ({
      image_id: String(row.image_id ?? ""),
      rank: index + 1,
      score: Number(row.score ?? 0),
    }))
    .filter((row) => row.image_id);
}

function resolveProjectRoot(): string {
  const cwd = process.cwd();

  return path.basename(cwd) === "web" ? path.dirname(cwd) : cwd;
}

function parseTopK(value: string | null): number {
  const topK = Number(value);

  if (!Number.isInteger(topK) || topK < 1) {
    return 50;
  }

  return Math.min(topK, 100);
}

function parseRecipeName(value: string | null): string {
  const recipeName = String(value ?? "").trim();

  return /^[A-Za-z0-9_.-]+$/.test(recipeName) ? recipeName : "";
}

function parseRelationMode(value: string | null): FaissRelationMode {
  return value === "opposite" || value === "both" ? value : "closest";
}

function recipeNameFromNeighborPath(relativePath: string): string {
  const fileName = path.basename(relativePath);
  const suffix = "_neighbors.jsonl";

  return fileName.endsWith(suffix) ? fileName.slice(0, -suffix.length) : "";
}
