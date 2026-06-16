export type AnalysisStudioSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AnalysisStudioUrlState =
  | { state: "overview" }
  | { state: "new-analysis" }
  | { analysisId: string; state: "selected-analysis" }
  | { analysisResultId: string; state: "selected-result" }
  | { analysisJobId: string; state: "selected-job" };

export type ResolvedAnalysisStudioUrlState =
  | AnalysisStudioUrlState
  | { analysisId: string; state: "missing-analysis" }
  | { analysisResultId: string; state: "missing-result" }
  | { analysisJobId: string; state: "missing-job" };

export function parseAnalysisStudioUrlState(
  searchParams: AnalysisStudioSearchParams | URLSearchParams,
): AnalysisStudioUrlState {
  const analysisId = getSearchParam(searchParams, "analysisId");
  if (analysisId !== undefined) {
    return { analysisId, state: "selected-analysis" };
  }

  const analysisResultId = getSearchParam(searchParams, "analysisResultId");
  if (analysisResultId !== undefined) {
    return { analysisResultId, state: "selected-result" };
  }

  const analysisJobId = getSearchParam(searchParams, "analysisJobId");
  if (analysisJobId !== undefined) {
    return { analysisJobId, state: "selected-job" };
  }

  return getSearchParam(searchParams, "mode") === "new-analysis"
    ? { state: "new-analysis" }
    : { state: "overview" };
}

export function resolveAnalysisStudioUrlState(
  state: AnalysisStudioUrlState,
  {
    analysisIds,
    analysisJobIds,
    analysisResultIds,
  }: {
    analysisIds: string[];
    analysisJobIds: string[];
    analysisResultIds: string[];
  },
): ResolvedAnalysisStudioUrlState {
  if (state.state === "selected-analysis" && !analysisIds.includes(state.analysisId)) {
    return {
      analysisId: state.analysisId,
      state: "missing-analysis",
    };
  }

  if (
    state.state === "selected-result" &&
    !analysisResultIds.includes(state.analysisResultId)
  ) {
    return {
      analysisResultId: state.analysisResultId,
      state: "missing-result",
    };
  }

  if (
    state.state === "selected-job" &&
    !analysisJobIds.includes(state.analysisJobId)
  ) {
    return {
      analysisJobId: state.analysisJobId,
      state: "missing-job",
    };
  }

  return state;
}

export function createAnalysisStudioHref(
  state: AnalysisStudioUrlState,
): string {
  const searchParams = new URLSearchParams();

  if (state.state === "new-analysis") {
    searchParams.set("mode", "new-analysis");
  } else if (state.state === "selected-analysis") {
    searchParams.set("analysisId", state.analysisId);
  } else if (state.state === "selected-result") {
    searchParams.set("analysisResultId", state.analysisResultId);
  } else if (state.state === "selected-job") {
    searchParams.set("analysisJobId", state.analysisJobId);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams}` : "";
  return `/analysis-results${suffix}`;
}

function getSearchParam(
  searchParams: AnalysisStudioSearchParams | URLSearchParams,
  key: string,
): string | undefined {
  const value =
    searchParams instanceof URLSearchParams
      ? searchParams.get(key)
      : searchParams[key];
  const firstValue = Array.isArray(value) ? value[0] : value;
  const normalized = typeof firstValue === "string" ? firstValue.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
}
