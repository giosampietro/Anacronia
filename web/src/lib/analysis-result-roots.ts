const DEFAULT_LATENT_MAP_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";
const ROOT_LIST_DELIMITER = ":";

export function getLatentMapRunsRoot(): string {
  return process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT ?? DEFAULT_LATENT_MAP_RUNS_ROOT;
}

export function getAdditionalAnalysisResultRoots(): string[] {
  const roots = [
    ...splitRootList(process.env.ANACRONIA_ANALYSIS_RESULTS_ROOT),
    ...(process.env.ANACRONIA_DATA_ROOT
      ? [`${stripTrailingSlash(process.env.ANACRONIA_DATA_ROOT)}/analysis-results`]
      : []),
  ].map(stripTrailingSlash);
  const primary = stripTrailingSlash(getLatentMapRunsRoot());

  return roots.filter(
    (root, index) => root !== primary && roots.indexOf(root) === index,
  );
}

function splitRootList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(ROOT_LIST_DELIMITER)
    .map((root) => root.trim())
    .filter(Boolean);
}

function stripTrailingSlash(value: string): string {
  if (value === "/") {
    return value;
  }
  return value.replace(/\/+$/, "");
}
