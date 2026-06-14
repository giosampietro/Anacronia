import { access, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveAnalysisResultRunDir } from "@/lib/analysis-result-artifacts";

type AnalysisResultManifest = {
  analysis_result_id?: unknown;
  artifacts?: unknown;
  status?: unknown;
};

type AnalysisResultArtifact = {
  key: string;
  retentionClass: string;
  role: string;
};

export type AnalysisResultDeletionPlan = {
  analysisResultId: string;
  deleteDurableArtifactKeys: string[];
  deleteRenderCacheKeys: string[];
  missingArtifactKeys: string[];
  preserveArtifactKeys: string[];
  runDir: string;
};

export type AnalysisResultDeletionSummary = AnalysisResultDeletionPlan & {
  deleted: boolean;
  deletedAt: string;
  deletedDurableArtifactKeys: string[];
  deletedRenderCacheKeys: string[];
};

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

const PRESERVED_ARTIFACT_ROLES = new Set([
  "embedding",
  "image-embedding-result",
  "permanent-derivative",
  "raw-provider-record",
  "source-derivative",
  "source-image",
]);

export async function planAnalysisResultDeletion({
  analysisResultId,
  runsRoot,
}: {
  analysisResultId: string;
  runsRoot: string;
}): Promise<AnalysisResultDeletionPlan> {
  const runDir = await resolveAnalysisResultRunDir({
    analysisResultId,
    runsRoot,
  });

  if (!runDir) {
    throw new AnalysisResultNotFoundError(analysisResultId);
  }

  const manifest = await readAnalysisResultManifest(runDir);
  const artifacts = normalizeArtifacts(manifest.artifacts);
  const deleteDurableArtifactKeys: string[] = [];
  const deleteRenderCacheKeys: string[] = [];
  const preserveArtifactKeys: string[] = [];
  const missingArtifactKeys: string[] = [];

  await Promise.all(
    artifacts.map(async (artifact) => {
      const artifactPath = resolveArtifactPath({ artifactKey: artifact.key, runDir });
      const exists = await artifactExists(artifactPath);

      if (!exists) {
        missingArtifactKeys.push(artifact.key);
      }

      if (PRESERVED_ARTIFACT_ROLES.has(artifact.role)) {
        preserveArtifactKeys.push(artifact.key);
      } else if (artifact.retentionClass === "render-cache") {
        deleteRenderCacheKeys.push(artifact.key);
      } else {
        deleteDurableArtifactKeys.push(artifact.key);
      }
    }),
  );

  return {
    analysisResultId,
    deleteDurableArtifactKeys: deleteDurableArtifactKeys.sort(compareKeys),
    deleteRenderCacheKeys: deleteRenderCacheKeys.sort(compareKeys),
    missingArtifactKeys: missingArtifactKeys.sort(compareKeys),
    preserveArtifactKeys: preserveArtifactKeys.sort(compareKeys),
    runDir,
  };
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
  const plan = await planAnalysisResultDeletion({ analysisResultId, runsRoot });
  const deletedDurableArtifactKeys = await deleteArtifacts({
    artifactKeys: plan.deleteDurableArtifactKeys,
    runDir: plan.runDir,
  });
  const deletedRenderCacheKeys = await deleteArtifacts({
    artifactKeys: plan.deleteRenderCacheKeys,
    runDir: plan.runDir,
  });
  const deletedAtText = deletedAt.toISOString();
  const manifest = await readAnalysisResultManifest(plan.runDir);

  await writeFile(
    path.join(plan.runDir, "analysis-result.json"),
    `${JSON.stringify(
      {
        ...manifest,
        deleted_at: deletedAtText,
        deletion: {
          deleted_durable_artifact_keys: deletedDurableArtifactKeys,
          deleted_render_cache_keys: deletedRenderCacheKeys,
          missing_artifact_keys: plan.missingArtifactKeys,
          preserved_artifact_keys: plan.preserveArtifactKeys,
        },
        status: "deleted",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return {
    ...plan,
    deleted: true,
    deletedAt: deletedAtText,
    deletedDurableArtifactKeys,
    deletedRenderCacheKeys,
  };
}

async function readAnalysisResultManifest(
  runDir: string,
): Promise<AnalysisResultManifest> {
  return JSON.parse(
    await readFile(path.join(runDir, "analysis-result.json"), "utf-8"),
  ) as AnalysisResultManifest;
}

function normalizeArtifacts(value: unknown): AnalysisResultArtifact[] {
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
      retentionClass: String(artifact.retention_class ?? ""),
      role: String(artifact.role ?? ""),
    }))
    .filter((artifact) => artifact.key.length > 0);
}

function resolveArtifactPath({
  artifactKey,
  runDir,
}: {
  artifactKey: string;
  runDir: string;
}): string {
  assertSafeArtifactKey(artifactKey);
  const resolvedRunDir = path.resolve(runDir);
  const artifactPath = path.resolve(resolvedRunDir, artifactKey);
  const allowedPrefix = `${resolvedRunDir}${path.sep}`;

  if (
    artifactPath !== resolvedRunDir &&
    !artifactPath.startsWith(allowedPrefix)
  ) {
    throw new UnsafeAnalysisResultDeletionError();
  }

  return artifactPath;
}

function assertSafeArtifactKey(artifactKey: string) {
  const normalized = path.posix.normalize(artifactKey);

  if (
    artifactKey.length === 0 ||
    artifactKey.includes("\\") ||
    path.isAbsolute(artifactKey) ||
    normalized !== artifactKey ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new UnsafeAnalysisResultDeletionError();
  }
}

async function artifactExists(artifactPath: string): Promise<boolean> {
  try {
    await access(artifactPath);
    return true;
  } catch {
    return false;
  }
}

async function deleteArtifacts({
  artifactKeys,
  runDir,
}: {
  artifactKeys: string[];
  runDir: string;
}): Promise<string[]> {
  const deletedArtifactKeys: string[] = [];

  await Promise.all(
    artifactKeys.map(async (artifactKey) => {
      const artifactPath = resolveArtifactPath({ artifactKey, runDir });

      try {
        await unlink(artifactPath);
        deletedArtifactKeys.push(artifactKey);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }
    }),
  );

  return deletedArtifactKeys.sort(compareKeys);
}

function isMissingFileError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function compareKeys(left: string, right: string): number {
  return left.localeCompare(right);
}
