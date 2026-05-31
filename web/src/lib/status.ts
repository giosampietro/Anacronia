export type WorkerHealth = {
  service: "worker";
  status: "idle" | "running" | "stopping" | "paused" | "stopped" | "error";
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
  displayState: string;
  detail: string;
};

function workerDisplayState(status: WorkerHealth["status"]): string {
  if (status === "running" || status === "stopping") {
    return "active";
  }

  return status;
}

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
      displayState: "ok",
      detail: `Listening on localhost:${uiPort}`,
    },
    {
      name: "FastAPI backend",
      state: apiHealth.status,
      displayState: apiHealth.status,
      detail: `Reachable on localhost:${apiPort}`,
    },
    {
      name: "Python worker",
      state: apiHealth.worker.status,
      displayState: workerDisplayState(apiHealth.worker.status),
      detail: apiHealth.worker.status === "idle" ? "Ready for searches" : "Processing",
    },
  ];
}
