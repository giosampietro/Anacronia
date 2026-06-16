"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderClosed, FolderOpen, ListFilter, Search, X } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AnalysisStudioAnalysisSummary } from "@/lib/analysis-studio-read-model";
import { createAnalysisStudioHref } from "@/lib/analysis-studio-read-model";
import { cn } from "@/lib/utils";

type AnalysisStudioAnalysisFilterProps = {
  activeAnalysisId: string | null;
  analyses: AnalysisStudioAnalysisSummary[];
  initialFilterText: string;
};

function isAnalysisRunning(analysis: AnalysisStudioAnalysisSummary): boolean {
  return ["queued", "running", "stopping"].includes(analysis.status);
}

function sourceCollectionLabel(analysis: AnalysisStudioAnalysisSummary): string {
  const labels = analysis.sourceCollections.map((collection) => collection.label);
  return labels.length > 0 ? labels.join(", ") : "No source Collections";
}

function filterAnalyses(
  analyses: AnalysisStudioAnalysisSummary[],
  filterText: string,
): AnalysisStudioAnalysisSummary[] {
  const normalizedFilter = filterText.trim().toLowerCase();

  if (normalizedFilter === "") {
    return analyses;
  }

  return analyses.filter((analysis) =>
    [
      analysis.title,
      analysis.analysisId,
      analysis.status,
      ...analysis.sourceCollections.flatMap((collection) => [
        collection.label,
        collection.slug,
      ]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedFilter),
  );
}

export function AnalysisStudioAnalysisFilter({
  activeAnalysisId,
  analyses,
  initialFilterText,
}: AnalysisStudioAnalysisFilterProps) {
  const [filterText, setFilterText] = useState(initialFilterText);
  const [openedAnalysisId, setOpenedAnalysisId] = useState<string | null>(
    activeAnalysisId,
  );
  const filteredAnalyses = useMemo(
    () => filterAnalyses(analyses, filterText),
    [analyses, filterText],
  );

  return (
    <>
      <div className="relative group-data-[collapsible=icon]:hidden">
        <ListFilter className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
        <SidebarInput
          aria-label="Filter Analyses"
          className="pl-8 pr-8"
          onChange={(event) => setFilterText(event.currentTarget.value)}
          placeholder="Filter by title or collection"
          value={filterText}
        />
        {filterText !== "" ? (
          <button
            aria-label="Clear Analysis filter"
            className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
            onClick={() => setFilterText("")}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <SidebarMenu className="mt-3 gap-0.5">
        {filteredAnalyses.length === 0 ? (
          <Empty className="border group-data-[collapsible=icon]:hidden">
            <EmptyHeader>
              {analyses.length === 0 && filterText.trim() === "" ? null : (
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
              )}
              <EmptyTitle>
                {analyses.length === 0 && filterText.trim() === ""
                  ? "New analyses will appear here."
                  : "No matching Analyses"}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          filteredAnalyses.map((analysis) => {
            const analysisHref = createAnalysisStudioHref({
              analysisId: analysis.analysisId,
              state: "selected-analysis",
            });
            const isActive = analysis.analysisId === activeAnalysisId;
            const isOpen = openedAnalysisId === analysis.analysisId;
            const running = isAnalysisRunning(analysis);
            const analyzedImageCount = analysis.analyzedImageCount;
            const analyzedImageLabel = `${analyzedImageCount} ${
              analyzedImageCount === 1 ? "image" : "images"
            } analyzed`;

            return (
              <SidebarMenuItem key={analysis.analysisId}>
                <SidebarMenuButton
                  aria-expanded={isOpen}
                  className={cn(
                    "h-8 gap-2 rounded-md px-2 text-[13px] font-normal group-data-[collapsible=icon]:justify-center",
                    isOpen && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  isActive={isActive}
                  onClick={() => setOpenedAnalysisId(analysis.analysisId)}
                  render={<Link href={analysisHref} />}
                  tooltip={analysis.title}
                >
                  {isOpen ? (
                    <FolderOpen className="text-sidebar-foreground/75" />
                  ) : (
                    <FolderClosed className="text-sidebar-foreground/65" />
                  )}
                  <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                    {analysis.title}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] font-normal tabular-nums text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                    {running ? (
                      <Spinner
                        aria-label={`${analysis.title} in progress`}
                        className="size-3"
                      />
                    ) : null}
                    <span
                      aria-label={analyzedImageLabel}
                      title={analyzedImageLabel}
                    >
                      {analyzedImageCount}
                    </span>
                  </span>
                </SidebarMenuButton>
                {isOpen ? (
                  <p className="ml-8 mr-2 pb-1 pr-2 text-xs leading-5 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                    {sourceCollectionLabel(analysis)}
                  </p>
                ) : null}
              </SidebarMenuItem>
            );
          })
        )}
      </SidebarMenu>
    </>
  );
}
