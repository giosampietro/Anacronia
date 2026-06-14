#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_RUN_ID = "20260609T130049Z-mvp1-j-shoot-20260609";
const DEFAULT_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";
const DEFAULT_ORIGIN = "http://127.0.0.1:18661";
const DEFAULT_RECIPE = "dinov3_vits_384";
const DEFAULT_LAYOUT = "umap_n30_mindist0p1_seed42";
const DEFAULT_CLUSTER = "hdbscan_detail_mcs15_ms5_leaf";

const args = parseArgs(process.argv.slice(2));
const runId = args["run-id"] ?? DEFAULT_RUN_ID;
const runsRoot = args["runs-root"] ?? DEFAULT_RUNS_ROOT;
const origin = (args.origin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
const analysisResultId = args["analysis-result-id"] ?? `latent-map-${runId}`;
const recipe = args.recipe ?? DEFAULT_RECIPE;
const layout = args.layout ?? DEFAULT_LAYOUT;
const cluster = args.cluster ?? DEFAULT_CLUSTER;
const runDir = path.join(runsRoot, runId);

const manifest = await readJson(path.join(runDir, "analysis-result.json"));
const firstImageId = await readFirstImageId(path.join(runDir, "manifest.jsonl"));
const baselineAtlasKey = findRequiredArtifactKey({
  artifacts: manifest.artifacts,
  contentTypePrefix: "image/",
  keyIncludes: "/32px/",
  role: "thumbnail-atlas",
});
const pageUrl = createLatentMapUrl({ neighborCount: 20, mode: "points" });
const thumbnailUrl = createLatentMapUrl({ neighborCount: 20, mode: "thumbnails" });
const baselineAtlasUrl =
  `${origin}/api/latent-map/thumbnails?analysisResultId=` +
  `${encodeURIComponent(analysisResultId)}&artifactKey=${encodeURIComponent(
    baselineAtlasKey,
  )}`;

const pageCheck = await fetchText(pageUrl);
assertIncludes(pageCheck.body, "latent-map-canvas", "durable Explorer page");

const thumbnailPageCheck = await fetchText(thumbnailUrl);
assertIncludes(
  thumbnailPageCheck.body,
  "latent-map-canvas",
  "durable thumbnail Explorer page",
);

const atlasCheck = await fetchBinary(baselineAtlasUrl);
assert(
  atlasCheck.contentType.startsWith("image/"),
  `Expected baseline atlas image content type, got ${atlasCheck.contentType}`,
);

const neighbor20 = await fetchJson(createNeighborUrl(20));
const neighbor50 = await fetchJson(createNeighborUrl(50));
assertNeighborPayload(neighbor20, 20);
assertNeighborPayload(neighbor50, 50);

console.log(
  JSON.stringify(
    {
      analysis_result_id: analysisResultId,
      baseline_atlas_key: baselineAtlasKey,
      checked_urls: {
        atlas: baselineAtlasUrl,
        neighbors_20: createNeighborUrl(20),
        neighbors_50: createNeighborUrl(50),
        page: pageUrl,
        thumbnails: thumbnailUrl,
      },
      faiss_query_ms: {
        neighbors_20: neighbor20.timings?.faiss_query_ms,
        neighbors_50: neighbor50.timings?.faiss_query_ms,
      },
      first_image_id: firstImageId,
      status: "ok",
    },
    null,
    2,
  ),
);

function createLatentMapUrl({
  mode,
  neighborCount,
}) {
  const params = new URLSearchParams({
    analysisResultId,
    clusterResult: cluster,
    detail: "auto",
    layout,
    mode,
    neighbors: String(neighborCount),
    recipe,
    relation: "closest",
    thumb: "64",
    z: "0.75",
  });

  return `${origin}/latent-map?${params}`;
}

function createNeighborUrl(topK) {
  const params = new URLSearchParams({
    analysisResultId,
    image_id: firstImageId,
    recipe,
    relation: "closest",
    top_k: String(topK),
  });

  return `${origin}/api/latent-map/neighbors?${params}`;
}

async function fetchText(url) {
  const response = await fetch(url);
  assert(response.ok, `GET ${url} failed with HTTP ${response.status}`);

  return {
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function fetchBinary(url) {
  const response = await fetch(url);
  assert(response.ok, `GET ${url} failed with HTTP ${response.status}`);
  await response.arrayBuffer();

  return {
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  assert(response.ok, `GET ${url} failed with HTTP ${response.status}`);

  return response.json();
}

function assertNeighborPayload(payload, expectedCount) {
  assert(
    payload.analysis_result_id === analysisResultId,
    `Expected Analysis Result ${analysisResultId} in neighbor payload.`,
  );
  assert(
    payload.top_k === expectedCount,
    `Expected top_k ${expectedCount}, got ${payload.top_k}`,
  );
  assert(
    Array.isArray(payload.neighbors) && payload.neighbors.length >= expectedCount,
    `Expected at least ${expectedCount} neighbors, got ${
      payload.neighbors?.length ?? "none"
    }`,
  );
}

function findRequiredArtifactKey({
  artifacts,
  contentTypePrefix,
  keyIncludes,
  role,
}) {
  const artifact = Array.isArray(artifacts)
    ? artifacts.find(
        (candidate) =>
          candidate &&
          typeof candidate === "object" &&
          candidate.role === role &&
          (!contentTypePrefix ||
            (typeof candidate.content_type === "string" &&
              candidate.content_type.startsWith(contentTypePrefix))) &&
          typeof candidate.key === "string" &&
          candidate.key.includes(keyIncludes),
      )
    : null;

  assert(artifact, `Missing ${role} artifact containing ${keyIncludes}`);

  return artifact.key;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function readFirstImageId(filePath) {
  const firstLine = (await readFile(filePath, "utf-8"))
    .split("\n")
    .find((line) => line.trim().length > 0);
  assert(firstLine, `Missing image rows in ${filePath}`);
  const row = JSON.parse(firstLine);
  assert(row.image_id, `First manifest row in ${filePath} has no image_id`);

  return row.image_id;
}

function assertIncludes(value, needle, label) {
  assert(value.includes(needle), `${label} did not include ${needle}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!value.startsWith("--")) {
      continue;
    }

    parsed[value.slice(2)] = values[index + 1] ?? "";
    index += 1;
  }

  return parsed;
}
