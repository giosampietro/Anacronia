import {
  createAnalysisStudioHref,
  parseAnalysisStudioUrlState,
  resolveAnalysisStudioUrlState,
  type AnalysisStudioSearchParams,
  type ResolvedAnalysisStudioUrlState,
} from "@/lib/analysis-studio-url";
import { createLocalAnalysisResultStore } from "@/lib/analysis-result-store";
import { shouldAutoRefreshAnalysisJobs } from "@/lib/analysis-job-refresh";

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

export type AnalysisStudioJobSummary = {
  analysisJobId: string;
  analysisResultIds: string[];
  recipeIds: string[];
  recipeLabels: string[];
  stages: AnalysisStudioJobStageSummary[];
  status: string;
  viewerHrefs: string[];
};

export type AnalysisStudioJobStageSummary = {
  error?: string;
  recipeId?: string;
  stageName?: string;
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
  artifactKeys: string[];
  canOpenExplorer: boolean;
  explorerHref: string;
  itemCount: number;
  recipeIds: string[];
  recipeLabels: string[];
  runId: string;
  scopeLabel: string;
  state: string;
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
};

export type AnalysisStudioReadModel = {
  activeJob: AnalysisStudioJobSummary | null;
  collections: AnalysisStudioCollectionChoice[];
  collectionsUnavailable: boolean;
  jobs: AnalysisStudioJobSummary[];
  jobsUnavailable: boolean;
  recipes: AnalysisStudioRecipeChoice[];
  recipesUnavailable: boolean;
  results: AnalysisStudioResultSummary[];
  selectedJob: AnalysisStudioJobSummary | null;
  selectedResult: AnalysisStudioResultSummary | null;
  selectedState: ResolvedAnalysisStudioUrlState;
  summary: {
    indexedImageCount: number;
    resultCount: number;
  };
};

type AnalysisJobApiItem = {
  analysis_job_id?: unknown;
  analysis_result_ids?: unknown;
  recipe_ids?: unknown;
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
  additionalRunsRoots = [],
  apiPort = getApiPort(),
  runsRoot,
  searchParams = {},
}: {
  additionalRunsRoots?: string[];
  apiPort?: number;
  runsRoot: string;
  searchParams?: AnalysisStudioSearchParams;
}): Promise<AnalysisStudioReadModel> {
  const [collectionsResult, recipesResult, jobsResult, results] =
    await Promise.all([
      listCollections({ apiPort }),
      listRecipes({ apiPort }),
      listJobs({ apiPort }),
      createLocalAnalysisResultStore({ additionalRunsRoots, runsRoot }).listStudio(),
    ]);
  const recipeLabelById = new Map(
    recipesResult.recipes.map((recipe) => [recipe.recipeId, recipe.label]),
  );
  const jobs = jobsResult.jobs.map((job) => ({
    ...job,
    recipeLabels: job.recipeIds.map(
      (recipeId) => recipeLabelById.get(recipeId) ?? recipeId,
    ),
  }));
  const resultSummaries = results.map((result) => ({
    analysisJobId: result.analysisJobId,
    analysisResultId: result.analysisResultId,
    artifactHealth: result.artifactHealth,
    artifactKeys: result.artifactKeys,
    canOpenExplorer: result.canOpenExplorer,
    explorerHref: `/latent-map?analysisResultId=${encodeURIComponent(
      result.analysisResultId,
    )}`,
    itemCount: result.itemCount,
    recipeIds: result.recipeNames,
    recipeLabels: result.recipeNames.map(
      (recipeId) => recipeLabelById.get(recipeId) ?? recipeId,
    ),
    runId: result.runId,
    scopeLabel: result.scopeLabel || result.sourceFolderName || result.runId,
    state: result.state,
    staleness: result.staleness,
    storageTotals: result.storageTotals,
  }));
  const selectedState = resolveAnalysisStudioUrlState(
    parseAnalysisStudioUrlState(searchParams),
    {
      analysisJobIds: jobs.map((job) => job.analysisJobId),
      analysisResultIds: resultSummaries.map((result) => result.analysisResultId),
    },
  );

  return {
    activeJob: jobs.find((job) => shouldAutoRefreshAnalysisJobs([job.status])) ?? null,
    collections: collectionsResult.collections,
    collectionsUnavailable: collectionsResult.unavailable,
    jobs,
    jobsUnavailable: jobsResult.unavailable,
    recipes: recipesResult.recipes,
    recipesUnavailable: recipesResult.unavailable,
    results: resultSummaries,
    selectedJob:
      selectedState.state === "selected-job"
        ? jobs.find((job) => job.analysisJobId === selectedState.analysisJobId) ??
          null
        : null,
    selectedResult:
      selectedState.state === "selected-result"
        ? resultSummaries.find(
            (result) => result.analysisResultId === selectedState.analysisResultId,
          ) ?? null
        : null,
    selectedState,
    summary: {
      indexedImageCount: resultSummaries.reduce(
        (total, result) => total + result.itemCount,
        0,
      ),
      resultCount: resultSummaries.length,
    },
  };
}

export { createAnalysisStudioHref };

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
  jobs: Omit<AnalysisStudioJobSummary, "recipeLabels">[];
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
): Omit<AnalysisStudioJobSummary, "recipeLabels">[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): Omit<AnalysisStudioJobSummary, "recipeLabels"> | null => {
      const job = item as AnalysisJobApiItem;
      const analysisJobId = normalizeString(job?.analysis_job_id);
      if (!analysisJobId) {
        return null;
      }
      return {
        analysisJobId,
        analysisResultIds: normalizeStringList(job.analysis_result_ids),
        recipeIds: normalizeStringList(job.recipe_ids),
        stages: normalizeJobStages(job.stages),
        status: normalizeString(job.status) ?? "unknown",
        viewerHrefs: normalizeStringList(job.viewer_hrefs),
      };
    })
    .filter(
      (item): item is Omit<AnalysisStudioJobSummary, "recipeLabels"> =>
        item !== null,
    );
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
        ...(typeof stage.error === "string" ? { error: stage.error } : {}),
        ...(typeof stage.recipe_id === "string"
          ? { recipeId: stage.recipe_id }
          : {}),
        ...(typeof stage.stage_name === "string"
          ? { stageName: stage.stage_name }
          : {}),
        ...(typeof stage.status === "string" ? { status: stage.status } : {}),
      };
    })
    .filter((item): item is AnalysisStudioJobStageSummary => item !== null);
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

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : DEFAULT_API_PORT;
}
