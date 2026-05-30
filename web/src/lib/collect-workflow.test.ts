import { describe, expect, it } from "vitest";

import {
  COLLECT_BUSY_NOTICE,
  canStartCollect,
  collectNoticeFromCode,
  providerSearchAction,
} from "./collect-workflow";

describe("collect workflow", () => {
  it("blocks new collect jobs while the worker is busy", () => {
    expect(canStartCollect("idle")).toBe(true);
    expect(canStartCollect("completed")).toBe(true);
    expect(canStartCollect("running")).toBe(false);
    expect(canStartCollect("stopping")).toBe(false);
    expect(canStartCollect("paused")).toBe(true);
  });

  it("explains a rejected collect request", () => {
    expect(collectNoticeFromCode(COLLECT_BUSY_NOTICE)).toBe(
      "Another search is active. Wait for it to stop before starting or resuming another search.",
    );
    expect(
      collectNoticeFromCode(COLLECT_BUSY_NOTICE, [
        { status: "running" },
      ]),
    ).toBeNull();
    expect(
      collectNoticeFromCode(COLLECT_BUSY_NOTICE, [
        { status: "paused" },
      ]),
    ).toBe(
      "Another search is active. Wait for it to stop before starting or resuming another search.",
    );
    expect(collectNoticeFromCode("unknown")).toBeNull();
    expect(collectNoticeFromCode(null)).toBeNull();
  });

  it("chooses the Provider Search action from lifecycle state", () => {
    expect(providerSearchAction("idle")).toEqual({
      kind: "start",
      label: "Start search",
      showBatchTarget: true,
      disabled: false,
    });
    expect(providerSearchAction("running")).toEqual({
      kind: "stop",
      label: "Stop search",
      showBatchTarget: false,
      disabled: false,
    });
    expect(providerSearchAction("stopping")).toEqual({
      kind: "none",
      label: "Stopping",
      showBatchTarget: false,
      disabled: true,
    });
    expect(providerSearchAction("paused")).toEqual({
      kind: "resume",
      label: "Resume search",
      showBatchTarget: true,
      disabled: false,
    });
    expect(providerSearchAction("stopped")).toEqual({
      kind: "start",
      label: "Resume search",
      showBatchTarget: true,
      disabled: false,
    });
    expect(providerSearchAction("completed")).toEqual({
      kind: "start",
      label: "Keep searching",
      showBatchTarget: true,
      disabled: false,
    });
    expect(providerSearchAction("no_more_results")).toEqual({
      kind: "none",
      label: "No more results",
      showBatchTarget: false,
      disabled: true,
    });
  });
});
