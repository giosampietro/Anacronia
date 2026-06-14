import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import {
  inferContentType,
  resolveAnalysisResultArtifact,
  UnsafeArtifactKeyError,
} from "@/lib/analysis-result-artifacts";
import {
  getAdditionalAnalysisResultRoots,
  getLatentMapRunsRoot,
} from "@/lib/analysis-result-roots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getContentType(filePath: string): string {
  return inferContentType(filePath);
}

export async function GET(request: NextRequest) {
  const analysisResultId = request.nextUrl.searchParams.get("analysisResultId");
  const artifactKey = request.nextUrl.searchParams.get("artifactKey");
  const runName = request.nextUrl.searchParams.get("run");
  const relativePath = request.nextUrl.searchParams.get("path");
  const runsRoot = getLatentMapRunsRoot();

  if (analysisResultId && artifactKey) {
    try {
      const artifact = await resolveAnalysisResultArtifact({
        additionalRunsRoots: getAdditionalAnalysisResultRoots(),
        analysisResultId,
        artifactKey,
        runsRoot,
      });

      if (!artifact) {
        return new Response("Analysis Result artifact not found.", { status: 404 });
      }

      const bytes = await readFile(/*turbopackIgnore: true*/ artifact.filePath);

      return new Response(new Uint8Array(bytes), {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": artifact.contentType,
        },
      });
    } catch (error) {
      if (error instanceof UnsafeArtifactKeyError) {
        return new Response("Artifact key is outside the Analysis Result.", {
          status: 403,
        });
      }

      return new Response("Analysis Result artifact not found.", { status: 404 });
    }
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
