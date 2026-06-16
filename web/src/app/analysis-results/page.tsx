import { AnalysisStudioShell } from "@/components/analysis-studio-shell";
import { loadAnalysisStudioReadModel } from "@/lib/analysis-studio-read-model";
import type { AnalysisStudioSearchParams } from "@/lib/analysis-studio-url";
import { readAppVersionStamp } from "@/lib/app-version";
import { createStatusRows, type ApiHealth } from "@/lib/status";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis Studio | Anacronia",
};

const DEFAULT_UI_PORT = 18661;
const DEFAULT_API_PORT = 18670;

export default async function AnalysisResultsPage({
  searchParams,
}: {
  searchParams?: Promise<AnalysisStudioSearchParams> | AnalysisStudioSearchParams;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const appVersionStamp = readAppVersionStamp();
  const [apiHealth, model] = await Promise.all([
    getApiHealth(apiPort),
    loadAnalysisStudioReadModel({
      apiPort,
      searchParams: resolvedSearchParams,
    }),
  ]);
  const rows = createStatusRows({ apiHealth, apiPort, uiPort });

  return (
    <AnalysisStudioShell
      appVersionStamp={appVersionStamp}
      model={model}
      rows={rows}
    />
  );
}

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
