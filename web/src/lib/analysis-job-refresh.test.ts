import { describe, expect, it } from "vitest";

import {
  shouldAutoRefreshAnalysisJobs,
  startAnalysisJobFreshnessCoordinator,
} from "./analysis-job-refresh";

describe("analysis job refresh", () => {
  it("refreshes while any Analysis Job is active", () => {
    expect(shouldAutoRefreshAnalysisJobs(["ready"])).toBe(false);
    expect(shouldAutoRefreshAnalysisJobs(["failed"])).toBe(false);
    expect(shouldAutoRefreshAnalysisJobs(["ready", "running"])).toBe(true);
    expect(shouldAutoRefreshAnalysisJobs(["queued"])).toBe(true);
  });

  it("continues refreshing on an interval while active", () => {
    const refreshes: string[] = [];
    const windowRef = createFakeWindow();

    const cleanup = startAnalysisJobFreshnessCoordinator({
      autoRefreshActive: true,
      intervalMs: 2500,
      refresh: () => refreshes.push("refresh"),
      windowRef,
    });

    expect(windowRef.intervals).toHaveLength(1);
    windowRef.intervals[0]?.callback();
    expect(refreshes).toEqual(["refresh"]);

    cleanup();
    expect(windowRef.clearedIntervalIds).toEqual([1]);
  });

  it("refreshes when the tab gains focus or becomes visible", () => {
    const refreshes: string[] = [];
    const windowRef = createFakeWindow();
    const documentRef = createFakeDocument();

    startAnalysisJobFreshnessCoordinator({
      autoRefreshActive: false,
      documentRef,
      intervalMs: 2500,
      refresh: () => refreshes.push("refresh"),
      windowRef,
    });

    windowRef.emit("focus");
    documentRef.visibilityState = "hidden";
    documentRef.emit("visibilitychange");
    documentRef.visibilityState = "visible";
    documentRef.emit("visibilitychange");

    expect(refreshes).toEqual(["refresh", "refresh"]);
  });
});

function createFakeWindow() {
  const listeners = new Map<string, (() => void)[]>();
  const fakeWindow = {
    clearedIntervalIds: [] as number[],
    intervals: [] as { callback: () => void; delay: number; id: number }[],
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    clearInterval(id: number) {
      fakeWindow.clearedIntervalIds.push(id);
    },
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    },
    setInterval(callback: () => void, delay: number) {
      const id = fakeWindow.intervals.length + 1;
      fakeWindow.intervals.push({ callback, delay, id });
      return id;
    },
  };
  return fakeWindow;
}

function createFakeDocument() {
  const listeners = new Map<string, (() => void)[]>();
  return {
    visibilityState: "visible",
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    },
  };
}
