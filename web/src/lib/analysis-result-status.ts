import { access, readFile } from "node:fs/promises";
import path from "node:path";

export type AnalysisResultManifestLike = {
  artifacts?: unknown;
  status?: unknown;
};

export type AnalysisResultArtifactLike = {
  key?: unknown;
  retention_class?: unknown;
  role?: unknown;
};

export type AnalysisResultStatusState =
  | "deleted"
  | "ready"
  | "stale"
  | "incomplete"
  | "failed";

export type AnalysisResultStatusSummary = {
  canOpenExplorer: boolean;
  missingOptionalRenderCacheKeys: string[];
  missingRequiredRelationArtifactKeys: string[];
  missingRequiredViewerArtifactKeys: string[];
  relationAvailable: boolean;
  sourceChanges: {
    addedImageIds: string[];
    removedImageIds: string[];
  };
  state: AnalysisResultStatusState;
};

const REQUIRED_VIEWER_ROLES = new Set([
  "cluster-result",
  "image-manifest",
  "layout",
]);

export function summarizeAnalysisResultStatus({
  currentImageIds,
  existingArtifactKeys,
  manifest,
  snapshotImageIds,
}: {
  currentImageIds?: Set<string>;
  existingArtifactKeys?: Set<string>;
  manifest: AnalysisResultManifestLike;
  snapshotImageIds?: Set<string>;
}): AnalysisResultStatusSummary {
  const artifacts = normalizeArtifacts(manifest.artifacts);
  const missingOptionalRenderCacheKeys = missingArtifactKeys(
    artifacts.filter((artifact) => artifact.retention_class === "render-cache"),
    existingArtifactKeys,
  );
  const relationArtifacts = artifacts.filter(
    (artifact) => artifact.role === "faiss-index",
  );
  const missingRequiredRelationArtifactKeys = missingArtifactKeys(
    relationArtifacts,
    existingArtifactKeys,
  );
  const missingRequiredViewerArtifactKeys = missingArtifactKeys(
    artifacts.filter((artifact) => REQUIRED_VIEWER_ROLES.has(artifact.role)),
    existingArtifactKeys,
  );
  const sourceChanges = summarizeSourceChanges({
    currentImageIds,
    snapshotImageIds,
  });
  const relationAvailable =
    relationArtifacts.length > 0 &&
    missingRequiredRelationArtifactKeys.length === 0;
  const canOpenExplorer =
    manifest.status !== "deleted" &&
    manifest.status !== "failed" &&
    missingRequiredViewerArtifactKeys.length === 0;
  const state = pickStatusState({
    canOpenExplorer,
    hasSourceChanges:
      sourceChanges.addedImageIds.length > 0 ||
      sourceChanges.removedImageIds.length > 0,
    manifestStatus: manifest.status,
    missingRequiredRelationArtifactKeys,
    missingRequiredViewerArtifactKeys,
  });

  return {
    canOpenExplorer,
    missingOptionalRenderCacheKeys,
    missingRequiredRelationArtifactKeys,
    missingRequiredViewerArtifactKeys,
    relationAvailable,
    sourceChanges,
    state,
  };
}

export async function loadAnalysisResultStatus({
  runDir,
}: {
  runDir: string;
}): Promise<AnalysisResultStatusSummary> {
  const manifest = JSON.parse(
    await readFile(path.join(runDir, "analysis-result.json"), "utf-8"),
  ) as AnalysisResultManifestLike;
  const artifacts = normalizeArtifacts(manifest.artifacts);
  const existingArtifactKeys = new Set<string>();

  await Promise.all(
    artifacts.map(async (artifact) => {
      try {
        await access(path.join(runDir, artifact.key));
        existingArtifactKeys.add(artifact.key);
      } catch {
        // Missing artifacts are reported in the status summary.
      }
    }),
  );

  return summarizeAnalysisResultStatus({
    existingArtifactKeys,
    manifest,
  });
}

function pickStatusState({
  canOpenExplorer,
  hasSourceChanges,
  manifestStatus,
  missingRequiredRelationArtifactKeys,
  missingRequiredViewerArtifactKeys,
}: {
  canOpenExplorer: boolean;
  hasSourceChanges: boolean;
  manifestStatus: unknown;
  missingRequiredRelationArtifactKeys: string[];
  missingRequiredViewerArtifactKeys: string[];
}): AnalysisResultStatusState {
  if (manifestStatus === "failed") {
    return "failed";
  }
  if (manifestStatus === "deleted") {
    return "deleted";
  }
  if (
    !canOpenExplorer ||
    missingRequiredViewerArtifactKeys.length > 0 ||
    missingRequiredRelationArtifactKeys.length > 0
  ) {
    return "incomplete";
  }
  if (hasSourceChanges) {
    return "stale";
  }

  return "ready";
}

function missingArtifactKeys(
  artifacts: Required<AnalysisResultArtifactLike>[],
  existingArtifactKeys: Set<string> | undefined,
): string[] {
  if (!existingArtifactKeys) {
    return [];
  }

  return artifacts
    .map((artifact) => artifact.key)
    .filter((key) => !existingArtifactKeys.has(key))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeArtifacts(value: unknown): Required<AnalysisResultArtifactLike>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((artifact): artifact is Record<string, unknown> =>
      Boolean(
        artifact && typeof artifact === "object" && !Array.isArray(artifact),
      ),
    )
    .map((artifact) => ({
      key: String(artifact.key ?? ""),
      retention_class: String(artifact.retention_class ?? ""),
      role: String(artifact.role ?? ""),
    }))
    .filter((artifact) => artifact.key.length > 0);
}

function summarizeSourceChanges({
  currentImageIds,
  snapshotImageIds,
}: {
  currentImageIds?: Set<string>;
  snapshotImageIds?: Set<string>;
}) {
  if (!currentImageIds || !snapshotImageIds) {
    return {
      addedImageIds: [],
      removedImageIds: [],
    };
  }

  return {
    addedImageIds: [...currentImageIds]
      .filter((imageId) => !snapshotImageIds.has(imageId))
      .sort((left, right) => left.localeCompare(right)),
    removedImageIds: [...snapshotImageIds]
      .filter((imageId) => !currentImageIds.has(imageId))
      .sort((left, right) => left.localeCompare(right)),
  };
}
