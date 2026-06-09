import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LATENT_MAP_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

export async function GET(request: NextRequest) {
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");

  if (!runName || !relativePath) {
    return new Response("Missing latent-map thumbnail configuration.", {
      status: 404,
    });
  }

  const resolvedRunsRoot = path.resolve(
    LATENT_MAP_RUNS_ROOT,
  );
  const resolvedRunDir = path.resolve(resolvedRunsRoot, runName);
  const thumbnailPath = path.resolve(
    resolvedRunDir,
    relativePath,
  );
  const allowedPrefix = `${resolvedRunDir}${path.sep}`;
  const allowedRootPrefix = `${resolvedRunsRoot}${path.sep}`;

  if (
    !resolvedRunDir.startsWith(allowedRootPrefix) ||
    thumbnailPath !== resolvedRunDir &&
    !thumbnailPath.startsWith(allowedPrefix)
  ) {
    return new Response("Thumbnail path is outside the latent-map run.", {
      status: 403,
    });
  }

  try {
    const bytes = await readFile(/*turbopackIgnore: true*/ thumbnailPath);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": getContentType(thumbnailPath),
      },
    });
  } catch {
    return new Response("Thumbnail not found.", { status: 404 });
  }
}
