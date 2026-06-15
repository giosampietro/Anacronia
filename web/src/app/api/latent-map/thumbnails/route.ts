import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import {
  inferContentType,
  isBrowserSafeLatentMapImageArtifact,
} from "@/lib/analysis-result-artifacts";
import { getLatentMapRunsRoot } from "@/lib/analysis-result-roots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const DEFAULT_API_PORT = 18670;

function getContentType(filePath: string): string {
  return inferContentType(filePath);
}

export async function GET(request: NextRequest) {
  const analysisResultId = request.nextUrl.searchParams.get("analysisResultId");
  const artifactKey = request.nextUrl.searchParams.get("artifactKey");
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");
  const runsRoot = getLatentMapRunsRoot();

  if (analysisResultId) {
    if (!artifactKey) {
      return new Response("Analysis Result artifact not found.", { status: 404 });
    }

    const artifactResponse = await fetch(
      `${apiBaseUrl()}/analysis-results/${encodeURIComponent(
        analysisResultId,
      )}/artifacts/${encodeArtifactKeyPath(artifactKey)}`,
      {
        cache: "no-store",
        method: "GET",
      },
    );
    if (!artifactResponse.ok) {
      return new Response("Analysis Result artifact not found.", { status: 404 });
    }
    const contentType =
      artifactResponse.headers.get("content-type") ?? "application/octet-stream";
    if (
      !isBrowserSafeLatentMapImageArtifact({
        artifactKey,
        contentType,
      })
    ) {
      return new Response("Thumbnail not found.", { status: 404 });
    }

    return new Response(artifactResponse.body, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
      status: 200,
    });
  }

  if (!runName || !relativePath) {
    return new Response("Missing latent-map thumbnail configuration.", {
      status: 404,
    });
  }

  const resolvedRunsRoot = path.resolve(
    runsRoot,
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

  const contentType = getContentType(thumbnailPath);
  if (
    !isBrowserSafeLatentMapImageArtifact({
      artifactKey: relativePath,
      contentType,
    })
  ) {
    return new Response("Thumbnail not found.", { status: 404 });
  }

  try {
    const bytes = await readFile(/*turbopackIgnore: true*/ thumbnailPath);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Thumbnail not found.", { status: 404 });
  }
}

function apiBaseUrl(): string {
  return `http://127.0.0.1:${getApiPort()}`;
}

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : DEFAULT_API_PORT;
}

function encodeArtifactKeyPath(artifactKey: string): string {
  return artifactKey.split("/").map(encodeURIComponent).join("/");
}
