import { describe, expect, it } from "vitest";

import { shouldAutoRefreshDashboard } from "./dashboard-refresh";

describe("shouldAutoRefreshDashboard", () => {
  it("refreshes while a collection is actively running", () => {
    expect(shouldAutoRefreshDashboard("running")).toBe(true);
  });

  it("does not refresh for stable worker states", () => {
    expect(shouldAutoRefreshDashboard("idle")).toBe(false);
    expect(shouldAutoRefreshDashboard("completed")).toBe(false);
    expect(shouldAutoRefreshDashboard("paused")).toBe(false);
  });
});
