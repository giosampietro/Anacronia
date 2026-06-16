import { shouldAutoRefreshAnalysisJobs } from "@/lib/analysis-job-refresh";
import type { AnalysisResultStatusState } from "@/lib/analysis-result-status";
import {
  type AnalysisStudioUrlState,
  createAnalysisStudioHref,
  parseAnalysisStudioUrlState,
  resolveAnalysisStudioUrlState,
  type AnalysisStudioSearchParams,
  type ResolvedAnalysisStudioUrlState,
} from "@/lib/analysis-studio-url";

const DEFAULT_API_PORT = 18670;

export type AnalysisStudioCollectionChoice = {
  label: string;
  slug: string;
};

export type AnalysisStudioRecipeChoice = {
  inputSize: number | null;
  isDefault: boolean;
  label: string;
  recipeId: string;
};

export type AnalysisStudioAnalysisSummary = {
  analysisId: string;
  analysisJobIds: string[];
  sourceCollections: AnalysisStudioCollectionChoice[];
  status: string;
  title: string;
  variants: AnalysisStudioAnalysisVariantSummary[];
};

export type AnalysisStudioAnalysisVariantSummary = {
  analysisResultId: string;
  explorerHref: string;
  itemCount: number | null;
  recipeLabels: string[];
  sharedEmbeddings: {
    missingCount: number | null;
    reusableCount: number | null;
  };
  status: string;
  storage: {
    embeddingBytes: number | null;
    totalBytes: number | null;
    variantBytes: number | null;
  };
};

export type AnalysisStudioJobSummary = {
  analysisJobId: string;
  analysisResultIds: string[];
  createdAt: string | null;
  producedResults: AnalysisStudioJobProducedResultSummary[];
  recipeIds: string[];
  recipeLabels: string[];
  scopeSnapshot: AnalysisStudioJobScopeSnapshotSummary | null;
  stages: AnalysisStudioJobStageSummary[];
  status: string;
  viewerHrefs: string[];
};

export type AnalysisStudioJobProducedResultSummary = {
  analysisResultId: string;
  href: string;
  itemCount: number;
  recipeId: string;
  recipeLabel: string;
  scopeLabel: string;
  state: AnalysisResultStatusState;
};

export type AnalysisStudioJobScopeSnapshotSummary = {
  counts: Record<string, number>;
  itemCount: number | null;
  snapshotId: string | null;
};

export type AnalysisStudioJobStageSummary = {
  completedAt?: string;
  elapsedMs?: number;
  error?: string;
  outputArtifactCount?: number;
  outputCounts?: Record<string, number>;
  recipeId?: string;
  stageName?: string;
  startedAt?: string;
  status?: string;
};

export type AnalysisStudioResultSummary = {
  analysisJobId: string;
  analysisResultId: string;
  artifactHealth: {
    missingOptionalArtifactKeys: string[];
    missingOptionalRenderCacheKeys: string[];
    missingRequiredArtifactKeys: string[];
  };
  canOpenExplorer: boolean;
  explorerHref: string;
  itemCount: number;
  recipeIds: string[];
  recipeLabels: string[];
  runId: string;
  scopeLabel: string;
  state: AnalysisResultStatusState;
  staleness: {
    addedImageCount: number;
    removedImageCount: number;
    state: string;
  };
  storageTotals: {
    durableBytes: number;
    renderCacheBytes: number;
    totalBytes: number;
    viewerCacheBytes: number;
  };
  storageByRole: Record<string, number>;
};

export type AnalysisStudioReadModel = {
  activeJob: AnalysisStudioJobSummary | null;
  analysisError: string | null;
  analyses: AnalysisStudioAnalysisSummary[];
  analysesUnavailable: boolean;
  collections: AnalysisStudioCollectionChoice[];
  collectionsUnavailable: boolean;
  jobs: AnalysisStudioJobSummary[];
  jobsUnavailable: boolean;
  recipes: AnalysisStudioRecipeChoice[];
  recipesUnavailable: boolean;
  results: AnalysisStudioResultSummary[];
  resultsUnavailable: boolean;
  selectedAnalysis: AnalysisStudioAnalysisSummary | null;
  selectedJob: AnalysisStudioJobSummary | null;
  selectedResult: AnalysisStudioResultSummary | null;
  selectedState: ResolvedAnalysisStudioUrlState;
  summary: {
    analysisCount: number;
    sourceImageCount: number;
  };
};

