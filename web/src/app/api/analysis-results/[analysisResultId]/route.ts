import {
  AnalysisResultNotFoundError,
  UnsafeAnalysisResultDeletionError,
  deleteAnalysisResult,
} from "@/lib/analysis-result-deletion";
import { LATENT_MAP_RUNS_ROOT } from "@/lib/latent-map-run-data";

type RouteContext = {
  params: Promise<{ analysisResultId: string }>;
};

function getRunsRoot(): string {
  return process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT ?? LATENT_MAP_RUNS_ROOT;
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { analysisResultId } = await context.params;

  try {
    const summary = await deleteAnalysisResult({
      analysisResultId,
      runsRoot: getRunsRoot(),
    });

    return Response.json(toApiSummary(summary));
  } catch (error) {
    return deletionErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { analysisResultId } = await context.params;

  try {
    await deleteAnalysisResult({
      analysisResultId,
      runsRoot: getRunsRoot(),
    });
  } catch (error) {
    return deletionErrorResponse(error);
  }

  return new Response(null, {
    headers: { location: "/analysis-results" },
    status: 303,
  });
}

function toApiSummary(summary: Awaited<ReturnType<typeof deleteAnalysisResult>>) {
  return {
    analysis_result_id: summary.analysisResultId,
    deleted: summary.deleted,
    deleted_at: summary.deletedAt,
    deleted_durable_artifact_keys: summary.deletedDurableArtifactKeys,
    deleted_render_cache_keys: summary.deletedRenderCacheKeys,
    missing_artifact_keys: summary.missingArtifactKeys,
    preserved_artifact_keys: summary.preserveArtifactKeys,
  };
}

function deletionErrorResponse(error: unknown): Response {
  if (error instanceof AnalysisResultNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof UnsafeAnalysisResultDeletionError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  throw error;
}
