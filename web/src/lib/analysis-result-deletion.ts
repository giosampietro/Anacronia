import {
  AnalysisResultStoreNotFoundError,
  createLocalAnalysisResultStore,
  UnsafeAnalysisResultStoreArtifactKeyError,
  type AnalysisResultDeletionPlan,
  type AnalysisResultDeletionSummary,
} from "@/lib/analysis-result-store";

export type { AnalysisResultDeletionPlan, AnalysisResultDeletionSummary };

export class AnalysisResultNotFoundError extends Error {
  constructor(analysisResultId: string) {
    super(`Analysis Result not found: ${analysisResultId}`);
    this.name = "AnalysisResultNotFoundError";
  }
}

export class UnsafeAnalysisResultDeletionError extends Error {
  constructor(message = "Analysis Result artifact key is unsafe.") {
    super(message);
    this.name = "UnsafeAnalysisResultDeletionError";
  }
}

export async function planAnalysisResultDeletion({
  analysisResultId,
  runsRoot,
}: {
  analysisResultId: string;
  runsRoot: string;
}): Promise<AnalysisResultDeletionPlan> {
  try {
    return await createLocalAnalysisResultStore({ runsRoot }).planDeletion(
      analysisResultId,
    );
  } catch (error) {
    throw translateStoreError(error, analysisResultId);
  }
}

export async function deleteAnalysisResult({
  analysisResultId,
  deletedAt = new Date(),
  runsRoot,
}: {
  analysisResultId: string;
  deletedAt?: Date;
  runsRoot: string;
}): Promise<AnalysisResultDeletionSummary> {
  try {
    return await createLocalAnalysisResultStore({ runsRoot }).deleteResult({
      analysisResultId,
      deletedAt,
    });
  } catch (error) {
    throw translateStoreError(error, analysisResultId);
  }
}

function translateStoreError(error: unknown, analysisResultId: string): Error {
  if (error instanceof AnalysisResultStoreNotFoundError) {
    return new AnalysisResultNotFoundError(analysisResultId);
  }
  if (error instanceof UnsafeAnalysisResultStoreArtifactKeyError) {
    return new UnsafeAnalysisResultDeletionError();
  }
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