type AnalysisResultApiPayload = {
  results?: unknown;
};

type AnalysisApiPayload = {
  analyses?: unknown;
};

type AnalysisApiItem = {
  analysis_id?: unknown;
  analysis_job_ids?: unknown;
  source_collections?: unknown;
  status?: unknown;
  title?: unknown;
  variants?: unknown;
};

type AnalysisApiSourceCollection = {
  label?: unknown;
  slug?: unknown;
};

type AnalysisApiVariant = {
  analysis_result_id?: unknown;
  explorer_href?: unknown;
  status?: unknown;
};

type AnalysisResultApiItem = {
  analysis_job_id?: unknown;
  analysis_result_id?: unknown;
  artifact_health?: {
    missing_optional_artifact_keys?: unknown;
    missing_optional_render_cache_artifact_keys?: unknown;
    missing_required_artifact_keys?: unknown;
  };
  explorer_href?: unknown;
  explorer_readiness?: {
    ready?: unknown;
  };
  item_count?: unknown;
  recipe_ids?: unknown;
  recipe_names?: unknown;
  result_state?: {
    state?: unknown;
  };
  scope_label?: unknown;
  status?: unknown;
  staleness?: {
    added_image_count?: unknown;
    removed_image_count?: unknown;
    state?: unknown;
  };
  storage_totals?: {
    durable?: unknown;
    "render-cache"?: unknown;
    total?: unknown;
    "viewer-cache"?: unknown;
  };
  storage_by_role?: unknown;
};

type AnalysisJobApiItem = {
  analysis_job_id?: unknown;
  analysis_result_ids?: unknown;
  created_at?: unknown;
  recipe_ids?: unknown;
  scope_snapshot?: {
    counts?: unknown;
    item_count?: unknown;
    snapshot_id?: unknown;
  };
  stages?: unknown;
  status?: unknown;
  viewer_hrefs?: unknown;
};

type CollectionApiItem = {
  display_name?: unknown;
  slug?: unknown;
};

type RecipeApiItem = {
  input_size?: unknown;
  is_default?: unknown;
  label?: unknown;
  recipe_id?: unknown;
};

