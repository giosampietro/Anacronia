import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSearchSetCards } from "@/lib/search-sets";
import type { SearchSet } from "@/lib/search-sets";
import { createStatusRows } from "@/lib/status";
import type { ApiHealth } from "@/lib/status";

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

export default async function Home() {
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const [apiHealth, searchSets] = await Promise.all([getApiHealth(apiPort), getSearchSets(apiPort)]);
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });
  const searchSetCards = createSearchSetCards(searchSets);

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Anacronia local shell</p>
          <h1 className="text-3xl font-semibold tracking-normal">Search Sets</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Local-first collection workspace for Met public-domain material.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <form action={createSearchSet}>
              <CardHeader>
                <CardTitle>Create or continue</CardTitle>
                <CardDescription>Met collection research intent</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Display name
                  <input
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    name="display_name"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Terms
                  <textarea
                    className="min-h-32 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    name="terms_text"
                    required
                  />
                </label>
                <Button type="submit">Save Search Set</Button>
              </CardContent>
            </form>
          </Card>

          <section className="flex flex-col gap-4">
            {searchSetCards.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No Search Sets</CardTitle>
                  <CardDescription>Local collection work starts here.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              searchSetCards.map((searchSet) => (
                <Card key={searchSet.slug}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <CardTitle>{searchSet.displayName}</CardTitle>
                        <CardDescription>{searchSet.slug}</CardDescription>
                      </div>
                      <Badge variant="secondary">{searchSet.summary}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
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

        <section className="grid gap-4 md:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.name}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle>{row.name}</CardTitle>
                    <CardDescription>{row.detail}</CardDescription>
                  </div>
                  <Badge variant={statusVariant(row.state)}>{row.state}</Badge>
                </div>
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
        </section>
      </div>
    </main>
  );
}
