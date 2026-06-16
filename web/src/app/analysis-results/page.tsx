import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";

import { AddAnalysisVariantForm } from "@/components/add-analysis-variant-form";
import { AnalysisJobAutoRefresh } from "@/components/analysis-job-auto-refresh";
import { AnalysisStudioAnalysisFilter } from "@/components/analysis-studio-analysis-filter";
import { AppSpaceShell } from "@/components/app-space-shell";
import { NewAnalysisForm } from "@/components/new-analysis-form";
import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { shouldAutoRefreshAnalysisJobs } from "@/lib/analysis-job-refresh";
import {
  loadAnalysisStudioReadModel,
  type AnalysisStudioAnalysisSummary,
  type AnalysisStudioJobStageSummary,
  type AnalysisStudioJobSummary,
  type AnalysisStudioReadModel,
} from "@/lib/analysis-studio-read-model";
import type { AnalysisStudioSearchParams } from "@/lib/analysis-studio-url";
import { createAnalysisStudioHref } from "@/lib/analysis-studio-url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis Studio | Anacronia",
};

const DEFAULT_API_PORT = 18670;

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : DEFAULT_API_PORT;
}

function analysisApiUrl(path: string): string {
  return `http://127.0.0.1:${getApiPort()}${path}`;
}

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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Unavailable";
  }
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1000000) {
    return `${(bytes / 1000).toFixed(bytes < 10000 ? 1 : 0)} KB`;
  }
  return `${(bytes / 1000000).toFixed(bytes < 10000000 ? 1 : 0)} MB`;
}

function collectionNames(analysis: AnalysisStudioAnalysisSummary): string {
  const names = analysis.sourceCollections.map((collection) => collection.label);
  return names.length > 0 ? names.join(", ") : "No source Collections";
}

function analysisStatusLabel(status: string): string {
  if (status === "running") {
    return "Running Analysis";
  }
  if (status === "failed") {
    return "Failed Analysis";
  }
  if (status === "partial") {
    return "Partial Analysis";
  }
  if (status === "ready") {
    return "Ready";
  }
  return "Pending Analysis";
}

function selectedAnalysisActivityStatus(
  analysisStatus: string,
  variantRows: Array<{ canOpenExplorer: boolean; status: string }>,
): string {
  if (variantRows.some((row) => shouldAutoRefreshAnalysisJobs([row.status]))) {
    return "running";
  }
  const hasFailedVariant = variantRows.some((row) => row.status === "failed");
  const hasReadyExplorer = variantRows.some(
    (row) => row.status === "ready" && row.canOpenExplorer,
  );
  if (hasFailedVariant && hasReadyExplorer) {
    return "partial";
  }
  if (hasFailedVariant) {
    return "failed";
  }
  return analysisStatus;
}

function humanizeStageName(stageName: string | undefined): string {
  return stageName ? stageName.replaceAll("_", " ") : "stage unavailable";
}

function compactStageError(error: string): string {
  const summary = error.split(":")[0]?.trim();
  if (summary) {
    return summary;
  }
  return error.length > 90 ? `${error.slice(0, 87)}...` : error;
}

function recipeLabelById(model: AnalysisStudioReadModel): Map<string, string> {
  return new Map(
    model.recipes.map((recipe) => [recipe.recipeId, recipe.label]),
  );
}

function selectedAnalysisJobs(
  analysis: AnalysisStudioAnalysisSummary,
  model: AnalysisStudioReadModel,
): AnalysisStudioJobSummary[] {
  return model.jobs.filter((job) =>
    analysis.analysisJobIds.includes(job.analysisJobId),
  );
}

function selectedAnalysisReadyRecipeIds(
  analysis: AnalysisStudioAnalysisSummary,
  model: AnalysisStudioReadModel,
): string[] {
  const resultsById = new Map(
    model.results.map((result) => [result.analysisResultId, result]),
  );
  const recipeIds = new Set<string>();
  for (const variant of analysis.variants) {
    const result = resultsById.get(variant.analysisResultId);
    if (result?.state !== "ready" || result.canOpenExplorer !== true) {
      continue;
    }
    for (const recipeId of result.recipeIds) {
      recipeIds.add(recipeId);
    }
  }
  return [...recipeIds];
}