export async function loadAnalysisStudioReadModel({
  apiPort = getApiPort(),
  searchParams = {},
}: {
  apiPort?: number;
  searchParams?: AnalysisStudioSearchParams;
} = {}): Promise<AnalysisStudioReadModel> {
  const [collectionsResult, recipesResult, analysesResult, jobsResult, resultsResult] =
    await Promise.all([
      listCollections({ apiPort }),
      listRecipes({ apiPort }),
      listAnalyses({ apiPort }),
      listJobs({ apiPort }),
      listResults({ apiPort }),
    ]);
  const recipeLabelById = new Map(
    recipesResult.recipes.map((recipe) => [recipe.recipeId, recipe.label]),
  );
  const results = resultsResult.results.map((result) => ({
    ...result,
    recipeLabels: result.recipeIds.map(
      (recipeId) => recipeLabelById.get(recipeId) ?? recipeId,
    ),
  }));
  const resultById = new Map(
    results.map((result) => [result.analysisResultId, result]),
  );
  const jobs = jobsResult.jobs.map((job) => {
    const recipeLabels = job.recipeIds.map(
      (recipeId) => recipeLabelById.get(recipeId) ?? recipeId,
    );
    return {
      ...job,
      producedResults: job.analysisResultIds
        .map((analysisResultId) => resultById.get(analysisResultId) ?? null)
        .filter((result): result is (typeof results)[number] => result !== null)
        .map((result) => ({
          analysisResultId: result.analysisResultId,
          href: createAnalysisStudioHref({
            analysisResultId: result.analysisResultId,
            state: "selected-result",
          }),
          itemCount: result.itemCount,
          recipeId: result.recipeIds[0] ?? "",
          recipeLabel: result.recipeLabels[0] ?? "No recipes",
          scopeLabel: result.scopeLabel,
          state: result.state,
        })),
      recipeLabels,
    };
  });
  const analyses = enrichAnalysisVariants({
    analyses: analysesResult.analyses,
    jobs,
    results,
  });
  const attachedAnalysisJobIds = new Set(
    analyses.flatMap((analysis) => analysis.analysisJobIds),
  );
  const analysisJobs = jobs.filter((job) =>
    attachedAnalysisJobIds.has(job.analysisJobId),
  );
  const requestedState = parseAnalysisStudioUrlState(searchParams);
  const resolvedState = resolveAnalysisStudioUrlState(requestedState, {
    analysisIds: analyses.map((analysis) => analysis.analysisId),
    analysisJobIds: jobs.map((job) => job.analysisJobId),
    analysisResultIds: results.map((result) => result.analysisResultId),
  });
  const selectedState = preserveRequestedSelectionWhenUnavailable(
    requestedState,
    resolvedState,
    {
      analysesUnavailable: analysesResult.unavailable,
      jobsUnavailable: jobsResult.unavailable,
      resultsUnavailable: resultsResult.unavailable,
    },
  );

  return {
    activeJob: jobs.find((job) => shouldAutoRefreshAnalysisJobs([job.status])) ?? null,
    analysisError: normalizeSearchParam(searchParams, "analysisError") ?? null,
    analyses,
    analysesUnavailable: analysesResult.unavailable,
    collections: collectionsResult.collections,
    collectionsUnavailable: collectionsResult.unavailable,
    jobs,
    jobsUnavailable: jobsResult.unavailable,
    recipes: recipesResult.recipes,
    recipesUnavailable: recipesResult.unavailable,
    results,
    resultsUnavailable: resultsResult.unavailable,
    selectedAnalysis:
      selectedState.state === "selected-analysis"
        ? analyses.find(
            (analysis) => analysis.analysisId === selectedState.analysisId,
          ) ?? null
        : null,
    selectedJob:
      selectedState.state === "selected-job"
        ? jobs.find((job) => job.analysisJobId === selectedState.analysisJobId) ??
          null
        : null,
    selectedResult:
      selectedState.state === "selected-result"
        ? results.find(
            (result) => result.analysisResultId === selectedState.analysisResultId,
          ) ?? null
        : null,
    selectedState,
    summary: summarizePersistentAnalyses({
      analyses,
      jobs: analysisJobs,
    }),
  };
}

function enrichAnalysisVariants({
  analyses,
  jobs,
  results,
}: {
  analyses: AnalysisStudioAnalysisSummary[];
  jobs: AnalysisStudioJobSummary[];
  results: AnalysisStudioResultSummary[];
}): AnalysisStudioAnalysisSummary[] {
  const resultById = new Map(
    results.map((result) => [result.analysisResultId, result]),
  );
  return analyses.map((analysis) => {
    const analysisJobs = jobs.filter((job) =>
      analysis.analysisJobIds.includes(job.analysisJobId),
    );
    return {
      ...analysis,
      variants: analysis.variants.map((variant) => {
        const result = resultById.get(variant.analysisResultId) ?? null;
        const job =
          analysisJobs.find((candidate) =>
            candidate.analysisResultIds.includes(variant.analysisResultId),
          ) ??
          (result
            ? analysisJobs.find(
                (candidate) => candidate.analysisJobId === result.analysisJobId,
              ) ?? null
            : null);
        const embeddingBytes = result?.storageByRole.embedding ?? 0;
        return {
          ...variant,
          explorerHref: result?.explorerHref ?? variant.explorerHref,
          itemCount: result?.itemCount ?? null,
          recipeLabels: result?.recipeLabels ?? [],
          sharedEmbeddings: embeddingReuseFromJob(job),
          status: result?.state ?? variant.status,
          storage: {
            embeddingBytes: result ? embeddingBytes : null,
            totalBytes: result?.storageTotals.totalBytes ?? null,
            variantBytes: result
              ? Math.max(result.storageTotals.totalBytes - embeddingBytes, 0)
              : null,
          },
        };
      }),
    };
  });
}

