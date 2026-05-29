export const COLLECT_BUSY_NOTICE = "collect-busy";

export function canStartCollect(workerStatus: string): boolean {
  return workerStatus !== "running" && workerStatus !== "paused";
}

export function collectNoticeFromCode(code: string | null | undefined): string | null {
  if (code === COLLECT_BUSY_NOTICE) {
    return "Another collect is active. Resume, cancel, or wait before starting a new collect.";
  }

  return null;
}
