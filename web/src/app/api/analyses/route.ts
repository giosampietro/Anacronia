const DEFAULT_API_PORT = 18670;

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function apiUrl(): string {
  return `http://127.0.0.1:${getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT)}/analyses`;
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
    return redirectToAnalysis(response);
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
    title: normalizeString(form.get("title")),
  };
}

function normalizeString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
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

async function redirectToAnalysis(response: Response): Promise<Response> {
  const payload = await response
    .json()
    .catch((): Record<string, unknown> => ({ status: "unavailable" }));
  const analysis =
    payload.analysis && typeof payload.analysis === "object"
      ? (payload.analysis as Record<string, unknown>)
      : {};
  const searchParams = new URLSearchParams();

  if (typeof analysis.analysis_id === "string") {
    searchParams.set("analysisId", analysis.analysis_id);
  }
  if (!response.ok && typeof payload.detail === "string") {
    searchParams.set("mode", "new-analysis");
    searchParams.set("analysisError", payload.detail);
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
