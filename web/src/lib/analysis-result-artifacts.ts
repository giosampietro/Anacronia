import {
  createLocalAnalysisResultStore,
  inferContentType as inferStoreContentType,
  UnsafeAnalysisResultStoreArtifactKeyError,
  type ResolvedAnalysisResultArtifact,
} from "@/lib/analysis-result-store";

export type { ResolvedAnalysisResultArtifact };

export class UnsafeArtifactKeyError extends Error {
  constructor(message = "Artifact key is outside the Analysis Result.") {
    super(message);
    this.name = "UnsafeArtifactKeyError";
  }
}

export async function resolveAnalysisResultArtifact({
  additionalRunsRoots = [],
  analysisResultId,
  artifactKey,
  runsRoot,
}: {
  additionalRunsRoots?: string[];
  analysisResultId: string;
  artifactKey: string;
  runsRoot: string;
}): Promise<ResolvedAnalysisResultArtifact | null> {
  try {
    return await createLocalAnalysisResultStore({
      additionalRunsRoots,
      runsRoot,
    }).resolveArtifact({
      analysisResultId,
      artifactKey,
    });
  } catch (error) {
    if (error instanceof UnsafeAnalysisResultStoreArtifactKeyError) {
      throw new UnsafeArtifactKeyError();
    }

    throw error;
  }
}

export async function resolveAnalysisResultRunDir({
  additionalRunsRoots = [],
  analysisResultId,
  runsRoot,
}: {
  additionalRunsRoots?: string[];
  analysisResultId: string;
  runsRoot: string;
}): Promise<string | null> {
  return createLocalAnalysisResultStore({
    additionalRunsRoots,
    runsRoot,
  }).resolveRunDir(analysisResultId);
}

export function inferContentType(filePath: string): string {
  return inferStoreContentType(filePath);
}

export function isBrowserSafeLatentMapImageArtifact({
  artifactKey,
  contentType,
}: {
  artifactKey: string;
  contentType: string;
}): boolean {
  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase();
  const normalizedArtifactKey = artifactKey.toLowerCase();

  if (!normalizedContentType) {
    return false;
  }

  if (/^viewer\/atlases\/\d+px\/page-\d+\.png$/.test(normalizedArtifactKey)) {
    return normalizedContentType === "image/png";
  }

  const rasterMatch = /^(thumbnails|previews)\/.+\.(jpe?g|png|webp)$/.exec(
    normalizedArtifactKey,
  );
  if (!rasterMatch) {
    return false;
  }

  const extension = rasterMatch[2];
  if (extension === "jpg" || extension === "jpeg") {
    return normalizedContentType === "image/jpeg";
  }
  if (extension === "png") {
    return normalizedContentType === "image/png";
  }
  return normalizedContentType === "image/webp";
}
