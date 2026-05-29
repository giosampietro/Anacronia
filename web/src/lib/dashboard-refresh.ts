export function shouldAutoRefreshDashboard(workerStatus: string): boolean {
  return workerStatus === "running";
}
