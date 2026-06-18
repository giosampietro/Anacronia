export type WorkerHealth = {
  service: "worker";
  status: "idle" | "running" | "stopping" | "paused" | "stopped" | "error";
  active_collect_job_id?: number | null;
};

export type LocalFolderImportHealth = {
  status: "running" | "completed" | "failed";
  display_name: string;
  search_set_slug: string;
  folder_path: string;
  phase: string;
  discovered_file_count: number;
  processed_file_count: number;
  imported_image_count: number;
  skipped_file_count: number;
};

export type ApiHealth = {
  service: "api";
  status: "ok" | "error";
  worker: WorkerHealth;
  local_folder_import?: LocalFolderImportHealth;
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

function localFolderImportDisplayState(status: LocalFolderImportHealth["status"]): string {
  return status === "running" ? "active" : status;
}

function localFolderImportDetail(importStatus: LocalFolderImportHealth): string {
  const displayName = importStatus.display_name.trim() || "Local folder";
  return [
    `${displayName}: ${importStatus.processed_file_count}/${importStatus.discovered_file_count} files`,
    `${importStatus.imported_image_count} imported`,
    `${importStatus.skipped_file_count} skipped`,
  ].join(", ");
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
  const rows: StatusRow[] = [
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

  if (apiHealth.local_folder_import !== undefined) {
    rows.push({
      name: "Local folder import",
      state: apiHealth.local_folder_import.status,
      displayState: localFolderImportDisplayState(apiHealth.local_folder_import.status),
      detail: localFolderImportDetail(apiHealth.local_folder_import),
    });
  }

  return rows;
}