function embeddingReuseFromJob(job: AnalysisStudioJobSummary | null) {
  const planningStage = job?.stages.find(
    (stage) => stage.stageName === "embedding_planning",
  );
  const outputCounts = planningStage?.outputCounts;
  return {
    missingCount: normalizeFiniteNumber(outputCounts?.missing_embeddings),
    reusableCount: normalizeFiniteNumber(outputCounts?.reusable_embeddings),
  };
}

function summarizePersistentAnalyses({
  analyses,
  jobs,
}: {
  analyses: AnalysisStudioAnalysisSummary[];
  jobs: AnalysisStudioJobSummary[];
}) {
  return {
    analysisCount: analyses.length,
    sourceImageCount: analyses.reduce(
      (total, analysis) => total + sourceImageCountForAnalysis(analysis, jobs),
      0,
    ),
  };
}

function sourceImageCountForAnalysis(
  analysis: AnalysisStudioAnalysisSummary,
  jobs: AnalysisStudioJobSummary[],
) {
  const jobCounts = jobs
    .filter((job) => analysis.analysisJobIds.includes(job.analysisJobId))
    .map((job) => job.scopeSnapshot?.itemCount ?? null)
    .filter((count): count is number => count !== null);
  if (jobCounts.length > 0) {
    return Math.max(...jobCounts);
  }

  const variantCounts = analysis.variants
    .map((variant) => variant.itemCount)
    .filter((count): count is number => count !== null);
  return variantCounts.length > 0 ? Math.max(...variantCounts) : 0;
}

function preserveRequestedSelectionWhenUnavailable(
  requestedState: AnalysisStudioUrlState,
  resolvedState: ResolvedAnalysisStudioUrlState,
  {
    analysesUnavailable,
    jobsUnavailable,
    resultsUnavailable,
  }: {
    analysesUnavailable: boolean;
    jobsUnavailable: boolean;
    resultsUnavailable: boolean;
  },
) {
  if (resolvedState.state === "missing-analysis" && analysesUnavailable) {
    return requestedState;
  }

  if (resolvedState.state === "missing-result" && resultsUnavailable) {
    return requestedState;
  }

  if (resolvedState.state === "missing-job" && jobsUnavailable) {
    return requestedState;
  }

  return resolvedState;
}

export { createAnalysisStudioHref };

async function listAnalyses({ apiPort }: { apiPort: number }): Promise<{
  analyses: AnalysisStudioAnalysisSummary[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/analyses`, {
      cache: "no-store",
      method: "GET",
    });
    if (!response.ok) {
      return { analyses: [], unavailable: true };
    }
    const payload = (await response.json()) as AnalysisApiPayload;
    return {
      analyses: normalizeAnalyses(payload.analyses),
      unavailable: false,
    };
  } catch {
    return { analyses: [], unavailable: true };
  }
}

async function listCollections({ apiPort }: { apiPort: number }): Promise<{
  collections: AnalysisStudioCollectionChoice[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets`, {
      cache: "no-store",
      method: "GET",
    });
    if (!response.ok) {
      return { collections: [], unavailable: true };
    }
    const payload = (await response.json()) as unknown;
    return {
      collections: normalizeCollections(payload),
      unavailable: false,
    };
  } catch {
    return { collections: [], unavailable: true };
  }
}

async function listRecipes({ apiPort }: { apiPort: number }): Promise<{
  recipes: AnalysisStudioRecipeChoice[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/analysis-recipes`, {
      cache: "no-store",
      method: "GET",
    });
    if (!response.ok) {
      return {
        recipes: fallbackRecipeChoices(),
        unavailable: true,
      };
    }
    const payload = (await response.json()) as { recipes?: unknown };
    return {
      recipes: normalizeRecipes(payload.recipes),
      unavailable: false,
    };
  } catch {
    return {
      recipes: fallbackRecipeChoices(),
      unavailable: true,
    };
  }
}

async function listJobs({ apiPort }: { apiPort: number }): Promise<{
  jobs: Omit<AnalysisStudioJobSummary, "producedResults" | "recipeLabels">[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/analysis-jobs`, {
      cache: "no-store",
      method: "GET",
    });
    if (!response.ok) {
      return { jobs: [], unavailable: true };
    }
    const payload = (await response.json()) as { jobs?: unknown };
    return {
      jobs: normalizeJobs(payload.jobs),
      unavailable: false,
    };
  } catch {
    return { jobs: [], unavailable: true };
  }
}

