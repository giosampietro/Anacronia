import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardDescription,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ThemeSwitch } from "@/components/theme-switch";
import { createSearchSetCards } from "@/lib/search-sets";
import type { SearchSet } from "@/lib/search-sets";
import { createStatusRows } from "@/lib/status";
import type { ApiHealth } from "@/lib/status";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Database,
  FolderSearch,
  HardDrive,
  MinusCircle,
  Plus,
  Search,
  ServerCog,
} from "lucide-react";

const DEFAULT_UI_PORT = 18660;
const DEFAULT_API_PORT = 18670;

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

async function getSearchSets(apiPort: number): Promise<SearchSet[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as SearchSet[];
  } catch {
    return [];
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

function statusVariant(state: string): "default" | "destructive" | "secondary" {
  if (state === "ok") {
    return "default";
  }
  if (state === "error") {
    return "destructive";
  }
  return "secondary";
}

function statusIcon(state: string) {
  if (state === "ok") {
    return <CircleCheck className="size-4 text-foreground" />;
  }
  if (state === "error") {
    return <CircleAlert className="size-4 text-destructive" />;
  }
  return <Activity className="size-4 text-muted-foreground" />;
}

export default async function Home() {
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const [apiHealth, searchSets] = await Promise.all([getApiHealth(apiPort), getSearchSets(apiPort)]);
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });
  const searchSetCards = createSearchSetCards(searchSets);

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
                Met provider
              </Button>
              <Button size="sm" type="button" variant="ghost">
                Local data
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
          <div className="container flex w-full flex-col gap-8 px-6 py-8 md:py-16 lg:py-20">
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Met public-domain material</Badge>
                <Badge variant="secondary">Apple Silicon runtime</Badge>
              </div>
              <div className="flex flex-col gap-3">
                <h1 className="font-heading text-4xl leading-tight font-semibold tracking-normal sm:text-5xl">
                  Search Sets
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground md:text-xl">
                  Local-first collection workspace for Met public-domain material.
                </p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
              <Card>
                <form action={createSearchSet} className="flex flex-col gap-5">
                  <CardHeader>
                    <CardTitle>Create or continue</CardTitle>
                    <CardDescription>Met collection research intent</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="display_name">Display name</FieldLabel>
                        <Input id="display_name" name="display_name" required />
                        <FieldDescription>
                          A short name for this local research direction.
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="terms_text">Terms</FieldLabel>
                        <Textarea
                          className="min-h-28 resize-y"
                          id="terms_text"
                          name="terms_text"
                          placeholder="snake, anaconda, serpent"
                          required
                        />
                        <FieldDescription>
                          Use commas or new lines; duplicates are normalized by the backend.
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

              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-medium">Current Search Sets</h2>
                    <p className="text-sm text-muted-foreground">
                      Saved local research intent.
                    </p>
                  </div>
                  <Badge variant="secondary">{searchSetCards.length}</Badge>
                </div>

                {searchSetCards.length === 0 ? (
                  <Card>
                    <CardContent className="py-6">
                      <Empty className="border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Search />
                          </EmptyMedia>
                          <EmptyTitle>No Search Sets</EmptyTitle>
                          <EmptyDescription>
                            Local collection work starts after you save one.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </CardContent>
                  </Card>
                ) : (
                  searchSetCards.map((searchSet) => (
                    <Card key={searchSet.slug} size="sm">
                      <CardHeader>
                        <div className="flex min-w-0 flex-col gap-1">
                          <CardTitle className="truncate">
                            {searchSet.displayName}
                          </CardTitle>
                          <CardDescription className="truncate">
                            {searchSet.slug}
                          </CardDescription>
                        </div>
                        <CardAction>
                          <Badge variant="secondary">{searchSet.summary}</Badge>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
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
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
            </section>

            <Separator />

            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <ServerCog className="size-4" />
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
                    <CardContent>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {row.state === "error"
                          ? "Not reachable from the UI process."
                          : "Reachability check passed."}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
