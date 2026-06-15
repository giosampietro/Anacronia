import {
  loadLatentMapAnalysisResultExportedViewerData,
} from "@/lib/latent-map-run-data";
import type { AnalysisResultStatusSummary } from "@/lib/analysis-result-status";
import type { ExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

const DEFAULT_API_PORT = 18670;

export type LoadedLatentMapAnalysisResultViewerData = {
  rawData: ExportedLatentMapViewerData;
  runDir: string;
  sourceFolder: string;
  status: AnalysisResultStatusSummary;
};

type AnalysisResultDetailPayload = {
  result?: AnalysisResultDetail;
};

type AnalysisResultDetail = {
  analysis_result_id?: unknown;
  artifact_health?: {
    missing_optional_render_cache_artifact_keys?: unknown;
    missing_required_artifact_keys?: unknown;
  };
  artifacts?: unknown;
  explorer_readiness?: {
    ready?: unknown;
  };
  recipes?: unknown;
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
};

export async function loadLatentMapAnalysisResultViewerData({
  analysisResultId,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
}: {
  additionalRunsRoots?: string[];
  analysisResultId: string;
  runsRoot?: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
}): Promise<LoadedLatentMapAnalysisResultViewerData> {
  const result = await fetchAnalysisResultDetail(analysisResultId);

  return {
    rawData: await loadLatentMapAnalysisResultExportedViewerData({
      analysisResult: result,
      readArtifactText: (artifactKey) =>
        fetchAnalysisResultArtifactText({
          analysisResultId,
          artifactKey,
        }),
      selectedClusterId,
      selectedLayoutId,
      selectedRecipeName,
    }),
    runDir: "",
    sourceFolder: stringValue(result.scope_label) || "Analysis Result",
    status: statusFromAnalysisResult(result),
  };
}

async function fetchAnalysisResultDetail(
  analysisResultId: string,
): Promise<AnalysisResultDetail> {
  const response = await fetch(
    `${apiBaseUrl()}/analysis-results/${encodeURIComponent(analysisResultId)}`,
    {
      cache: "no-store",
      method: "GET",
    },
  );
  if (response.status === 404) {
    throw new Error(`Analysis Result not found: ${analysisResultId}`);
  }
  if (!response.ok) {
    throw new Error(`Analysis Result could not be loaded: ${analysisResultId}`);
  }

  const payload = (await response.json()) as AnalysisResultDetailPayload;
  if (!payload.result) {
    throw new Error(`Analysis Result could not be loaded: ${analysisResultId}`);
  }
  return payload.result;
}

async function fetchAnalysisResultArtifactText({
  analysisResultId,
  artifactKey,
}: {
  analysisResultId: string;
  artifactKey: string;
}): Promise<string> {
  const response = await fetch(
    `${apiBaseUrl()}/analysis-results/${encodeURIComponent(
      analysisResultId,
    )}/artifacts/${encodeArtifactKeyPath(artifactKey)}`,
    {
      cache: "no-store",
      method: "GET",
    },
  );
  if (response.status === 404) {
    throw new Error(`Pinned Analysis Result artifact is missing: ${artifactKey}`);
  }
  if (!response.ok) {
    throw new Error(`Pinned Analysis Result artifact failed: ${artifactKey}`);
  }
  return response.text();
}

function statusFromAnalysisResult(
  result: AnalysisResultDetail,
): AnalysisResultStatusSummary {
  const missingRequiredKeys = stringList(
    result.artifact_health?.missing_required_artifact_keys,
  );
  const missingOptionalRenderCacheKeys = stringList(
    result.artifact_health?.missing_optional_render_cache_artifact_keys,
  );
  const status = stringValue(result.status);
  const canOpenExplorer =
    status !== "deleted" &&
    status !== "failed" &&
    result.explorer_readiness?.ready === true;
  const addedImageCount = numberValue(result.staleness?.added_image_count);
  const sourceChanges = {
    addedImageIds: [],
    removedImageIds: [],
  };

  return {
    activeImageIds: [],
    canOpenExplorer,
    missingOptionalRenderCacheKeys,
    missingRequiredRelationArtifactKeys: [],
    missingRequiredViewerArtifactKeys: missingRequiredKeys,
    relationAvailable: true,
    runUpdatedAnalysisAvailable: addedImageCount > 0,
    sourceChanges,
    state: canOpenExplorer ? "ready" : status === "failed" ? "failed" : "incomplete",
  };
}

function apiBaseUrl(): string {
  return `http://127.0.0.1:${getApiPort()}`;
}

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : DEFAULT_API_PORT;
}

function encodeArtifactKeyPath(artifactKey: string): string {
  return artifactKey.split("/").map(encodeURIComponent).join("/");
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
