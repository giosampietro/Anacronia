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
