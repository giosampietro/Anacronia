import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const apiHealth = await getApiHealth(apiPort);
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Anacronia local shell</p>
          <h1 className="text-3xl font-semibold tracking-normal">Status</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Local-first collection workspace for Met public-domain material.
          </p>
        </header>

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
