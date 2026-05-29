export const COLLECT_BUSY_NOTICE = "collect-busy";

export function canStartCollect(workerStatus: string): boolean {
  return workerStatus !== "running" && workerStatus !== "paused";
}

export function collectNoticeFromCode(code: string | null | undefined): string | null {
  if (code === COLLECT_BUSY_NOTICE) {
    return "Another collect job is already running. Wait for it to finish before starting a new Met collection.";
  }

  return null;
}
