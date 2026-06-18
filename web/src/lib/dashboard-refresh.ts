export function shouldAutoRefreshDashboard(
  workerStatus: string,
  localFolderImportStatus?: string,
): boolean {
  return (
    workerStatus === "running" ||
    workerStatus === "stopping" ||
    localFolderImportStatus === "running"
  );
}

export const PROVIDER_SEARCH_REFRESH_STORAGE_KEY =
  "anacronia:provider-search-refresh";
const PROVIDER_SEARCH_REFRESH_CHANNEL = "anacronia-provider-search-refresh";

type TimerId = ReturnType<typeof setInterval>;

type ProviderSearchBroadcastChannel = {
  addEventListener?: (type: "message", listener: (event: unknown) => void) => void;
  close: () => void;
  onmessage?: ((event: unknown) => void) | null;
  postMessage: (message: ProviderSearchRefreshMessage) => void;
  removeEventListener?: (
    type: "message",
    listener: (event: unknown) => void,
  ) => void;
};

type ProviderSearchWindow = {
  BroadcastChannel?: new (name: string) => ProviderSearchBroadcastChannel;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  clearInterval: (id: TimerId) => void;
  localStorage?: {
    setItem: (key: string, value: string) => void;
  };
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  setInterval: (callback: () => void, delay: number) => TimerId;
};

type ProviderSearchDocument = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  visibilityState: string;
};

type ProviderSearchRefreshMessage = {
  stamp: string;
  type: "provider-search-refresh";
};

type ProviderSearchFreshnessOptions = {
  autoRefreshActive: boolean;
  documentRef?: ProviderSearchDocument;
  intervalMs: number;
  refresh: () => void;
  windowRef?: ProviderSearchWindow;
};

function defaultWindow(): ProviderSearchWindow | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as unknown as ProviderSearchWindow;
}

function defaultDocument(): ProviderSearchDocument | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  return document as unknown as ProviderSearchDocument;
}

export function announceProviderSearchRefresh(
  windowRef: ProviderSearchWindow | undefined = defaultWindow(),
): void {
  if (windowRef === undefined) {
    return;
  }

  const message: ProviderSearchRefreshMessage = {
    stamp: `${Date.now()}`,
    type: "provider-search-refresh",
  };

  try {
    windowRef.localStorage?.setItem(
      PROVIDER_SEARCH_REFRESH_STORAGE_KEY,
      JSON.stringify(message),
    );
  } catch {
    // Browser privacy modes can block localStorage; BroadcastChannel is the fallback.
  }

  if (windowRef.BroadcastChannel === undefined) {
    return;
  }

  const channel = new windowRef.BroadcastChannel(PROVIDER_SEARCH_REFRESH_CHANNEL);
  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}

export function startProviderSearchFreshnessCoordinator({
  autoRefreshActive,
  documentRef = defaultDocument(),
  intervalMs,
  refresh,
  windowRef = defaultWindow(),
}: ProviderSearchFreshnessOptions): () => void {
  const cleanups: (() => void)[] = [];

  if (autoRefreshActive && windowRef !== undefined) {
    const intervalId = windowRef.setInterval(refresh, intervalMs);
    cleanups.push(() => windowRef.clearInterval(intervalId));
  }

  if (windowRef !== undefined) {
    const handleFocus = () => refresh();
    const handleStorage = (event: unknown) => {
      if (
        typeof event === "object" &&
        event !== null &&
        "key" in event &&
        event.key === PROVIDER_SEARCH_REFRESH_STORAGE_KEY
      ) {
        refresh();
      }
    };

    windowRef.addEventListener("focus", handleFocus);
    windowRef.addEventListener("storage", handleStorage);
    cleanups.push(() => {
      windowRef.removeEventListener("focus", handleFocus);
      windowRef.removeEventListener("storage", handleStorage);
    });

    if (windowRef.BroadcastChannel !== undefined) {
      const channel = new windowRef.BroadcastChannel(
        PROVIDER_SEARCH_REFRESH_CHANNEL,
      );
      const handleMessage = () => refresh();
      if (channel.addEventListener !== undefined) {
        channel.addEventListener("message", handleMessage);
        cleanups.push(() => {
          channel.removeEventListener?.("message", handleMessage);
          channel.close();
        });
      } else {
        channel.onmessage = handleMessage;
        cleanups.push(() => {
          channel.onmessage = null;
          channel.close();
        });
      }
    }
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
