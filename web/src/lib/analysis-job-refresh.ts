const ANALYSIS_JOB_REFRESH_ACTIVE_STATUSES = new Set(["queued", "running"]);

type TimerId = ReturnType<typeof setInterval>;

type AnalysisJobRefreshWindow = {
  addEventListener: (type: string, listener: () => void) => void;
  clearInterval: (id: TimerId) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  setInterval: (callback: () => void, delay: number) => TimerId;
};

type AnalysisJobRefreshDocument = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  visibilityState: string;
};

type AnalysisJobFreshnessOptions = {
  autoRefreshActive: boolean;
  documentRef?: AnalysisJobRefreshDocument;
  intervalMs: number;
  refresh: () => void;
  windowRef?: AnalysisJobRefreshWindow;
};

function defaultWindow(): AnalysisJobRefreshWindow | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as unknown as AnalysisJobRefreshWindow;
}

function defaultDocument(): AnalysisJobRefreshDocument | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  return document as unknown as AnalysisJobRefreshDocument;
}

export function shouldAutoRefreshAnalysisJobs(statuses: string[]): boolean {
  return statuses.some((status) =>
    ANALYSIS_JOB_REFRESH_ACTIVE_STATUSES.has(status),
  );
}

export function startAnalysisJobFreshnessCoordinator({
  autoRefreshActive,
  documentRef = defaultDocument(),
  intervalMs,
  refresh,
  windowRef = defaultWindow(),
}: AnalysisJobFreshnessOptions): () => void {
  const cleanups: (() => void)[] = [];

  if (autoRefreshActive && windowRef !== undefined) {
    const intervalId = windowRef.setInterval(refresh, intervalMs);
    cleanups.push(() => windowRef.clearInterval(intervalId));
  }

  if (windowRef !== undefined) {
    const handleFocus = () => refresh();
    windowRef.addEventListener("focus", handleFocus);
    cleanups.push(() => {
      windowRef.removeEventListener("focus", handleFocus);
    });
  }

  if (documentRef !== undefined) {
    const handleVisibilityChange = () => {
      if (documentRef.visibilityState === "visible") {
        refresh();
      }
    };
    documentRef.addEventListener("visibilitychange", handleVisibilityChange);
    cleanups.push(() => {
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
