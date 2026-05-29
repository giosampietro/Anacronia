import { describe, expect, it } from "vitest";

import { createOperationalDashboardView } from "./dashboard";

describe("createOperationalDashboardView", () => {
  it("organizes Search Sets with Provider Collections, progress, and continuation", () => {
    const view = createOperationalDashboardView({
      worker_status: {
        service: "worker",
        status: "paused",
        active_collect_job_id: 4,
      },
      search_sets: [
        {
          display_name: "Snake Studies",
          slug: "snake-studies",
          terms: [
            { term: "snake", active: true },
            { term: "cobra", active: false },
          ],
          provider_collections: [
            {
              provider: "met",
              latest_run_id: 7,
              collect_status: "canceled",
              candidate_offset: 10,
              candidate_limit: 20,
              candidate_progress_processed: 8,
              candidate_progress_total: 20,
              imported_image_count: 5,
              continue_candidate_offset: 18,
            },
          ],
        },
      ],
      provider_focus: [
        {
          provider: "met",
          search_set_count: 1,
          imported_image_count: 5,
        },
      ],
    });

    expect(view).toEqual({
      workerStatus: "paused",
      searchSets: [
        {
          displayName: "Snake Studies",
          slug: "snake-studies",
          activeTerms: ["snake"],
          inactiveTerms: ["cobra"],
          providerCollections: [
            {
              providerLabel: "Met",
              status: "canceled",
              progressLabel: "8/20 candidates",
              progressPercent: 40,
              importedImageCount: 5,
              continueCandidateOffset: 18,
              latestRunLabel: "Run 7",
            },
          ],
        },
      ],
      providerFocus: [
        {
          providerLabel: "Met",
          searchSetCount: 1,
          importedImageCount: 5,
        },
      ],
    });
  });
});
