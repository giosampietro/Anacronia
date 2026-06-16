const DEFAULT_API_PORT = 18670;

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function apiUrl(): string {
  return `http://127.0.0.1:${getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT)}/analysis-scopes/preview`;
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request
    .json()
    .catch((): Record<string, unknown> => ({}));
  const response = await fetch(apiUrl(), {
    body: JSON.stringify({
      collection_slugs: normalizeStringList(payload.collection_slugs),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  return proxyResponse(response);
}

function normalizeStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
    .map((item) => item.trim())
    .filter((item, index, items) => item !== "" && items.indexOf(item) === index);
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
