import { describe, expect, it } from "vitest";

import {
  createAnalysisStudioHref,
  parseAnalysisStudioUrlState,
  resolveAnalysisStudioUrlState,
} from "@/lib/analysis-studio-url";

describe("Analysis Studio URL state", () => {
  it("creates canonical hrefs for overview, new analysis, selected result, and selected job", () => {
    expect(createAnalysisStudioHref({ state: "overview" })).toBe(
      "/analysis-results",
    );
    expect(createAnalysisStudioHref({ state: "new-analysis" })).toBe(
      "/analysis-results?mode=new-analysis",
    );
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

  it("gives selected results precedence over selected jobs and mode", () => {
    expect(
      parseAnalysisStudioUrlState({
        analysisJobId: "analysis-job-1",
        analysisResultId: "analysis-result-1",
        mode: "new-analysis",
      }),
    ).toEqual({
      analysisResultId: "analysis-result-1",
      state: "selected-result",
    });
  });

  it("resolves missing selected result and selected job states explicitly", () => {
    expect(
      resolveAnalysisStudioUrlState(
        { analysisResultId: "missing-result", state: "selected-result" },
        {
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