async function listResults({ apiPort }: { apiPort: number }): Promise<{
  results: Omit<AnalysisStudioResultSummary, "recipeLabels">[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/analysis-results`, {
      cache: "no-store",
      method: "GET",
    });
    if (!response.ok) {
      return { results: [], unavailable: true };
    }
    const payload = (await response.json()) as AnalysisResultApiPayload;
    return {
      results: normalizeResults(payload.results),
      unavailable: false,
    };
  } catch {
    return { results: [], unavailable: true };
  }
}

function normalizeCollections(payload: unknown): AnalysisStudioCollectionChoice[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): AnalysisStudioCollectionChoice | null => {
      const collection = item as CollectionApiItem;
      const slug = normalizeString(collection?.slug);
      if (!slug) {
        return null;
      }
      return {
        label: normalizeString(collection.display_name) ?? slug,
        slug,
      };
    })
    .filter((item): item is AnalysisStudioCollectionChoice => item !== null)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeAnalyses(payload: unknown): AnalysisStudioAnalysisSummary[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): AnalysisStudioAnalysisSummary | null => {
      const analysis = item as AnalysisApiItem;
      const analysisId = normalizeString(analysis?.analysis_id);
      if (!analysisId) {
        return null;
      }

      return {
        analysisId,
        analysisJobIds: normalizeStringList(analysis.analysis_job_ids),
        sourceCollections: normalizeAnalysisSourceCollections(
          analysis.source_collections,
        ),
        status: normalizeString(analysis.status) ?? "unknown",
        title: normalizeString(analysis.title) ?? "Untitled analysis",
        variants: normalizeAnalysisVariants(analysis.variants),
      };
    })
    .filter((item): item is AnalysisStudioAnalysisSummary => item !== null);
}

function normalizeAnalysisSourceCollections(
  payload: unknown,
): AnalysisStudioCollectionChoice[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): AnalysisStudioCollectionChoice | null => {
      const source = item as AnalysisApiSourceCollection;
      const slug = normalizeString(source?.slug);
      if (!slug) {
        return null;
      }
      return {
        label: normalizeString(source.label) ?? slug,
        slug,
      };
    })
    .filter((item): item is AnalysisStudioCollectionChoice => item !== null);
}

function normalizeAnalysisVariants(
  payload: unknown,
): AnalysisStudioAnalysisVariantSummary[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): AnalysisStudioAnalysisVariantSummary | null => {
      const variant = item as AnalysisApiVariant;
      const analysisResultId = normalizeString(variant?.analysis_result_id);
      if (!analysisResultId) {
        return null;
      }
      return {
        analysisResultId,
        explorerHref:
          normalizeString(variant.explorer_href) ??
          `/latent-map?analysisResultId=${encodeURIComponent(analysisResultId)}`,
        itemCount: null,
        recipeLabels: [],
        sharedEmbeddings: {
          missingCount: null,
          reusableCount: null,
        },
        status: normalizeString(variant.status) ?? "unknown",
        storage: {
          embeddingBytes: null,
          totalBytes: null,
          variantBytes: null,
        },
      };
    })
    .filter(
      (item): item is AnalysisStudioAnalysisVariantSummary => item !== null,
    );
}

function normalizeRecipes(payload: unknown): AnalysisStudioRecipeChoice[] {
  if (!Array.isArray(payload)) {
    return fallbackRecipeChoices();
  }

  const recipes = payload
    .map((item): AnalysisStudioRecipeChoice | null => {
      const recipe = item as RecipeApiItem;
      const recipeId = normalizeString(recipe?.recipe_id);
      if (!recipeId) {
        return null;
      }
      const inputSize =
        typeof recipe.input_size === "number" ? recipe.input_size : null;
      return {
        inputSize,
        isDefault: recipe.is_default === true,
        label: normalizeString(recipe.label) ?? recipeId,
        recipeId,
      };
    })
    .filter((item): item is AnalysisStudioRecipeChoice => item !== null);

  return recipes.length > 0 ? recipes : fallbackRecipeChoices();
}

function normalizeJobs(
  payload: unknown,
): Omit<AnalysisStudioJobSummary, "producedResults" | "recipeLabels">[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map(
      (
        item,
      ):
        | Omit<AnalysisStudioJobSummary, "producedResults" | "recipeLabels">
        | null => {
      const job = item as AnalysisJobApiItem;
      const analysisJobId = normalizeString(job?.analysis_job_id);
      if (!analysisJobId) {
        return null;
      }
      return {
        analysisJobId,
        analysisResultIds: normalizeStringList(job.analysis_result_ids),
        createdAt: normalizeString(job.created_at) ?? null,
        recipeIds: normalizeStringList(job.recipe_ids),
        scopeSnapshot: normalizeJobScopeSnapshot(job.scope_snapshot),
        stages: normalizeJobStages(job.stages),
        status: normalizeString(job.status) ?? "unknown",
        viewerHrefs: normalizeStringList(job.viewer_hrefs),
      };
      },
    )
    .filter(
      (
        item,
      ): item is Omit<AnalysisStudioJobSummary, "producedResults" | "recipeLabels"> =>
        item !== null,
    );
}

function normalizeJobScopeSnapshot(
  payload: AnalysisJobApiItem["scope_snapshot"],
): AnalysisStudioJobScopeSnapshotSummary | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const counts = normalizeNumberRecord(payload.counts);
  const itemCount = normalizeFiniteNumber(payload.item_count);
  const snapshotId = normalizeString(payload.snapshot_id) ?? null;
  if (itemCount === null && snapshotId === null && Object.keys(counts).length === 0) {
    return null;
  }
  return {
    counts,
    itemCount,
    snapshotId,
  };
}

function normalizeJobStages(payload: unknown): AnalysisStudioJobStageSummary[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((item): AnalysisStudioJobStageSummary | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const stage = item as Record<string, unknown>;
      return {
        ...(typeof stage.completed_at === "string"
          ? { completedAt: stage.completed_at }
          : {}),
        ...(typeof stage.elapsed_ms === "number" && Number.isFinite(stage.elapsed_ms)
          ? { elapsedMs: stage.elapsed_ms }
          : {}),
        ...(typeof stage.error === "string" ? { error: stage.error } : {}),
        ...(typeof stage.output_artifact_count === "number" &&
        Number.isFinite(stage.output_artifact_count)
          ? { outputArtifactCount: stage.output_artifact_count }
          : {}),
        ...(Object.keys(normalizeNumberRecord(stage.output_counts)).length > 0
          ? { outputCounts: normalizeNumberRecord(stage.output_counts) }
          : {}),
        ...(typeof stage.recipe_id === "string"
          ? { recipeId: stage.recipe_id }
          : {}),
        ...(typeof stage.stage_name === "string"
          ? { stageName: stage.stage_name }
          : {}),
        ...(typeof stage.started_at === "string"
          ? { startedAt: stage.started_at }
          : {}),
        ...(typeof stage.status === "string" ? { status: stage.status } : {}),
      };
    })
    .filter((item): item is AnalysisStudioJobStageSummary => item !== null);
}

function normalizeResults(
  payload: unknown,
): Omit<AnalysisStudioResultSummary, "recipeLabels">[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): Omit<AnalysisStudioResultSummary, "recipeLabels"> | null => {
      const result = item as AnalysisResultApiItem;
      const analysisResultId = normalizeString(result?.analysis_result_id);
      if (!analysisResultId) {
        return null;
      }
      const status = normalizeString(result.status) ?? "";
      const canOpenExplorer =
        status !== "deleted" &&
        status !== "failed" &&
        result.explorer_readiness?.ready === true;
      const recipeIds = normalizeStringList(result.recipe_ids);
      const recipeNames = normalizeStringList(result.recipe_names);
      const effectiveRecipeIds = recipeIds.length > 0 ? recipeIds : recipeNames;

      return {
        analysisJobId: normalizeString(result.analysis_job_id) ?? "",
        analysisResultId,
        artifactHealth: {
          missingOptionalArtifactKeys: normalizeStringList(
            result.artifact_health?.missing_optional_artifact_keys,
          ),
          missingOptionalRenderCacheKeys: normalizeStringList(
            result.artifact_health?.missing_optional_render_cache_artifact_keys,
          ),
          missingRequiredArtifactKeys: normalizeStringList(
            result.artifact_health?.missing_required_artifact_keys,
          ),
        },
        canOpenExplorer,
        explorerHref:
          normalizeString(result.explorer_href) ??
          `/latent-map?analysisResultId=${encodeURIComponent(analysisResultId)}`,
        itemCount: normalizeNumber(result.item_count),
        recipeIds: effectiveRecipeIds,
        runId: analysisResultId,
        scopeLabel: normalizeString(result.scope_label) ?? analysisResultId,
        state: normalizeResultState(result, canOpenExplorer),
        staleness: {
          addedImageCount: normalizeNumber(result.staleness?.added_image_count),
          removedImageCount: normalizeNumber(
            result.staleness?.removed_image_count,
          ),
          state: normalizeString(result.staleness?.state) ?? "unknown",
        },
        storageTotals: {
          durableBytes: normalizeNumber(result.storage_totals?.durable),
          renderCacheBytes: normalizeNumber(
            result.storage_totals?.["render-cache"],
          ),
          totalBytes: normalizeNumber(result.storage_totals?.total),
          viewerCacheBytes: normalizeNumber(
            result.storage_totals?.["viewer-cache"],
          ),
        },
        storageByRole: normalizeNumberRecord(result.storage_by_role),
      };
    })
    .filter(
      (item): item is Omit<AnalysisStudioResultSummary, "recipeLabels"> =>
        item !== null,
    );
}

function normalizeResultState(
  result: AnalysisResultApiItem,
  canOpenExplorer: boolean,
): AnalysisResultStatusState {
  const state = normalizeString(result.result_state?.state ?? result.status);
  if (isAnalysisResultStatusState(state)) {
    if (state === "ready" && !canOpenExplorer) {
      return "incomplete";
    }
    return state;
  }
  if (normalizeString(result.staleness?.state) !== "current") {
    return "stale";
  }
  return canOpenExplorer ? "ready" : "incomplete";
}

function isAnalysisResultStatusState(
  value: string | undefined,
): value is AnalysisResultStatusState {
  return (
    value === "deleted" ||
    value === "failed" ||
    value === "incomplete" ||
    value === "ready" ||
    value === "stale"
  );
}

function fallbackRecipeChoices(): AnalysisStudioRecipeChoice[] {
  return [
    {
      inputSize: 256,
      isDefault: false,
      label: "DINOv3 ViT-S 256px",
      recipeId: "dinov3_vits_256",
    },
    {
      inputSize: 384,
      isDefault: true,
      label: "DINOv3 ViT-S 384px",
      recipeId: "dinov3_vits_384",
    },
    {
      inputSize: 512,
      isDefault: false,
      label: "DINOv3 ViT-S 512px",
      recipeId: "dinov3_vits_512",
    },
  ];
}

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(normalizeString)
    .filter((item): item is string => item !== undefined);
}

function normalizeSearchParam(
  searchParams: AnalysisStudioSearchParams,
  key: string,
): string | undefined {
  const value = searchParams[key];
  const firstValue = Array.isArray(value) ? value[0] : value;
  const normalized = typeof firstValue === "string" ? firstValue.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((record, entry) => {
    const [key, entryValue] = entry;
    if (typeof entryValue === "number" && Number.isFinite(entryValue)) {
      record[key] = entryValue;
    }
    return record;
  }, {});
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : DEFAULT_API_PORT;
}
