import { describe, expect, it } from "vitest";

import {
  DEFAULT_CANDIDATE_LIMIT,
  MAX_CANDIDATE_LIMIT,
  normalizeCandidateLimit,
} from "./candidate-limits";

describe("normalizeCandidateLimit", () => {
  it("keeps Met candidate runs inside the local safety range", () => {
    expect(normalizeCandidateLimit("25")).toBe(25);
    expect(normalizeCandidateLimit("")).toBe(DEFAULT_CANDIDATE_LIMIT);
    expect(normalizeCandidateLimit("0")).toBe(1);
    expect(normalizeCandidateLimit("500000")).toBe(MAX_CANDIDATE_LIMIT);
  });
});
