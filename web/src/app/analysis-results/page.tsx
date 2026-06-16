import type { CSSProperties } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { AnalysisJobAutoRefresh } from "@/components/analysis-job-auto-refresh";
import { AnalysisStudioAnalysisFilter } from "@/components/analysis-studio-analysis-filter";
import { AppSpaceShell } from "@/components/app-space-shell";
import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { shouldAutoRefreshAnalysisJobs } from "@/lib/analysis-job-refresh";
import {
  loadAnalysisStudioReadModel,
  type AnalysisStudioAnalysisSummary,
  type AnalysisStudioReadModel,
} from "@/lib/analysis-studio-read-model";
import type { AnalysisStudioSearchParams } from "@/lib/analysis-studio-url";
import { createAnalysisStudioHref } from "@/lib/analysis-studio-url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis Studio | Anacronia",
};

function getSearchParam(
  searchParams: AnalysisStudioSearchParams,
  key: string,
): string {
  const value = searchParams[key];
  const firstValue = Array.isArray(value) ? value[0] : value;
  return typeof firstValue === "string" ? firstValue.trim() : "";
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function collectionNames(analysis: AnalysisStudioAnalysisSummary): string {
  const names = analysis.sourceCollections.map((collection) => collection.label);
  return names.length > 0 ? names.join(", ") : "No source Collections";
}

function variantCount(analysis: AnalysisStudioAnalysisSummary): string {
  return formatCount(analysis.variants.length, "variant");
}

function activeAnalysisId(model: AnalysisStudioReadModel): string | null {
  return model.selectedState.state === "selected-analysis"
    ? model.selectedState.analysisId
    : null;
}

function AnalysisStudioSidebar({
  analysisFilterText,
  model,
}: {
  analysisFilterText: string;
  model: AnalysisStudioReadModel;
}) {
  const selectedAnalysisId = activeAnalysisId(model);

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <div className="flex h-12 min-w-0 items-center gap-3 rounded-xl px-2 group-data-[collapsible=icon]:hidden">
          <span className="truncate text-lg font-semibold">Analysis Studio</span>
          <div className="ml-auto shrink-0">
            <ThemeSwitch />
          </div>
        </div>
        <SidebarMenu className="gap-3">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={model.selectedState.state === "new-analysis"}
              render={<Link href={createAnalysisStudioHref({ state: "new-analysis" })} />}
              tooltip="New Analysis"
            >
              <Plus />
              <span className="group-data-[collapsible=icon]:hidden">
                New Analysis
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Analyses</SidebarGroupLabel>
          <SidebarGroupContent>
            <AnalysisStudioAnalysisFilter
              activeAnalysisId={selectedAnalysisId}
              analyses={model.analyses}
              initialFilterText={analysisFilterText}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function AnalysisOverview({ model }: { model: AnalysisStudioReadModel }) {
  return (
    <section
      aria-label="Analysis Studio overview"
      className="grid gap-4 md:grid-cols-3"
    >
      <Card size="sm">
        <CardHeader>
          <CardTitle>Analyses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{model.analyses.length}</p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Ready variants</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">
            {model.analyses.reduce(
              (total, analysis) => total + analysis.variants.length,
              0,
            )}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {model.activeJob ? `${model.activeJob.status} job` : "Idle"}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function NewAnalysisPlaceholder() {
  return (
    <section aria-label="New Analysis">
      <Card>
        <CardHeader>
          <CardTitle>New Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Choose a title, collections, and recipes.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </section>
  );
}

function SelectedAnalysisOverview({
  analysis,
}: {
  analysis: AnalysisStudioAnalysisSummary;
}) {
  return (
    <section
      aria-label="Selected Analysis overview"
      className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]"
    >
      <Card size="sm">
        <CardHeader>
          <CardTitle>Source Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{collectionNames(analysis)}</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Job activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={analysis.status === "failed" ? "destructive" : "outline"}>
              {analysis.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {variantCount(analysis)}
            </span>
          </div>
          {analysis.analysisJobIds.length > 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              {analysis.analysisJobIds.join(", ")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function MissingAnalysis({ analysisId }: { analysisId: string }) {
  return (
    <section aria-label="Missing Analysis">
      <Card>
        <CardHeader>
          <CardTitle>Analysis not found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-muted-foreground">{analysisId}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function AnalysisStudioMainPanel({ model }: { model: AnalysisStudioReadModel }) {
  if (model.selectedState.state === "new-analysis") {
    return <NewAnalysisPlaceholder />;
  }

  if (model.selectedState.state === "selected-analysis" && model.selectedAnalysis) {
    return <SelectedAnalysisOverview analysis={model.selectedAnalysis} />;
  }

  if (model.selectedState.state === "missing-analysis") {
    return <MissingAnalysis analysisId={model.selectedState.analysisId} />;
  }

  return <AnalysisOverview model={model} />;
}

export default async function AnalysisResultsPage({
  searchParams,
}: {
  searchParams?: Promise<AnalysisStudioSearchParams> | AnalysisStudioSearchParams;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const model = await loadAnalysisStudioReadModel({
    searchParams: resolvedSearchParams,
  });
  const activeJobs = model.jobs.filter((job) =>
    shouldAutoRefreshAnalysisJobs([job.status]),
  );
  const sidebarStyle = {
    "--sidebar-width": "21rem",
    "--sidebar-width-mobile": "20rem",
  } as CSSProperties;

  return (
    <AppSpaceShell activeSpace="analysis" contentClassName="min-w-0">
      <SidebarProvider defaultOpen style={sidebarStyle}>
        <AnalysisStudioSidebar
          analysisFilterText={getSearchParam(resolvedSearchParams, "analysis_filter")}
          model={model}
        />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-40 flex min-h-12 shrink-0 items-center gap-1 border-b bg-background px-3 py-3">
            <div
              aria-label="Workspace"
              className="flex shrink-0 items-center gap-3"
            >
              <SidebarTrigger className="-ml-1" />
            </div>
          </header>
          <main className="min-h-[calc(100svh-3rem)] px-6 py-6">
            <AnalysisJobAutoRefresh enabled={activeJobs.length > 0} />
            <div className="mx-auto w-full max-w-6xl">
              <AnalysisStudioMainPanel model={model} />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AppSpaceShell>
  );
}
