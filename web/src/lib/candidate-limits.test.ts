import { describe, expect, it } from "vitest";

import {
  BATCH_TARGET_OPTIONS,
  DEFAULT_BATCH_TARGET,
  DEFAULT_MAX_IMAGES_PER_OBJECT,
  normalizeBatchTarget,
  normalizeMaxImagesPerObject,
} from "./candidate-limits";

describe("batch target settings", () => {
  it("normalizes Met search batch targets to the approved dropdown values", () => {
    expect(BATCH_TARGET_OPTIONS).toEqual([5, 10, 20, 30, 100, 500, 1000]);
    expect(normalizeBatchTarget("5")).toBe(5);
    expect(normalizeBatchTarget("500")).toBe(500);
    expect(normalizeBatchTarget("")).toBe(DEFAULT_BATCH_TARGET);
    expect(normalizeBatchTarget("250")).toBe(DEFAULT_BATCH_TARGET);
    expect(normalizeMaxImagesPerObject("")).toBe(DEFAULT_MAX_IMAGES_PER_OBJECT);
    expect(normalizeMaxImagesPerObject("0")).toBe(1);
    expect(normalizeMaxImagesPerObject("12")).toBe(3);
  });
});
