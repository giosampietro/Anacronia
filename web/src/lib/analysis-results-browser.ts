import type { AnalysisResultStatusState } from "@/lib/analysis-result-status";

const DEFAULT_API_PORT = 18670;

export type AnalysisResultListItem = {
  analysisResultId: string;
  canOpenExplorer: boolean;
  explorerHref: string;
  itemCount: number;
  recipeNames: string[];
  runId: string;
  sourceFolderName: string;
  state: AnalysisResultStatusState;
};

type AnalysisResultApiPayload = {
  results?: AnalysisResultApiItem[];
};

type AnalysisResultApiItem = {
  analysis_result_id?: unknown;
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
    state?: unknown;
  };
};

export async function listAnalysisResults(): Promise<AnalysisResultListItem[]> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${getApiPort()}/analysis-results`,
      {
        cache: "no-store",
        method: "GET",
      },
    );
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as AnalysisResultApiPayload;
    return normalizeAnalysisResults(payload);
  } catch {
    return [];
  }
}

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : DEFAULT_API_PORT;
}

function normalizeAnalysisResults(
  payload: AnalysisResultApiPayload,
): AnalysisResultListItem[] {
  if (!Array.isArray(payload.results)) {
    return [];
  }

  return payload.results
    .map(normalizeAnalysisResult)
    .filter((result): result is AnalysisResultListItem => result !== null);
}

function normalizeAnalysisResult(
  item: AnalysisResultApiItem,
): AnalysisResultListItem | null {
  const analysisResultId = stringValue(item.analysis_result_id);
  if (analysisResultId.length === 0) {
    return null;
  }

  const status = stringValue(item.status);
  const canOpenExplorer =
    status !== "deleted" &&
    status !== "failed" &&
    item.explorer_readiness?.ready === true;
  const recipeNames = stringList(item.recipe_names);
  const recipeIds = stringList(item.recipe_ids);

  return {
    analysisResultId,
    canOpenExplorer,
    explorerHref:
      stringValue(item.explorer_href) ||
      `/latent-map?analysisResultId=${encodeURIComponent(analysisResultId)}`,
    itemCount: numberValue(item.item_count),
    recipeNames: recipeNames.length > 0 ? recipeNames : recipeIds,
    runId: analysisResultId,
    sourceFolderName: stringValue(item.scope_label),
    state: normalizeStatusState(item, canOpenExplorer),
  };
}

function normalizeStatusState(
  item: AnalysisResultApiItem,
  canOpenExplorer: boolean,
): AnalysisResultStatusState {
  const state = stringValue(item.result_state?.state || item.status);
  if (isAnalysisResultStatusState(state)) {
    if (state === "ready" && !canOpenExplorer) {
      return "incomplete";
    }
    return state;
  }
  if (stringValue(item.staleness?.state) !== "current") {
    return "stale";
  }
  return canOpenExplorer ? "ready" : "incomplete";
}

function isAnalysisResultStatusState(
  value: string,
): value is AnalysisResultStatusState {
  return (
    value === "deleted" ||
    value === "failed" ||
    value === "incomplete" ||
    value === "ready" ||
    value === "stale"
  );
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(stringValue).filter(Boolean);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
