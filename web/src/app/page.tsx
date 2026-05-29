import { revalidatePath } from "next/cache";

import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Database,
  FolderSearch,
  HardDrive,
  MinusCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
  ServerCog,
} from "lucide-react";

import {
  createOperationalDashboardView,
  type OperationalDashboard,
} from "@/lib/dashboard";
import { createStatusRows } from "@/lib/status";
import type { ApiHealth } from "@/lib/status";

const DEFAULT_UI_PORT = 18660;
const DEFAULT_API_PORT = 18670;
const DEFAULT_CANDIDATE_LIMIT = 100;

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

async function getApiHealth(apiPort: number): Promise<ApiHealth> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    return (await response.json()) as ApiHealth;
  } catch {
    return {
      service: "api",
      status: "error",
      worker: { service: "worker", status: "error" },
    };
  }
}

function emptyDashboard(workerStatus: OperationalDashboard["worker_status"]["status"]): OperationalDashboard {
  return {
    worker_status: {
      service: "worker",
      status: workerStatus,
      active_collect_job_id: null,
    },
    search_sets: [],
    provider_focus: [],
  };
}

async function getDashboard(apiPort: number): Promise<OperationalDashboard | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/dashboard`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as OperationalDashboard;
  } catch {
    return null;
  }
}

async function createSearchSet(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const displayName = String(formData.get("display_name") ?? "");
  const termsText = String(formData.get("terms_text") ?? "");

  await fetch(`http://127.0.0.1:${apiPort}/search-sets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      terms_text: termsText,
    }),
  });

  revalidatePath("/");
}

async function deactivateSearchSetTerm(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = String(formData.get("slug") ?? "");
  const term = String(formData.get("term") ?? "");

  await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/terms/deactivate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ term }),
  });

  revalidatePath("/");
}

async function createMetCandidateRun(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = String(formData.get("slug") ?? "");
  const candidateOffset = Number.parseInt(String(formData.get("candidate_offset") ?? "0"), 10);
  const candidateLimit = Number.parseInt(
    String(formData.get("candidate_limit") ?? `${DEFAULT_CANDIDATE_LIMIT}`),
    10,
  );

  await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/met/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidate_offset: Number.isFinite(candidateOffset) ? candidateOffset : 0,
      candidate_limit: Number.isFinite(candidateLimit)
        ? candidateLimit
        : DEFAULT_CANDIDATE_LIMIT,
    }),
  });

  revalidatePath("/");
}

function statusVariant(state: string): "default" | "destructive" | "secondary" | "outline" {
  if (state === "ok" || state === "running" || state === "completed") {
    return "default";
  }
  if (state === "error") {
    return "destructive";
  }
  if (state === "canceled") {
    return "outline";
  }
  return "secondary";
}

function statusIcon(state: string) {
  if (state === "ok" || state === "completed") {
    return <CircleCheck data-icon="inline-start" />;
  }
  if (state === "error") {
    return <CircleAlert data-icon="inline-start" />;
  }
  return <Activity data-icon="inline-start" />;
}

