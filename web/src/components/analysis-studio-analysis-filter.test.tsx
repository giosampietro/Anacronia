import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalysisStudioAnalysisFilter } from "@/components/analysis-studio-analysis-filter";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { AnalysisStudioAnalysisSummary } from "@/lib/analysis-studio-read-model";

const breadAnalysis: AnalysisStudioAnalysisSummary = {
  analysisId: "analysis-bread",
  analysisJobIds: ["analysis-job-bread"],
  recipeIds: ["dinov3_vits_384"],
  sourceCollections: [{ label: "Bread", slug: "bread" }],
  status: "ready",
  title: "Bread visual study",
  variants: [
    {
      analysisResultId: "analysis-result-bread",
      explorerHref: "/latent-map?analysisResultId=analysis-result-bread",
      status: "ready",
    },
  ],
};

const comparisonAnalysis: AnalysisStudioAnalysisSummary = {
  analysisId: "analysis-comparison",
  analysisJobIds: ["analysis-job-comparison"],
  recipeIds: ["dinov3_vits_512"],
  sourceCollections: [
    { label: "Bread", slug: "bread" },
    { label: "Hands/Mani", slug: "hands-mani" },
  ],
  status: "running",
  title: "DINO comparison",
  variants: [],
};

function renderFilter({
  activeAnalysisId = null,
  analyses = [breadAnalysis, comparisonAnalysis],
  initialFilterText = "",
}: {
  activeAnalysisId?: string | null;
  analyses?: AnalysisStudioAnalysisSummary[];
  initialFilterText?: string;
} = {}) {
  return renderToString(
    <SidebarProvider>
      <AnalysisStudioAnalysisFilter
        activeAnalysisId={activeAnalysisId}
        analyses={analyses}
        initialFilterText={initialFilterText}
      />
    </SidebarProvider>,
  );
}

describe("AnalysisStudioAnalysisFilter", () => {
  it("renders empty first-launch copy without creating Jobs or Results groups", () => {
    const html = renderFilter({ analyses: [] });

    expect(html).toContain("New analyses will appear here.");
    expect(html).not.toContain("Analysis Results");
    expect(html).not.toContain("Jobs");
  });

  it("filters Analyses by title or source Collection and expands the active row details", () => {
    const html = renderFilter({
      activeAnalysisId: "analysis-comparison",
      initialFilterText: "hands",
    });

    expect(html).toContain("DINO comparison");
    expect(html).toContain("Bread, Hands/Mani");
    expect(html).toContain("Clear Analysis filter");
    expect(html).toContain("DINO comparison in progress");
    expect(html).not.toContain("Bread visual study");
  });

  it("renders an explicit no-match state for filtered Analyses", () => {
    const html = renderFilter({ initialFilterText: "zzzz" });

    expect(html).toContain("No matching Analyses");
    expect(html).toContain("lucide-search");
    expect(html).not.toContain("New analyses will appear here.");
  });
});
