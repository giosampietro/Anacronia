const DEFAULT_API_PORT = 18670;

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function apiUrl(): string {
  return `http://127.0.0.1:${getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT)}/analysis-jobs`;
}

export async function GET(): Promise<Response> {
  const response = await fetch(apiUrl(), { method: "GET" });
  return proxyResponse(response);
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  const wantsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  const body = contentType.includes("application/json")
    ? await request.text()
    : JSON.stringify(await requestPayloadFromForm(request));

  const response = await fetch(apiUrl(), {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (wantsHtml) {
    return redirectToAnalysisResults(response);
  }

  return proxyResponse(response);
}

async function requestPayloadFromForm(request: Request) {
  const form = await request.formData();
  return {
    collection_slugs: form
      .getAll("collection_slugs")
      .flatMap((value) => splitCommaList(value))
      .filter((value, index, values) => values.indexOf(value) === index),
    recipe_ids: form
      .getAll("recipe_ids")
      .flatMap((value) => splitCommaList(value))
      .filter((value, index, values) => values.indexOf(value) === index),
  };
}

function splitCommaList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function redirectToAnalysisResults(response: Response): Promise<Response> {
  const payload = await response
    .json()
    .catch((): Record<string, unknown> => ({ status: "unavailable" }));
  const searchParams = new URLSearchParams();

  if (typeof payload.analysis_job_id === "string") {
    searchParams.set("analysisJobId", payload.analysis_job_id);
  }
  if (typeof payload.status === "string") {
    searchParams.set("analysisJobStatus", payload.status);
  }
  if (!response.ok && typeof payload.detail === "string") {
    searchParams.set("analysisJobError", payload.detail);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams}` : "";
  return new Response(null, {
    headers: { location: `/analysis-results${suffix}` },
    status: 303,
  });
}

async function proxyResponse(response: Response): Promise<Response> {
  const payload = await response.text();
  return new Response(payload, {
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
    status: response.status,
  });
}
