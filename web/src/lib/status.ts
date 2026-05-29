export type WorkerHealth = {
  service: "worker";
  status: "idle" | "running" | "paused" | "error";
  active_collect_job_id?: number | null;
};

export type ApiHealth = {
  service: "api";
  status: "ok" | "error";
  worker: WorkerHealth;
};

export type StatusRow = {
  name: string;
  state: string;
  detail: string;
};

type CreateStatusRowsInput = {
  uiPort: number;
  apiPort: number;
  apiHealth: ApiHealth;
};

export function createStatusRows({
  uiPort,
  apiPort,
  apiHealth,
}: CreateStatusRowsInput): StatusRow[] {
  return [
    {
      name: "Next.js UI",
      state: "ok",
      detail: `Listening on localhost:${uiPort}`,
    },
    {
      name: "FastAPI backend",
      state: apiHealth.status,
      detail: `Reachable on localhost:${apiPort}`,
    },
    {
      name: "Python worker",
      state: apiHealth.worker.status,
      detail: apiHealth.worker.status === "idle" ? "Ready for collect jobs" : "Processing",
    },
  ];
}