export default async function Home() {
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const [apiHealth, dashboardResponse] = await Promise.all([
    getApiHealth(apiPort),
    getDashboard(apiPort),
  ]);
  const dashboard = dashboardResponse ?? emptyDashboard(apiHealth.worker.status);
  const dashboardView = createOperationalDashboardView(dashboard);
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });
  const providerCollectionCount = dashboardView.searchSets.reduce(
    (total, searchSet) => total + searchSet.providerCollections.length,
    0,
  );
  const importedImageCount = dashboardView.providerFocus.reduce(
    (total, provider) => total + provider.importedImageCount,
    0,
  );

  return (
    <div className="group/layout relative z-10 flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full bg-background">
        <div className="container-wrapper px-6">
          <div className="flex h-(--header-height) items-center gap-4 **:data-[slot=separator]:h-4!">
            <div className="flex min-w-0 items-center gap-2">
              <FolderSearch className="size-4 shrink-0" />
              <span className="truncate text-sm font-medium">Anacronia</span>
            </div>
            <nav className="hidden items-center gap-0 md:flex">
              <Button size="sm" type="button" variant="ghost">
                Search Sets
              </Button>
              <Button size="sm" type="button" variant="ghost">
                Provider Collections
              </Button>
              <Button size="sm" type="button" variant="ghost">
                Worker
              </Button>
            </nav>
            <div className="ml-auto flex items-center gap-2 md:flex-1 md:justify-end">
              <ThemeSwitch />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="container-wrapper">
          <div className="container flex w-full flex-col gap-6 px-6 py-8 md:py-10">
            <section className="grid gap-4 md:grid-cols-3">
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Worker</CardDescription>
                  <CardTitle>{dashboardView.workerStatus}</CardTitle>
                  <CardAction>
                    <Badge variant={statusVariant(dashboardView.workerStatus)}>
                      {statusIcon(dashboardView.workerStatus)}
                      {dashboardView.workerStatus}
                    </Badge>
                  </CardAction>
                </CardHeader>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Provider Collections</CardDescription>
                  <CardTitle>{providerCollectionCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Imported Image Assets</CardDescription>
                  <CardTitle>{importedImageCount}</CardTitle>
                </CardHeader>
              </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Search Set navigation</CardTitle>
                    <CardDescription>Primary workspace structure</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {dashboardView.searchSets.length === 0 ? (
                      <Empty className="border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Search />
                          </EmptyMedia>
                          <EmptyTitle>No Search Sets</EmptyTitle>
                          <EmptyDescription>
                            Save one to create the first workspace.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      dashboardView.searchSets.map((searchSet) => (
                        <div className="flex flex-col gap-2" key={searchSet.slug}>
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-medium">
                                {searchSet.displayName}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {searchSet.slug}
                              </span>
                            </div>
                            <Badge variant="secondary">
                              {searchSet.activeTerms.length}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {searchSet.providerCollections.length === 0 ? (
                              <Badge variant="outline">No Provider Collection</Badge>
                            ) : (
                              searchSet.providerCollections.map((providerCollection) => (
                                <Badge
                                  key={`${searchSet.slug}-${providerCollection.providerLabel}`}
                                  variant="outline"
                                >
                                  {providerCollection.providerLabel}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <form action={createSearchSet} className="flex flex-col gap-5">
                    <CardHeader>
                      <CardTitle>Create or continue</CardTitle>
                      <CardDescription>Search Set research intent</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="display_name">Display name</FieldLabel>
                          <Input id="display_name" name="display_name" required />
                          <FieldDescription>
                            Reusing a name continues that Search Set.
                          </FieldDescription>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="terms_text">Terms</FieldLabel>
                          <Textarea
                            className="min-h-24 resize-y"
                            id="terms_text"
                            name="terms_text"
                            placeholder="snake, anaconda, serpent"
                            required
                          />
                          <FieldDescription>
                            Commas and new lines both create terms.
                          </FieldDescription>
                        </Field>
                      </FieldGroup>
                    </CardContent>
                    <CardFooter className="justify-end border-t bg-muted/50">
                      <Button type="submit">
                        <Plus data-icon="inline-start" />
                        Save Search Set
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </aside>

              <section className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h1 className="font-heading text-2xl leading-tight font-semibold tracking-normal">
                      Operational Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Search Set-first collect status and Provider Collection controls.
                    </p>
                  </div>
                  <Badge variant="secondary">Met provider first</Badge>
                </div>

                {dashboardView.searchSets.length === 0 ? (
                  <Card>
                    <CardContent className="py-6">
                      <Empty className="border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <FolderSearch />
                          </EmptyMedia>
                          <EmptyTitle>No dashboard data</EmptyTitle>
                          <EmptyDescription>
                            Create a Search Set to begin collecting.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </CardContent>
                  </Card>
                ) : (
                  dashboardView.searchSets.map((searchSet) => (
                    <section className="flex flex-col gap-3" key={searchSet.slug}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-1">
                          <h2 className="truncate text-sm font-medium">
                            {searchSet.displayName}
                          </h2>
                          <p className="truncate text-sm text-muted-foreground">
                            {searchSet.activeTerms.join(", ") || "No active terms"}
                          </p>
                        </div>
                        <form action={createMetCandidateRun}>
                          <input name="slug" type="hidden" value={searchSet.slug} />
                          <input name="candidate_offset" type="hidden" value="0" />
                          <input
                            name="candidate_limit"
                            type="hidden"
                            value={DEFAULT_CANDIDATE_LIMIT}
                          />
                          <Button size="sm" type="submit" variant="outline">
                            <Play data-icon="inline-start" />
                            Collect Met
                          </Button>
                        </form>
                      </div>

                      {searchSet.activeTerms.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {searchSet.activeTerms.map((term) => (
                            <form
                              action={deactivateSearchSetTerm}
                              className="flex items-center gap-1"
                              key={term}
                            >
                              <input name="slug" type="hidden" value={searchSet.slug} />
                              <input name="term" type="hidden" value={term} />
                              <Badge>{term}</Badge>
                              <Button size="xs" type="submit" variant="ghost">
                                <MinusCircle data-icon="inline-start" />
                                Deactivate
                              </Button>
                            </form>
                          ))}
                          {searchSet.inactiveTerms.map((term) => (
                            <Badge key={term} variant="secondary">
                              {term}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {searchSet.providerCollections.length === 0 ? (
                        <Card>
                          <CardContent className="py-6">
                            <Empty className="border">
                              <EmptyHeader>
                                <EmptyMedia variant="icon">
                                  <Database />
                                </EmptyMedia>
                                <EmptyTitle>No Provider Collection</EmptyTitle>
                                <EmptyDescription>
                                  Collect Met candidates to create one under this Search Set.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </CardContent>
                        </Card>
                      ) : (
                        searchSet.providerCollections.map((providerCollection) => (
                          <Card key={`${searchSet.slug}-${providerCollection.providerLabel}`}>
                            <CardHeader>
                              <div className="flex min-w-0 flex-col gap-1">
                                <CardTitle>{providerCollection.providerLabel}</CardTitle>
                                <CardDescription>
                                  {providerCollection.latestRunLabel}
                                </CardDescription>
                              </div>
                              <CardAction>
                                <Badge variant={statusVariant(providerCollection.status)}>
                                  {statusIcon(providerCollection.status)}
                                  {providerCollection.status}
                                </Badge>
                              </CardAction>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                              <Progress value={providerCollection.progressPercent}>
                                <ProgressLabel>Candidate progress</ProgressLabel>
                                <ProgressValue>
                                  {() => providerCollection.progressLabel}
                                </ProgressValue>
                              </Progress>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    Imported Image Assets
                                  </span>
                                  <span className="text-sm font-medium">
                                    {providerCollection.importedImageCount}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    Progress
                                  </span>
                                  <span className="text-sm font-medium">
                                    {providerCollection.progressPercent}%
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    Continue offset
                                  </span>
                                  <span className="text-sm font-medium">
                                    {providerCollection.continueCandidateOffset ?? "none"}
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                            <CardFooter className="justify-end gap-2 border-t bg-muted/50">
                              {providerCollection.continueCandidateOffset === null ? (
                                <Button disabled type="button" variant="outline">
                                  <RotateCcw data-icon="inline-start" />
                                  Continue
                                </Button>
                              ) : (
                                <form action={createMetCandidateRun}>
                                  <input name="slug" type="hidden" value={searchSet.slug} />
                                  <input
                                    name="candidate_offset"
                                    type="hidden"
                                    value={providerCollection.continueCandidateOffset}
                                  />
                                  <input
                                    name="candidate_limit"
                                    type="hidden"
                                    value={DEFAULT_CANDIDATE_LIMIT}
                                  />
                                  <Button type="submit" variant="outline">
                                    <RotateCcw data-icon="inline-start" />
                                    Continue from {providerCollection.continueCandidateOffset}
                                  </Button>
                                </form>
                              )}
                            </CardFooter>
                          </Card>
                        ))
                      )}
                    </section>
                  ))
                )}

                <Separator />

                <section className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <ServerCog className="size-4" />
                    <h2 className="text-sm font-medium">Provider focus</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {dashboardView.providerFocus.length === 0 ? (
                      <Card size="sm">
                        <CardHeader>
                          <CardTitle>No provider data</CardTitle>
                          <CardDescription>
                            Provider Collections appear after candidate discovery.
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    ) : (
                      dashboardView.providerFocus.map((provider) => (
                        <Card key={provider.providerLabel} size="sm">
                          <CardHeader>
                            <CardDescription>{provider.providerLabel}</CardDescription>
                            <CardTitle>
                              {provider.importedImageCount} imported images
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              {provider.searchSetCount} Search Set
                              {provider.searchSetCount === 1 ? "" : "s"}
                            </p>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </section>

                <section className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="size-4" />
                    <h2 className="text-sm font-medium">Local runtime</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {rows.map((row) => (
                      <Card key={row.name} size="sm">
                        <CardHeader>
                          <div className="flex min-w-0 gap-3">
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                              {row.name === "Next.js UI" ? (
                                <Database className="size-4" />
                              ) : row.name === "FastAPI backend" ? (
                                <ServerCog className="size-4" />
                              ) : (
                                <HardDrive className="size-4" />
                              )}
                            </div>
                            <div className="flex min-w-0 flex-col gap-1">
                              <CardTitle className="truncate">{row.name}</CardTitle>
                              <CardDescription className="truncate">
                                {row.detail}
                              </CardDescription>
                            </div>
                          </div>
                          <CardAction>
                            <Badge variant={statusVariant(row.state)}>
                              {statusIcon(row.state)}
                              {row.state}
                            </Badge>
                          </CardAction>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </section>
              </section>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