function jobStageLines(jobs: AnalysisStudioJobSummary[]): string[] {
  return jobs.flatMap((job) => {
    const activeStage =
      job.stages.find((stage) => stage.status === "running") ??
      job.stages.find((stage) => stage.status === "failed") ??
      job.stages.at(-1);
    if (!activeStage) {
      return [`${humanizeStageName(job.status)} · ${job.analysisJobId}`];
    }
    const recipeIndex = activeStage.recipeId
      ? job.recipeIds.indexOf(activeStage.recipeId)
      : -1;
    const recipeLabel =
      recipeIndex >= 0
        ? job.recipeLabels[recipeIndex] ?? activeStage.recipeId
        : activeStage.recipeId;
    const parts = [
      humanizeStageName(job.status),
      humanizeStageName(activeStage.stageName),
      recipeLabel,
    ].filter(Boolean);
    if (activeStage.error) {
      parts.push(compactStageError(activeStage.error));
    }
    return [parts.join(" · ")];
  });
}

function formatEmbeddingCounts(
  counts: AnalysisStudioJobStageSummary["outputCounts"] | undefined,
  missingLabel: string,
): string {
  if (!counts) {
    return "Unavailable";
  }
  return `${counts.reusableEmbeddings} cached · ${counts.missingEmbeddings} ${missingLabel}`;
}

function plannedEmbeddingCounts(
  job: AnalysisStudioJobSummary,
  counts: AnalysisStudioJobStageSummary["outputCounts"] | undefined,
): AnalysisStudioJobStageSummary["outputCounts"] | undefined {
  if (!counts) {
    return undefined;
  }
  if (job.recipeIds.length <= 1) {
    return counts;
  }
  const plannedEmbeddingTotal = job.scopeItemCount * job.recipeIds.length;
  if (job.scopeItemCount <= 0 || plannedEmbeddingTotal <= 0) {
    return undefined;
  }
  if (
    counts.reusableEmbeddings === 0 &&
    counts.missingEmbeddings === plannedEmbeddingTotal
  ) {
    return {
      missingEmbeddings: job.scopeItemCount,
      reusableEmbeddings: 0,
    };
  }
  if (
    counts.missingEmbeddings === 0 &&
    counts.reusableEmbeddings === plannedEmbeddingTotal
  ) {
    return {
      missingEmbeddings: 0,
      reusableEmbeddings: job.scopeItemCount,
    };
  }
  return undefined;
}

function selectedAnalysisVariantRows(
  analysis: AnalysisStudioAnalysisSummary,
  model: AnalysisStudioReadModel,
) {
  const resultsById = new Map(
    model.results.map((result) => [result.analysisResultId, result]),
  );
  const jobsById = new Map(model.jobs.map((job) => [job.analysisJobId, job]));
  const recipesById = recipeLabelById(model);

  const rows = analysis.variants.map((variant, index) => {
    const result = resultsById.get(variant.analysisResultId);
    const embeddingStage = result
      ? jobsById
          .get(result.analysisJobId)
          ?.stages.find(
            (stage) =>
              stage.stageName === "embedding_planning" && stage.outputCounts,
          )
      : undefined;
    const embeddingCounts = embeddingStage?.outputCounts;
    const recipeLabels = result?.recipeLabels.length
      ? result.recipeLabels
      : analysis.recipeIds.map((recipeId) => recipesById.get(recipeId) ?? recipeId);
    const explorerHref =
      result?.canOpenExplorer === true
        ? result.explorerHref
        : variant.status === "ready"
          ? variant.explorerHref
          : undefined;

    return {
      analysisResultId: variant.analysisResultId,
      canOpenExplorer: Boolean(explorerHref),
      explorerHref,
      imageCount: result?.itemCount ?? 0,
      label: `Variant ${index + 1}`,
      recipeLabel: recipeLabels.join(", ") || "Recipe unavailable",
      embeddingCache: embeddingCounts
        ? formatEmbeddingCounts(embeddingCounts, "computed")
        : "Unavailable",
      status: variant.status,
      variantStorage: formatBytes(result?.storageTotals.totalBytes ?? 0),
    };
  });

  const representedResultIds = new Set(
    analysis.variants.map((variant) => variant.analysisResultId),
  );
  const plannedRows = selectedAnalysisJobs(analysis, model).flatMap((job) => {
    const jobResultRecipeIds = new Set(
      job.analysisResultIds.flatMap((resultId) => {
        const result = resultsById.get(resultId);
        return result?.recipeIds ?? [];
      }),
    );
    if (!["queued", "running", "stopping", "failed", "partial_failed"].includes(job.status)) {
      return [];
    }

    return job.recipeIds
      .filter((recipeId) => !jobResultRecipeIds.has(recipeId))
      .map((recipeId, recipeIndex) => {
        const stageForRecipe =
          job.stages.find((stage) => stage.recipeId === recipeId) ??
          job.stages.find((stage) => stage.outputCounts);
        const embeddingStage = job.stages.find(
          (stage) => stage.stageName === "embedding_planning" && stage.outputCounts,
        );
        const status =
          stageForRecipe?.status ??
          (job.status === "partial_failed" ? "failed" : job.status);
        return {
          analysisResultId: `planned-${job.analysisJobId}-${recipeId}-${recipeIndex}`,
          canOpenExplorer: false,
          explorerHref: undefined,
          imageCount: job.scopeItemCount,
          label: `Variant ${rows.length + recipeIndex + 1}`,
          recipeLabel: recipesById.get(recipeId) ?? recipeId,
          embeddingCache: formatEmbeddingCounts(
            stageForRecipe?.outputCounts ??
              plannedEmbeddingCounts(job, embeddingStage?.outputCounts),
            "needed",
          ),
          status,
          variantStorage: "Unavailable",
        };
      });
  });

  for (const row of plannedRows) {
    if (representedResultIds.has(row.analysisResultId)) {
      continue;
    }
    rows.push(row);
    representedResultIds.add(row.analysisResultId);
  }

  return rows.map((row, index) => ({
    ...row,
    label: `Variant ${index + 1}`,
  }));
}

