import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { ExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

export const LATENT_MAP_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";

type ManifestRow = {
  height?: unknown;
  image_id?: unknown;
  relative_path?: unknown;
  thumbnail_path?: unknown;
  width?: unknown;
};

type LayoutFile = {
  layout_id?: unknown;
  method?: unknown;
  params?: unknown;
  points?: { image_id?: unknown; x?: unknown; y?: unknown }[];
  recipe_name?: unknown;
  run_id?: unknown;
};

type ClusterFile = {
  cluster_count?: unknown;
  cluster_id?: unknown;
  method?: unknown;
  points?: { cluster_id?: unknown; image_id?: unknown }[];
  random_state?: unknown;
  recipe_name?: unknown;
  run_id?: unknown;
};

type EmbeddingMetadata = {
  family?: unknown;
  label?: unknown;
  long_edge?: unknown;
  model_id?: unknown;
  recipe_name?: unknown;
};

type LoadedRunOutput<T> = {
  fileName: string;
  path: string;
  value: T;
};

type LoadedRecipe = NonNullable<
  ExportedLatentMapViewerData["available_recipes"]
>[number] & {
  family: string;
  long_edge: number | null;
  model_id: string;
  recipe_name: string;
};

export async function loadLatentMapRunExportedViewerData({
  runDir,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
}: {
  runDir: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
}): Promise<ExportedLatentMapViewerData> {
  const resolvedRunDir = path.resolve(runDir);
  const manifestRows = await readJsonLines<ManifestRow>(
    path.join(resolvedRunDir, "manifest.jsonl"),
  );
  const availableRecipes = await loadAvailableRecipes(resolvedRunDir);
  const selectedRecipe =
    pickExisting(
      availableRecipes.map((recipe) => recipe.recipe_name),
      selectedRecipeName,
    ) ?? availableRecipes[0]?.recipe_name;

  if (!selectedRecipe) {
    throw new Error("Latent map run has no embedding recipes.");
  }

  const layouts = await loadRunOutputs<LayoutFile>({
    dir: path.join(resolvedRunDir, "layouts"),
    recipeName: selectedRecipe,
  });
  const clusters = await loadRunOutputs<ClusterFile>({
    dir: path.join(resolvedRunDir, "clusters"),
    recipeName: selectedRecipe,
  });
  const layout = pickOutputById({
    idField: "layout_id",
    outputs: layouts,
    selectedId: selectedLayoutId,
  });
  const cluster = pickOutputById({
    idField: "cluster_id",
    outputs: clusters,
    selectedId: selectedClusterId,
  });

  if (!layout) {
    throw new Error(`Latent map run has no layout for ${selectedRecipe}.`);
  }
  if (!cluster) {
    throw new Error(`Latent map run has no cluster result for ${selectedRecipe}.`);
  }

  const manifestByImageId = new Map(
    manifestRows.map((row) => [String(row.image_id ?? ""), row]),
  );
  const clusterByImageId = new Map(
    (cluster.value.points ?? []).map((point) => [
      String(point.image_id ?? ""),
      point,
    ]),
  );
  const neighborIndexPath = await existingRelativePath(
    resolvedRunDir,
    path.join("indexes", `${selectedRecipe}_neighbors.jsonl`),
  );
  const thumbnailAtlasManifestPaths = await findThumbnailAtlasManifestPaths(
    resolvedRunDir,
  );
  const thumbnailAtlasManifestPath =
    thumbnailAtlasManifestPaths["64"] ??
    Object.values(thumbnailAtlasManifestPaths)[0];

  return {
    available_clusters: clusters.map((output) => ({
      cluster_count: numberOrNull(output.value.cluster_count),
      cluster_id: String(output.value.cluster_id ?? ""),
      method: String(output.value.method ?? ""),
      random_state: numberOrNull(output.value.random_state),
    })),
    available_layouts: layouts.map((output) => ({
      layout_id: String(output.value.layout_id ?? ""),
      method: String(output.value.method ?? ""),
      params: objectOrEmpty(output.value.params),
    })),
    available_recipes: availableRecipes,
    cluster_id: String(cluster.value.cluster_id ?? ""),
    layout_id: String(layout.value.layout_id ?? ""),
    ...(neighborIndexPath ? { neighbor_index_path: neighborIndexPath } : {}),
    points: (layout.value.points ?? []).map((point) => {
      const imageId = String(point.image_id ?? "");
      const manifestRow = manifestByImageId.get(imageId);
      const clusterPoint = clusterByImageId.get(imageId);

      return {
        cluster_id: Number(clusterPoint?.cluster_id ?? 0),
        height: Number(manifestRow?.height ?? 1),
        image_id: imageId,
        relative_path: String(manifestRow?.relative_path ?? ""),
        thumbnail_path: String(manifestRow?.thumbnail_path ?? ""),
        width: Number(manifestRow?.width ?? 1),
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
      };
    }),
    recipe_name: selectedRecipe,
    run_id: String(layout.value.run_id ?? path.basename(resolvedRunDir)),
    ...(thumbnailAtlasManifestPath
      ? { thumbnail_atlas_manifest_path: thumbnailAtlasManifestPath }
      : {}),
    ...(Object.keys(thumbnailAtlasManifestPaths).length > 0
      ? { thumbnail_atlas_manifest_paths: thumbnailAtlasManifestPaths }
      : {}),
  };
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, "utf-8");

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function loadAvailableRecipes(
  runDir: string,
): Promise<LoadedRecipe[]> {
  const embeddingDir = path.join(runDir, "embeddings");
  const fileNames = await listJsonFiles(embeddingDir);
  const recipes = await Promise.all(
    fileNames.map(async (fileName) => {
      const metadata = JSON.parse(
        await readFile(path.join(embeddingDir, fileName), "utf-8"),
      ) as EmbeddingMetadata;
      const recipeName = String(
        metadata.recipe_name ?? path.basename(fileName, ".json"),
      );

      return {
        family: String(metadata.family ?? inferRecipeFamily(recipeName)),
        ...(typeof metadata.label === "string" && metadata.label.length > 0
          ? { label: metadata.label }
          : {}),
        long_edge:
          typeof metadata.long_edge === "number"
            ? metadata.long_edge
            : inferLongEdge(recipeName),
        model_id: String(metadata.model_id ?? ""),
        recipe_name: recipeName,
      };
    }),
  );

  return recipes.sort((left, right) =>
    left.recipe_name.localeCompare(right.recipe_name),
  );
}

async function loadRunOutputs<T extends { recipe_name?: unknown }>({
  dir,
  recipeName,
}: {
  dir: string;
  recipeName: string;
}): Promise<LoadedRunOutput<T>[]> {
  const fileNames = await listJsonFiles(dir);
  const outputs = await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(dir, fileName);
      const value = JSON.parse(await readFile(filePath, "utf-8")) as T;

      return {
        fileName,
        path: filePath,
        value,
      };
    }),
  );

  return outputs
    .filter((output) => String(output.value.recipe_name ?? "") === recipeName)
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function pickExisting(
  values: string[],
  selectedValue: string | null | undefined,
): string | undefined {
  return selectedValue && values.includes(selectedValue)
    ? selectedValue
    : undefined;
}

