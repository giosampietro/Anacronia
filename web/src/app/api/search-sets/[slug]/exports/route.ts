const DEFAULT_API_PORT = 18670;

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const body = await request.text();
  const response = await fetch(
    `http://127.0.0.1:${apiPort}/search-sets/${encodeURIComponent(slug)}/exports`,
    {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const payload = await response.text();

  return new Response(payload, {
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
    status: response.status,
  });
}
