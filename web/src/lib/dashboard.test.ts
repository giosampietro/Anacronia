import { describe, expect, it } from "vitest";

import { createOperationalDashboardView } from "./dashboard";

describe("createOperationalDashboardView", () => {
  it("organizes Collections with Provider Sources, progress, and continuation", () => {
    const view = createOperationalDashboardView({
      worker_status: {
        service: "worker",
        status: "paused",
        active_collect_job_id: 4,
      },
      search_sets: [
        {
          display_name: "sNaKe STUDIES",
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
              pause_reason: "",
              candidate_offset: 10,
              candidate_limit: 20,
              batch_target: 30,
              candidate_progress_processed: 8,
              candidate_progress_total: 20,
              imported_object_count: 3,
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
      libraryImageCount: 5,
      activeSearchSet: {
        displayName: "Snake Studies",
        slug: "snake-studies",
        activeTerms: ["snake"],
        inactiveTerms: ["cobra"],
        termSummary: "snake",
        isActive: true,
        providerCollections: [
          {
            provider: "met",
            providerLabel: "Met",
            status: "canceled",
            pauseReason: "",
            candidateOffset: 10,
            candidateLimit: 20,
            batchTarget: 30,
            nextCandidateOffset: 18,
            progressLabel: "8/20 candidates",
            progressPercent: 40,
            importedObjectCount: 3,
            importedImageCount: 5,
            continueCandidateOffset: 18,
            latestRunLabel: "Collect 7",
          },
        ],
        importedObjectCount: 3,
        importedImageCount: 5,
      },
      searchSets: [
        {
          displayName: "Snake Studies",
          slug: "snake-studies",
          activeTerms: ["snake"],
          inactiveTerms: ["cobra"],
          termSummary: "snake",
          isActive: true,
          providerCollections: [
            {
              provider: "met",
              providerLabel: "Met",
              status: "canceled",
              pauseReason: "",
              candidateOffset: 10,
              candidateLimit: 20,
              batchTarget: 30,
              nextCandidateOffset: 18,
              progressLabel: "8/20 candidates",
              progressPercent: 40,
              importedObjectCount: 3,
              importedImageCount: 5,
              continueCandidateOffset: 18,
              latestRunLabel: "Collect 7",
            },
          ],
          importedObjectCount: 3,
          importedImageCount: 5,
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

  it("selects the requested Collection for the main workspace", () => {
    const view = createOperationalDashboardView(
      {
        worker_status: {
          service: "worker",
          status: "idle",
          active_collect_job_id: null,
        },
        search_sets: [
          {
            display_name: "Snake Study",
            slug: "snake-study",
            terms: [
              { term: "snake", active: true },
              { term: "serpent", active: true },
            ],
            provider_collections: [
              {
                provider: "met",
                latest_run_id: 1,
                collect_status: "completed",
                pause_reason: "",
                candidate_offset: 0,
                candidate_limit: 100,
                batch_target: 100,
                candidate_progress_processed: 100,
                candidate_progress_total: 100,
                imported_object_count: 18,
                imported_image_count: 24,
                continue_candidate_offset: null,
              },
            ],
          },
          {
            display_name: "Masks",
            slug: "masks",
            terms: [{ term: "mask", active: true }],
            provider_collections: [],
          },
        ],
        provider_focus: [
          {
            provider: "met",
            search_set_count: 1,
            imported_image_count: 24,
          },
        ],
      },
      "masks",
    );

    expect(view.activeSearchSet?.slug).toBe("masks");
    expect(view.searchSets.map((searchSet) => [searchSet.slug, searchSet.isActive])).toEqual([
      ["snake-study", false],
      ["masks", true],
    ]);
  });
});
