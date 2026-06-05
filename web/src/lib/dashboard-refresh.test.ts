import { describe, expect, it } from "vitest";

import {
  PROVIDER_SEARCH_REFRESH_STORAGE_KEY,
  announceProviderSearchRefresh,
  shouldAutoRefreshDashboard,
  startProviderSearchFreshnessCoordinator,
} from "./dashboard-refresh";

describe("shouldAutoRefreshDashboard", () => {
  it("refreshes while a collection is actively running or stopping", () => {
    expect(shouldAutoRefreshDashboard("running")).toBe(true);
    expect(shouldAutoRefreshDashboard("stopping")).toBe(true);
  });

  it("does not refresh for stable worker states", () => {
    expect(shouldAutoRefreshDashboard("idle")).toBe(false);
    expect(shouldAutoRefreshDashboard("completed")).toBe(false);
    expect(shouldAutoRefreshDashboard("paused")).toBe(false);
  });

  it("continues refreshing on an interval while Provider Search is active", () => {
    const refreshes: string[] = [];
    const windowRef = createFakeWindow();

    const cleanup = startProviderSearchFreshnessCoordinator({
      autoRefreshActive: true,
      intervalMs: 3000,
      refresh: () => refreshes.push("refresh"),
      windowRef,
    });

    expect(windowRef.intervals).toHaveLength(1);
    windowRef.intervals[0]?.callback();
    expect(refreshes).toEqual(["refresh"]);

    cleanup();
    expect(windowRef.clearedIntervalIds).toEqual([1]);
  });

  it("refreshes an idle tab when it gains focus or becomes visible", () => {
    const refreshes: string[] = [];
    const windowRef = createFakeWindow();
    const documentRef = createFakeDocument();

    startProviderSearchFreshnessCoordinator({
      autoRefreshActive: false,
      intervalMs: 3000,
      refresh: () => refreshes.push("refresh"),
      windowRef,
      documentRef,
    });

    windowRef.emit("focus");
    documentRef.visibilityState = "hidden";
    documentRef.emit("visibilitychange");
    documentRef.visibilityState = "visible";
    documentRef.emit("visibilitychange");

    expect(refreshes).toEqual(["refresh", "refresh"]);
  });

  it("refreshes when another tab announces Provider Search state changed", () => {
    const refreshes: string[] = [];
    const windowRef = createFakeWindow();

    startProviderSearchFreshnessCoordinator({
      autoRefreshActive: false,
      intervalMs: 3000,
      refresh: () => refreshes.push("refresh"),
      windowRef,
    });

    windowRef.emit("storage", {
      key: PROVIDER_SEARCH_REFRESH_STORAGE_KEY,
    });

    expect(refreshes).toEqual(["refresh"]);
  });

  it("announces Provider Search changes through storage and BroadcastChannel", () => {
    const windowRef = createFakeWindow();

    announceProviderSearchRefresh(windowRef);

    expect(windowRef.localStorageWrites[0]?.key).toBe(
      PROVIDER_SEARCH_REFRESH_STORAGE_KEY,
    );
    expect(windowRef.broadcastMessages).toHaveLength(1);
    expect(windowRef.broadcastMessages[0]?.type).toBe("provider-search-refresh");
  });
});

function createFakeWindow() {
  const listeners = new Map<string, ((event?: unknown) => void)[]>();
  let nextIntervalId = 1;
  const fakeWindow = {
    broadcastMessages: [] as unknown[],
    clearedIntervalIds: [] as number[],
    intervals: [] as { callback: () => void; delay: number; id: number }[],
    localStorageWrites: [] as { key: string; value: string }[],
    BroadcastChannel: class FakeBroadcastChannel {
      constructor(public name: string) {}
      addEventListener() {}
      close() {}
      postMessage(message: unknown) {
        fakeWindow.broadcastMessages.push(message);
      }
      removeEventListener() {}
    },
    addEventListener(type: string, listener: (event?: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    clearInterval(id: number) {
      fakeWindow.clearedIntervalIds.push(id);
    },
    emit(type: string, event?: unknown) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    localStorage: {
      setItem(key: string, value: string) {
        fakeWindow.localStorageWrites.push({ key, value });
      },
    },
    removeEventListener(type: string, listener: (event?: unknown) => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    },
    setInterval(callback: () => void, delay: number) {
      const id = nextIntervalId;
      nextIntervalId += 1;
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
