import { describe, expect, it } from "vitest";

import { createStatusRows } from "./status";

describe("createStatusRows", () => {
  it("shows the UI, backend, and worker status", () => {
    const rows = createStatusRows({
      uiPort: 18660,
      apiPort: 18670,
      apiHealth: {
        service: "api",
        status: "ok",
        worker: { service: "worker", status: "idle" },
      },
    });

    expect(rows).toEqual([
      {
        name: "Next.js UI",
        state: "ok",
        displayState: "ok",
        detail: "Listening on localhost:18660",
      },
      {
        name: "FastAPI backend",
        state: "ok",
        displayState: "ok",
        detail: "Reachable on localhost:18670",
      },
      {
        name: "Python worker",
        state: "idle",
        displayState: "idle",
        detail: "Ready for searches",
      },
    ]);
  });

  it("labels an active worker as active without changing the raw state", () => {
    const rows = createStatusRows({
      uiPort: 18660,
      apiPort: 18670,
      apiHealth: {
        service: "api",
        status: "ok",
        worker: { service: "worker", status: "running", active_collect_job_id: 1 },
      },
    });

    expect(rows[2]).toEqual({
      name: "Python worker",
      state: "running",
      displayState: "active",
      detail: "Processing",
    });
  });

  it("keeps the worker label active while a search is stopping", () => {
    const rows = createStatusRows({
      uiPort: 18660,
      apiPort: 18670,
      apiHealth: {
        service: "api",
        status: "ok",
        worker: { service: "worker", status: "stopping", active_collect_job_id: 1 },
      },
    });

    expect(rows[2]).toEqual({
      name: "Python worker",
      state: "stopping",
      displayState: "active",
      detail: "Processing",
    });
  });

  it("adds a local folder import row when the API reports active import progress", () => {
    const rows = createStatusRows({
      uiPort: 18660,
      apiPort: 18670,
      apiHealth: {
        service: "api",
        status: "ok",
        worker: { service: "worker", status: "idle" },
        local_folder_import: {
          status: "running",
          display_name: "Studio Folder",
          search_set_slug: "studio-folder",
          folder_path: "/Users/giorgio/Pictures/Studio Folder",
          phase: "importing",
          discovered_file_count: 2900,
          processed_file_count: 300,
          imported_image_count: 280,
          skipped_file_count: 20,
        },
      },
    });

    expect(rows[3]).toEqual({
      name: "Local folder import",
      state: "running",
      displayState: "active",
      detail: "Studio Folder: 300/2900 files, 280 imported, 20 skipped",
    });
  });
});