function jobActivityText(jobs: AnalysisStudioJobSummary[]): string {
  if (jobs.length === 0) {
    return "No jobs yet.";
  }
  if (jobs.length > 1) {
    return formatCount(jobs.length, "job");
  }
  return jobs.map((job) => job.analysisJobId).join(", ");
}

function variantEmptyText(
  analysis: AnalysisStudioAnalysisSummary,
  jobs: AnalysisStudioJobSummary[],
): string {
  if (analysis.status === "running") {
    return "Variants will appear when this job produces Results.";
  }
  if (analysis.status === "failed") {
    return "No Variants were produced.";
  }
  if (jobs.length === 0) {
    return "No job has been started for this Analysis.";
  }
  return "No Variants available yet.";
}

function activeAnalysisId(model: AnalysisStudioReadModel): string | null {
  return model.selectedState.state === "selected-analysis"
    ? model.selectedState.analysisId
    : null;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim())
    .filter((value, index, values) => value !== "" && values.indexOf(value) === index);
}

export async function createAnalysisAction(formData: FormData) {
  "use server";

  const response = await fetch(analysisApiUrl("/analyses"), {
    body: JSON.stringify({
      collection_slugs: formStringList(formData, "collection_slugs"),
      recipe_ids: formStringList(formData, "recipe_ids"),
      start_job: true,
      title: formString(formData, "title"),
    }),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response
    .json()
    .catch((): Record<string, unknown> => ({}))) as {
    analysis?: { analysis_id?: unknown };
    detail?: unknown;
  };
  const analysisId =
    typeof payload.analysis?.analysis_id === "string"
      ? payload.analysis.analysis_id
      : "";

  if (!response.ok || !analysisId) {
    const searchParams = new URLSearchParams({ mode: "new-analysis" });
    if (typeof payload.detail === "string" && payload.detail.trim() !== "") {
      searchParams.set("analysisError", payload.detail);
    }
    redirect(`/analysis-results?${searchParams}`);
  }

  redirect(createAnalysisStudioHref({ analysisId, state: "selected-analysis" }));
}

export async function createAnalysisVariantAction(formData: FormData) {
  "use server";

  const analysisId = formString(formData, "analysis_id");
  const response = await fetch(
    analysisApiUrl(`/analyses/${encodeURIComponent(analysisId)}/variants`),
    {
      body: JSON.stringify({
        recipe_ids: formStringList(formData, "recipe_ids"),
      }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const payload = (await response
    .json()
    .catch((): Record<string, unknown> => ({}))) as {
    analysis?: { analysis_id?: unknown };
    detail?: unknown;
  };
  const redirectedAnalysisId =
    typeof payload.analysis?.analysis_id === "string"
      ? payload.analysis.analysis_id
      : analysisId;

  if (!response.ok || !redirectedAnalysisId) {
    const searchParams = new URLSearchParams({ analysisId });
    if (typeof payload.detail === "string" && payload.detail.trim() !== "") {
      searchParams.set("variantError", payload.detail);
    }
    redirect(`/analysis-results?${searchParams}`);
  }

  redirect(
    createAnalysisStudioHref({
      analysisId: redirectedAnalysisId,
      state: "selected-analysis",
    }),
  );
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

function NewAnalysisPanel({ model }: { model: AnalysisStudioReadModel }) {
  return (
    <section aria-label="New Analysis">
      <NewAnalysisForm
        action={createAnalysisAction}
        collections={model.collections}
        recipes={model.recipes}
      />
    </section>
  );
}

function SelectedAnalysisOverview({
  analysis,
  model,
}: {
  analysis: AnalysisStudioAnalysisSummary;
  model: AnalysisStudioReadModel;
}) {
  const jobs = selectedAnalysisJobs(analysis, model);
  const variantRows = selectedAnalysisVariantRows(analysis, model);
  const stageLines = jobStageLines(jobs);
  const activityStatus = selectedAnalysisActivityStatus(
    analysis.status,
    variantRows,
  );

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
            <Badge variant={activityStatus === "failed" ? "destructive" : "outline"}>
              {analysisStatusLabel(activityStatus)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatCount(variantRows.length, "variant")}
            </span>
          </div>
          {jobs.length > 0 ? (
            <div className="space-y-1">
              <p className="font-mono text-xs text-muted-foreground">
                {jobActivityText(jobs)}
              </p>
              {stageLines.map((line) => (
                <p className="text-sm text-muted-foreground" key={line}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="min-w-0 lg:col-span-2">
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <div data-slot="card-action">
            <AddAnalysisVariantForm
              action={createAnalysisVariantAction}
              analysisId={analysis.analysisId}
              disabledRecipeIds={selectedAnalysisReadyRecipeIds(analysis, model)}
              recipes={model.recipes}
              sourceCollections={analysis.sourceCollections}
            />
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          {variantRows.length > 0 ? (
            <Table className="min-w-[44rem] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 px-1.5">Variant</TableHead>
                  <TableHead className="h-8 px-1.5">Status</TableHead>
                  <TableHead className="h-8 px-1.5">Recipe</TableHead>
                  <TableHead className="h-8 px-1.5">Images</TableHead>
                  <TableHead className="h-8 px-1.5">Embedding cache</TableHead>
                  <TableHead className="h-8 px-1.5">Storage</TableHead>
                  <TableHead className="h-8 px-1.5 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variantRows.map((row) => (
                  <TableRow key={row.analysisResultId}>
                    <TableCell className="px-1.5 py-2 font-medium">
                      {row.label}
                    </TableCell>
                    <TableCell className="px-1.5 py-2">
                      <Badge
                        variant={
                          row.status === "failed" ? "destructive" : "outline"
                        }
                      >
                        {shouldAutoRefreshAnalysisJobs([row.status]) ? (
                          <Spinner className="size-3" data-icon="inline-start" />
                        ) : null}
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="max-w-36 px-1.5 py-2 text-muted-foreground"
                      title={row.recipeLabel}
                    >
                      <span className="block truncate">{row.recipeLabel}</span>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 text-muted-foreground">
                      {formatCount(row.imageCount, "image")}
                    </TableCell>
                    <TableCell
                      className="max-w-36 px-1.5 py-2 text-muted-foreground"
                      title={row.embeddingCache}
                    >
                      <span className="block truncate">{row.embeddingCache}</span>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 text-muted-foreground">
                      {row.variantStorage}
                    </TableCell>
                    <TableCell className="px-1.5 py-2 text-right">
                      {row.canOpenExplorer && row.explorerHref ? (
                        <Link
                          className={buttonVariants({
                            size: "xs",
                            variant: "outline",
                          })}
                          href={row.explorerHref}
                        >
                          <ExternalLink data-icon="inline-start" />
                          Open Explorer
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Unavailable
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {variantEmptyText(analysis, jobs)}
            </p>
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
    return <NewAnalysisPanel model={model} />;
  }

  if (model.selectedState.state === "selected-analysis" && model.selectedAnalysis) {
    return (
      <SelectedAnalysisOverview
        analysis={model.selectedAnalysis}
        model={model}
      />
    );
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
