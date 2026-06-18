import {
  loadLatentMapAnalysisResultExportedViewerData,
} from "@/lib/latent-map-run-data";
import type { AnalysisResultStatusSummary } from "@/lib/analysis-result-status";
import {
  encodedTextByteLength,
  type LatentMapStartupMetricMetadata,
  type LatentMapStartupRecorder,
} from "@/lib/latent-map-startup-measurement";
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
  startupRecorder,
}: {
  additionalRunsRoots?: string[];
  analysisResultId: string;
  runsRoot?: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
  startupRecorder?: LatentMapStartupRecorder;
}): Promise<LoadedLatentMapAnalysisResultViewerData> {
  const result = await fetchAnalysisResultDetail({
    analysisResultId,
    startupRecorder,
  });

  return {
    rawData: await loadLatentMapAnalysisResultExportedViewerData({
      analysisResult: result,
      readArtifactText: (artifactKey, artifactRole) =>
        fetchAnalysisResultArtifactText({
          analysisResultId,
          artifactKey,
          artifactRole,
          startupRecorder,
        }),
      selectedClusterId,
      selectedLayoutId,
      selectedRecipeName,
      startupRecorder,
    }),
    runDir: "",
    sourceFolder: stringValue(result.scope_label) || "Analysis Result",
    status: statusFromAnalysisResult(result),
  };
}

async function fetchAnalysisResultDetail({
  analysisResultId,
  startupRecorder,
}: {
  analysisResultId: string;
  startupRecorder?: LatentMapStartupRecorder;
}): Promise<AnalysisResultDetail> {
  const metadata: LatentMapStartupMetricMetadata = {
    analysisResultId,
    bytes: 0,
  };
  const content = await measureStartupAsync(
    startupRecorder,
    "analysis-result-detail-fetch",
    metadata,
    async () => {
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
        throw new Error(
          `Analysis Result could not be loaded: ${analysisResultId}`,
        );
      }

      const text = await response.text();
      metadata.bytes = encodedTextByteLength(text);
      return text;
    },
  );

  const payload = measureStartupSync(
    startupRecorder,
    "analysis-result-detail-parse",
    metadata,
    () => JSON.parse(content) as AnalysisResultDetailPayload,
  );
  if (!payload.result) {
    throw new Error(`Analysis Result could not be loaded: ${analysisResultId}`);
  }
  return payload.result;
}

async function fetchAnalysisResultArtifactText({
  analysisResultId,
  artifactKey,
  artifactRole,
  startupRecorder,
}: {
  analysisResultId: string;
  artifactKey: string;
  artifactRole?: string;
  startupRecorder?: LatentMapStartupRecorder;
}): Promise<string> {
  const metadata: LatentMapStartupMetricMetadata = {
    analysisResultId,
    artifactKey,
    artifactRole: artifactRole ?? null,
    bytes: 0,
  };

  return measureStartupAsync(
    startupRecorder,
    "analysis-result-artifact-fetch",
    metadata,
    async () => {
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
        throw new Error(
          `Pinned Analysis Result artifact is missing: ${artifactKey}`,
        );
      }
      if (!response.ok) {
        throw new Error(`Pinned Analysis Result artifact failed: ${artifactKey}`);
      }

      const text = await response.text();
      metadata.bytes = encodedTextByteLength(text);
      return text;
    },
  );
}

function measureStartupAsync<T>(
  startupRecorder: LatentMapStartupRecorder | undefined,
  name: string,
  metadata: LatentMapStartupMetricMetadata,
  operation: () => Promise<T>,
): Promise<T> {
  return startupRecorder
    ? startupRecorder.timeAsync(name, metadata, operation)
    : operation();
}

function measureStartupSync<T>(
  startupRecorder: LatentMapStartupRecorder | undefined,
  name: string,
  metadata: LatentMapStartupMetricMetadata,
  operation: () => T,
): T {
  return startupRecorder
    ? startupRecorder.timeSync(name, metadata, operation)
    : operation();
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
