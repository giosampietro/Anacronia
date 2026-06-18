import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import { getLatentMapRunsRoot } from "@/lib/analysis-result-roots";
import { normalizeExportedLatentMapThumbnailAtlas } from "@/lib/latent-map-viewer-data";
import type { LatentMapGeneratedThumbnailAtlas } from "@/lib/latent-map-viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = 18670;

export async function GET(request: NextRequest) {
  const analysisResultId = request.nextUrl.searchParams.get("analysisResultId");
  const artifactKey = request.nextUrl.searchParams.get("artifactKey");
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");

  if (analysisResultId) {
    if (!artifactKey || !isLatentMapAtlasManifestKey(artifactKey)) {
      return new Response("Latent map atlas manifest not found.", {
        status: 404,
      });
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
      return new Response("Latent map atlas manifest not found.", {
        status: 404,
      });
    }

    return atlasManifestResponse({
      rawText: await artifactResponse.text(),
      thumbnailApiPath: `/api/latent-map/thumbnails?analysisResultId=${encodeURIComponent(
        analysisResultId,
      )}`,
      thumbnailResourceParamName: "artifactKey",
    });
  }

  if (!runName || !relativePath || !isLatentMapAtlasManifestKey(relativePath)) {
    return new Response("Missing latent-map atlas manifest configuration.", {
      status: 404,
    });
  }

  const resolvedRunsRoot = path.resolve(getLatentMapRunsRoot());
  const resolvedRunDir = path.resolve(resolvedRunsRoot, runName);
  const manifestPath = path.resolve(resolvedRunDir, relativePath);
  const allowedRootPrefix = `${resolvedRunsRoot}${path.sep}`;
  const allowedRunPrefix = `${resolvedRunDir}${path.sep}`;

  if (
    !resolvedRunDir.startsWith(allowedRootPrefix) ||
    (manifestPath !== resolvedRunDir && !manifestPath.startsWith(allowedRunPrefix))
  ) {
    return new Response("Atlas manifest path is outside the latent-map run.", {
      status: 403,
    });
  }

  try {
    return atlasManifestResponse({
      rawText: await readFile(/*turbopackIgnore: true*/ manifestPath, "utf-8"),
      thumbnailApiPath: `/api/latent-map/thumbnails?run=${encodeURIComponent(
        runName,
      )}`,
      thumbnailResourceParamName: "path",
    });
  } catch {
    return new Response("Latent map atlas manifest not found.", {
      status: 404,
    });
  }
}

function atlasManifestResponse({
  rawText,
  thumbnailApiPath,
  thumbnailResourceParamName,
}: {
  rawText: string;
  thumbnailApiPath: string;
  thumbnailResourceParamName: string;
}) {
  let rawAtlas: Partial<LatentMapGeneratedThumbnailAtlas>;

  try {
    rawAtlas = JSON.parse(rawText) as Partial<LatentMapGeneratedThumbnailAtlas>;
  } catch {
    return new Response("Latent map atlas manifest is invalid.", {
      status: 502,
    });
  }

  const atlas = normalizeExportedLatentMapThumbnailAtlas({
    rawAtlas,
    thumbnailApiPath,
    thumbnailResourceParamName,
  });

  if (!atlas) {
    return new Response("Latent map atlas manifest is invalid.", {
      status: 502,
    });
  }

  return Response.json(atlas, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isLatentMapAtlasManifestKey(artifactKey: string): boolean {
  return /^viewer\/atlases\/\d+px\/atlas-manifest\.json$/.test(artifactKey);
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
