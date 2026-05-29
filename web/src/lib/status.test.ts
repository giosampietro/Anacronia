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
        detail: "Listening on localhost:18660",
      },
      {
        name: "FastAPI backend",
        state: "ok",
        detail: "Reachable on localhost:18670",
      },
      {
        name: "Python worker",
        state: "idle",
        detail: "Ready for collect jobs",
      },
    ]);
  });
});
