import { describe, expect, it } from "vitest";

import {
  createAnalysisStudioHref,
  parseAnalysisStudioUrlState,
  resolveAnalysisStudioUrlState,
} from "@/lib/analysis-studio-url";

describe("Analysis Studio URL state", () => {
  it("creates canonical hrefs for overview, new analysis, selected analysis, selected result, and selected job", () => {
    expect(createAnalysisStudioHref({ state: "overview" })).toBe(
      "/analysis-results",
    );
    expect(createAnalysisStudioHref({ state: "new-analysis" })).toBe(
      "/analysis-results?mode=new-analysis",
    );
    expect(
      createAnalysisStudioHref({
        analysisId: "analysis-1",
        state: "selected-analysis",
      }),
    ).toBe("/analysis-results?analysisId=analysis-1");
    expect(
      createAnalysisStudioHref({
        analysisResultId: "analysis-result-1",
        state: "selected-result",
      }),
    ).toBe("/analysis-results?analysisResultId=analysis-result-1");
    expect(
      createAnalysisStudioHref({
        analysisJobId: "analysis-job-1",
        state: "selected-job",
      }),
    ).toBe("/analysis-results?analysisJobId=analysis-job-1");
  });

  it("gives selected analyses precedence over selected results, selected jobs, and mode", () => {
    expect(
      parseAnalysisStudioUrlState({
        analysisJobId: "analysis-job-1",
        analysisId: "analysis-1",
        analysisResultId: "analysis-result-1",
        mode: "new-analysis",
      }),
    ).toEqual({
      analysisId: "analysis-1",
      state: "selected-analysis",
    });
  });

  it("resolves missing selected analysis, selected result, and selected job states explicitly", () => {
    expect(
      resolveAnalysisStudioUrlState(
        { analysisId: "missing-analysis", state: "selected-analysis" },
        {
          analysisIds: ["analysis-1"],
          analysisJobIds: ["analysis-job-1"],
          analysisResultIds: ["analysis-result-1"],
        },
      ),
    ).toEqual({
      analysisId: "missing-analysis",
      state: "missing-analysis",
    });
    expect(
      resolveAnalysisStudioUrlState(
        { analysisResultId: "missing-result", state: "selected-result" },
        {
          analysisIds: ["analysis-1"],
          analysisJobIds: ["analysis-job-1"],
          analysisResultIds: ["analysis-result-1"],
        },
      ),
    ).toEqual({
      analysisResultId: "missing-result",
      state: "missing-result",
    });
    expect(
      resolveAnalysisStudioUrlState(
        { analysisJobId: "missing-job", state: "selected-job" },
        {
          analysisIds: ["analysis-1"],
          analysisJobIds: ["analysis-job-1"],
          analysisResultIds: ["analysis-result-1"],
        },
      ),
    ).toEqual({
      analysisJobId: "missing-job",
      state: "missing-job",
    });
  });
});
