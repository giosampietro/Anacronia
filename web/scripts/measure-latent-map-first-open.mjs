#!/usr/bin/env node

const DEFAULT_ANALYSIS_RESULT_ID =
  "analysis-result-20260616T235200Z-dinov3_vits_384";
const DEFAULT_BASE_URL = "http://localhost:18660";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = buildMeasurementUrl(options);
  const routeMeasurement = await fetchHtml(url);
  const startupMeasurement = extractStartupMeasurement(routeMeasurement.text);

  const payload = {
    route: {
      decodedBytes: routeMeasurement.decodedBytes,
      finalUrl: routeMeasurement.finalUrl,
      responseStartMs: roundMs(routeMeasurement.responseStartMs),
      status: routeMeasurement.status,
      streamFirstChunkMs: roundMs(routeMeasurement.streamFirstChunkMs),
      totalMs: roundMs(routeMeasurement.totalMs),
      url: String(url),
    },
    startup: startupMeasurement,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printHumanSummary(payload);
}

function parseArgs(args) {
  const options = {
    analysisResultId:
      process.env.ANACRONIA_LATENT_MAP_ANALYSIS_RESULT_ID ??
      DEFAULT_ANALYSIS_RESULT_ID,
    baseUrl: process.env.ANACRONIA_LATENT_MAP_BASE_URL ?? DEFAULT_BASE_URL,
    json: false,
    url: process.env.ANACRONIA_LATENT_MAP_MEASURE_URL ?? null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--url") {
      options.url = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--analysis-result-id") {
      options.analysisResultId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildMeasurementUrl(options) {
  const url = new URL(
    options.url ??
      `/latent-map?analysisResultId=${encodeURIComponent(
        options.analysisResultId,
      )}`,
    options.baseUrl,
  );

  url.searchParams.set("measureStartup", "1");
  return url;
}

async function fetchHtml(url) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: {
      accept: "text/html",
    },
  });
  const responseStartMs = performance.now() - startedAt;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while measuring ${url}`);
  }
  if (!response.body) {
    throw new Error("Response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let decodedBytes = 0;
  let streamFirstChunkMs = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }
    if (streamFirstChunkMs === 0) {
      streamFirstChunkMs = performance.now() - startedAt;
    }

    decodedBytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();

  return {
    decodedBytes,
    finalUrl: response.url,
    responseStartMs,
    status: response.status,
    streamFirstChunkMs,
    text,
    totalMs: performance.now() - startedAt,
  };
}

function extractStartupMeasurement(html) {
  const match = /<script(?=[^>]*data-testid="latent-map-startup-measurement")[^>]*>([\s\S]*?)<\/script>/.exec(
    html,
  );

  if (!match) {
    throw new Error(
      "Startup measurement JSON was not found. Check that measureStartup=1 reached the latent-map route.",
    );
  }

  return JSON.parse(match[1]);
}

function printHumanSummary(payload) {
  const { route, startup } = payload;
  const { summary } = startup;

  console.log("Latent map first-open measurement");
  console.log(`URL: ${route.finalUrl}`);
  console.log(
    `Route: status ${route.status}, response ${route.responseStartMs} ms, first chunk ${route.streamFirstChunkMs} ms, total ${route.totalMs} ms, decoded ${route.decodedBytes} bytes`,
  );
  console.log(
    `Startup: total ${startup.totalMs} ms, detail fetch ${summary.analysisResultDetailFetchMs} ms, artifact fetch ${summary.artifactFetchMs} ms, artifact parse ${summary.artifactParseMs} ms`,
  );
  console.log(
    `Contract: atlas manifests ${summary.atlasManifestMs} ms, vector validation ${summary.vectorValidationMs} ms, normalization ${summary.normalizationMs} ms, serialization ${summary.serializationMs} ms / ${summary.serializationBytes} bytes`,
  );
  console.log(`Artifact bytes: ${summary.artifactBytes}`);

  const topArtifacts = startup.entries
    .filter((entry) => entry.name === "analysis-result-artifact-fetch")
    .toSorted((left, right) => right.durationMs - left.durationMs)
    .slice(0, 8);

  if (topArtifacts.length > 0) {
    console.log("");
    console.log("Top artifact fetches:");
    topArtifacts.forEach((entry) => {
      console.log(
        `- ${entry.durationMs} ms ${entry.metadata.artifactRole ?? "artifact"} ${entry.metadata.bytes ?? 0} bytes ${entry.metadata.artifactKey}`,
      );
    });
  }
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
