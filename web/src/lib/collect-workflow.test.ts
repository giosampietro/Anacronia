import { describe, expect, it } from "vitest";

import {
  COLLECT_BUSY_NOTICE,
  canStartCollect,
  collectNoticeFromCode,
} from "./collect-workflow";

describe("collect workflow", () => {
  it("blocks new collect jobs while the worker is busy", () => {
    expect(canStartCollect("idle")).toBe(true);
    expect(canStartCollect("completed")).toBe(true);
    expect(canStartCollect("running")).toBe(false);
    expect(canStartCollect("paused")).toBe(false);
  });

  it("explains a rejected collect request", () => {
    expect(collectNoticeFromCode(COLLECT_BUSY_NOTICE)).toBe(
      "Another collect is active. Resume, cancel, or wait before starting a new collect.",
    );
    expect(collectNoticeFromCode("unknown")).toBeNull();
    expect(collectNoticeFromCode(null)).toBeNull();
  });
});
