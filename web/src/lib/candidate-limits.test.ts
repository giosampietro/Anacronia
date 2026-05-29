import { describe, expect, it } from "vitest";

import {
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_CANDIDATE_OFFSET,
  DEFAULT_MAX_IMAGES_PER_OBJECT,
  normalizeCandidateLimit,
  normalizeCandidateOffset,
  normalizeMaxImagesPerObject,
} from "./candidate-limits";

describe("collect settings", () => {
  it("normalizes chunked Met collect controls", () => {
    expect(normalizeCandidateOffset("25")).toBe(25);
    expect(normalizeCandidateOffset("")).toBe(DEFAULT_CANDIDATE_OFFSET);
    expect(normalizeCandidateOffset("-10")).toBe(0);
    expect(normalizeCandidateLimit("25")).toBe(25);
    expect(normalizeCandidateLimit("")).toBe(DEFAULT_CANDIDATE_LIMIT);
    expect(normalizeCandidateLimit("0")).toBe(1);
    expect(normalizeCandidateLimit("500000")).toBe(500000);
    expect(normalizeMaxImagesPerObject("")).toBe(DEFAULT_MAX_IMAGES_PER_OBJECT);
    expect(normalizeMaxImagesPerObject("0")).toBe(1);
    expect(normalizeMaxImagesPerObject("12")).toBe(3);
  });
});
