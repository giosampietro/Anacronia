export type LatentMapStartupMetricValue =
  | boolean
  | number
  | string
  | null
  | undefined;

export type LatentMapStartupMetricMetadata = Record<
  string,
  LatentMapStartupMetricValue
>;

export type LatentMapStartupMetricEntry = {
  durationMs: number;
  metadata: Record<string, boolean | number | string | null>;
  name: string;
  status: "error" | "ok";
};

export type LatentMapStartupMeasurement = {
  entries: LatentMapStartupMetricEntry[];
  schema_version: 1;
  summary: {
    analysisResultDetailFetchMs: number;
    analysisResultDetailParseMs: number;
    artifactBytes: number;
    artifactFetchMs: number;
    artifactParseMs: number;
    atlasManifestMs: number;
    normalizationMs: number;
    serializationBytes: number;
    serializationMs: number;
    vectorValidationMs: number;
  };
  totalMs: number;
};

export type LatentMapStartupRecorder = {
  record: (
    name: string,
    metadata?: LatentMapStartupMetricMetadata,
  ) => void;
  snapshot: () => LatentMapStartupMeasurement;
  timeAsync: <T>(
    name: string,
    metadata: LatentMapStartupMetricMetadata | undefined,
    operation: () => Promise<T>,
  ) => Promise<T>;
  timeSync: <T>(
    name: string,
    metadata: LatentMapStartupMetricMetadata | undefined,
    operation: () => T,
  ) => T;
};

export function createLatentMapStartupRecorder(): LatentMapStartupRecorder {
  const startedAt = now();
  const entries: LatentMapStartupMetricEntry[] = [];

  function pushEntry({
    durationMs,
    metadata,
    name,
    status,
  }: LatentMapStartupMetricEntry) {
    entries.push({
      durationMs: roundMs(durationMs),
      metadata,
      name,
      status,
    });
  }

  return {
    record(name, metadata = {}) {
      pushEntry({
        durationMs: 0,
        metadata: normalizeMetadata(metadata),
        name,
        status: "ok",
      });
    },
    snapshot() {
      return {
        entries: [...entries],
        schema_version: 1,
        summary: summarizeEntries(entries),
        totalMs: roundMs(now() - startedAt),
      };
    },
    async timeAsync(name, metadata, operation) {
      const stepStartedAt = now();

      try {
        const result = await operation();
        pushEntry({
          durationMs: now() - stepStartedAt,
          metadata: normalizeMetadata(metadata),
          name,
          status: "ok",
        });
        return result;
      } catch (error) {
        pushEntry({
          durationMs: now() - stepStartedAt,
          metadata: normalizeMetadata(metadata),
          name,
          status: "error",
        });
        throw error;
      }
    },
    timeSync(name, metadata, operation) {
      const stepStartedAt = now();

      try {
        const result = operation();
        pushEntry({
          durationMs: now() - stepStartedAt,
          metadata: normalizeMetadata(metadata),
          name,
          status: "ok",
        });
        return result;
      } catch (error) {
        pushEntry({
          durationMs: now() - stepStartedAt,
          metadata: normalizeMetadata(metadata),
          name,
          status: "error",
        });
        throw error;
      }
    },
  };
}

export function encodedTextByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function summarizeEntries(
  entries: LatentMapStartupMetricEntry[],
): LatentMapStartupMeasurement["summary"] {
  const successfulEntries = entries.filter((entry) => entry.status === "ok");

  return {
    analysisResultDetailFetchMs: sumDurations(
      successfulEntries,
      (entry) => entry.name === "analysis-result-detail-fetch",
    ),
    analysisResultDetailParseMs: sumDurations(
      successfulEntries,
      (entry) => entry.name === "analysis-result-detail-parse",
    ),
    artifactBytes: sumMetadata(
      successfulEntries,
      (entry) => entry.name === "analysis-result-artifact-fetch",
      "bytes",
    ),
    artifactFetchMs: sumDurations(
      successfulEntries,
      (entry) => entry.name === "analysis-result-artifact-fetch",
    ),
    artifactParseMs: sumDurations(
      successfulEntries,
      (entry) => entry.name === "analysis-result-artifact-parse",
    ),
    atlasManifestMs: sumDurations(
      successfulEntries,
      (entry) => entry.metadata.artifactRole === "thumbnail-atlas",
    ),
    normalizationMs: sumDurations(
      successfulEntries,
      (entry) =>
        entry.name === "analysis-result-viewer-normalization" ||
        entry.name === "normalize-exported-viewer-data",
    ),
    serializationBytes: sumMetadata(
      successfulEntries,
      (entry) => entry.name === "viewer-data-json-serialization-size",
      "bytes",
    ),
    serializationMs: sumDurations(
      successfulEntries,
      (entry) => entry.name === "viewer-data-json-serialization-estimate",
    ),
    vectorValidationMs: sumDurations(
      successfulEntries,
      (entry) => entry.name === "vector-id-map-validation",
    ),
  };
}

function sumDurations(
  entries: LatentMapStartupMetricEntry[],
  predicate: (entry: LatentMapStartupMetricEntry) => boolean,
): number {
  return roundMs(
    entries
      .filter(predicate)
      .reduce((total, entry) => total + entry.durationMs, 0),
  );
}

function sumMetadata(
  entries: LatentMapStartupMetricEntry[],
  predicate: (entry: LatentMapStartupMetricEntry) => boolean,
  key: string,
): number {
  return entries
    .filter(predicate)
    .reduce((total, entry) => {
      const value = entry.metadata[key];

      return typeof value === "number" ? total + value : total;
    }, 0);
}

function normalizeMetadata(
  metadata: LatentMapStartupMetricMetadata | undefined,
): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(
      (entry): entry is [string, boolean | number | string | null] =>
        entry[1] !== undefined,
    ),
  );
}

function now(): number {
  return performance.now();
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}
