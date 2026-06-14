import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type AnalysisResultManifest = {
  analysis_result_id?: unknown;
  artifacts?: unknown;
};

type AnalysisResultArtifact = {
  content_type?: unknown;
  key?: unknown;
};

export type ResolvedAnalysisResultArtifact = {
  contentType: string;
  filePath: string;
};

export class UnsafeArtifactKeyError extends Error {
  constructor(message = "Artifact key is outside the Analysis Result.") {
    super(message);
    this.name = "UnsafeArtifactKeyError";
  }
}

export async function resolveAnalysisResultArtifact({
  analysisResultId,
  artifactKey,
  runsRoot,
}: {
  analysisResultId: string;
  artifactKey: string;
  runsRoot: string;
}): Promise<ResolvedAnalysisResultArtifact | null> {
  assertSafeArtifactKey(artifactKey);

  const resolvedRunsRoot = path.resolve(runsRoot);
  const found = await findAnalysisResultManifest({
    analysisResultId,
    runsRoot: resolvedRunsRoot,
  });

  if (!found) {
    return null;
  }

  const artifact = getManifestArtifacts(found.manifest).find(
    (candidate) => candidate.key === artifactKey,
  );

  if (!artifact) {
    return null;
  }

  const filePath = path.resolve(found.runDir, artifactKey);
  const allowedPrefix = `${found.runDir}${path.sep}`;

  if (filePath !== found.runDir && !filePath.startsWith(allowedPrefix)) {
    throw new UnsafeArtifactKeyError();
  }

  return {
    contentType:
      typeof artifact.content_type === "string"
        ? artifact.content_type
        : inferContentType(filePath),
    filePath,
  };
}

export function inferContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".json") {
    return "application/json";
  }
  if (extension === ".jsonl") {
    return "application/x-jsonlines";
  }

  return "image/jpeg";
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
    throw new UnsafeArtifactKeyError();
  }
}

async function findAnalysisResultManifest({
  analysisResultId,
  runsRoot,
}: {
  analysisResultId: string;
  runsRoot: string;
}): Promise<{ manifest: AnalysisResultManifest; runDir: string } | null> {
  const directRunName = analysisResultId.startsWith("latent-map-")
    ? analysisResultId.slice("latent-map-".length)
    : "";
  const directRunDir = directRunName
    ? path.resolve(runsRoot, directRunName)
    : null;

  if (directRunDir) {
    const directManifest = await readManifestIfMatching({
      analysisResultId,
      runDir: directRunDir,
      runsRoot,
    });

    if (directManifest) {
      return directManifest;
    }
  }

  for (const entry of await safeReadDir(runsRoot)) {
    if (!entry.isDirectory()) {
      continue;
    }
    const runDir = path.resolve(runsRoot, entry.name);
    if (directRunDir && runDir === directRunDir) {
      continue;
    }

    const manifest = await readManifestIfMatching({
      analysisResultId,
      runDir,
      runsRoot,
    });

    if (manifest) {
      return manifest;
    }
  }

  return null;
}

async function readManifestIfMatching({
  analysisResultId,
  runDir,
  runsRoot,
}: {
  analysisResultId: string;
  runDir: string;
  runsRoot: string;
}): Promise<{ manifest: AnalysisResultManifest; runDir: string } | null> {
  const allowedPrefix = `${runsRoot}${path.sep}`;

  if (runDir !== runsRoot && !runDir.startsWith(allowedPrefix)) {
    return null;
  }

  try {
    const manifest = JSON.parse(
      await readFile(path.join(runDir, "analysis-result.json"), "utf-8"),
    ) as AnalysisResultManifest;

    if (manifest.analysis_result_id === analysisResultId) {
      return { manifest, runDir };
    }
  } catch {
    return null;
  }

  return null;
}

function getManifestArtifacts(
  manifest: AnalysisResultManifest,
): AnalysisResultArtifact[] {
  if (!Array.isArray(manifest.artifacts)) {
    return [];
  }

  return manifest.artifacts.filter(
    (artifact): artifact is AnalysisResultArtifact =>
      Boolean(
        artifact &&
          typeof artifact === "object" &&
          !Array.isArray(artifact) &&
          typeof (artifact as AnalysisResultArtifact).key === "string",
      ),
  );
}

async function safeReadDir(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
