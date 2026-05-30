export const COLLECT_BUSY_NOTICE = "collect-busy";

export function canStartCollect(workerStatus: string): boolean {
  return workerStatus !== "running" && workerStatus !== "stopping";
}

type ProviderSearchStatus = {
  status: string;
};

export function collectNoticeFromCode(
  code: string | null | undefined,
  activeProviderCollections: ProviderSearchStatus[] = [],
): string | null {
  const activeCollectionOwnsBusySearch = activeProviderCollections.some(
    (providerCollection) =>
      providerCollection.status === "running" || providerCollection.status === "stopping",
  );

  if (code === COLLECT_BUSY_NOTICE && activeCollectionOwnsBusySearch) {
    return null;
  }

  if (code === COLLECT_BUSY_NOTICE) {
    return "Another search is active. Wait for it to stop before starting or resuming another search.";
  }

  return null;
}

export function providerSearchStatusClassName(status: string): string | undefined {
  if (status === "running") {
    return "motion-safe:animate-pulse ring-1 ring-primary/40";
  }

  return undefined;
}

export type ProviderSearchAction = {
  kind: "start" | "stop" | "resume" | "none";
  label: string;
  showBatchTarget: boolean;
  disabled: boolean;
};

export function providerSearchAction(status: string): ProviderSearchAction {
  if (status === "running") {
    return {
      kind: "stop",
      label: "Stop search",
      showBatchTarget: false,
      disabled: false,
    };
  }

  if (status === "stopping") {
    return {
      kind: "none",
      label: "Stopping",
      showBatchTarget: false,
      disabled: true,
    };
  }

  if (status === "paused") {
    return {
      kind: "resume",
      label: "Resume search",
      showBatchTarget: true,
      disabled: false,
    };
  }

  if (status === "stopped") {
    return {
      kind: "start",
      label: "Resume search",
      showBatchTarget: true,
      disabled: false,
    };
  }

  if (status === "completed") {
    return {
      kind: "start",
      label: "Keep searching",
      showBatchTarget: true,
      disabled: false,
    };
  }

  if (status === "no_more_results") {
    return {
      kind: "none",
      label: "No more results",
      showBatchTarget: false,
      disabled: true,
    };
  }

  return {
    kind: "start",
    label: "Start search",
    showBatchTarget: true,
    disabled: false,
  };
}