function pickOutputById<T>({
  idField,
  outputs,
  selectedId,
}: {
  idField: keyof T;
  outputs: LoadedRunOutput<T>[];
  selectedId?: string | null;
}): LoadedRunOutput<T> | undefined {
  return (
    outputs.find((output) => String(output.value[idField] ?? "") === selectedId) ??
    outputs[0]
  );
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function inferRecipeFamily(recipeName: string): string {
  return recipeName.startsWith("dinov3") ? "dinov3" : "unknown";
}

function inferLongEdge(recipeName: string): number | null {
  const match = /_(\d+)$/.exec(recipeName);
  const longEdge = match ? Number(match[1]) : Number.NaN;

  return Number.isFinite(longEdge) ? longEdge : null;
}

async function existingRelativePath(
  runDir: string,
  relativePath: string,
): Promise<string | undefined> {
  try {
    await readFile(path.join(runDir, relativePath), "utf-8");
    return relativePath;
  } catch {
    return undefined;
  }
}

async function findThumbnailAtlasManifestPaths(
  runDir: string,
): Promise<Record<string, string>> {
  const atlasRoot = path.join(runDir, "viewer", "atlases");
  const atlasDirs = await safeReadDir(atlasRoot);
  const manifestPaths: Record<string, string> = {};

  for (const atlasDir of atlasDirs.sort((left, right) =>
    left.localeCompare(right),
  )) {
    const match = /^(\d+)px$/.exec(atlasDir);

    if (!match) {
      continue;
    }

    const relativePath = path.join(
      "viewer",
      "atlases",
      atlasDir,
      "atlas-manifest.json",
    );
    const found = await existingRelativePath(runDir, relativePath);

    if (found) {
      manifestPaths[match[1]] = found;
    }
  }

  return manifestPaths;
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
