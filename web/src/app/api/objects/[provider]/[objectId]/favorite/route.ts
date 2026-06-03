const DEFAULT_API_PORT = 18670;

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

async function proxyFavorite(
  method: "DELETE" | "PUT",
  context: { params: Promise<{ provider: string; objectId: string }> },
): Promise<Response> {
  const { provider, objectId } = await context.params;
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const response = await fetch(
    `http://127.0.0.1:${apiPort}/objects/${encodeURIComponent(provider)}/${encodeURIComponent(objectId)}/favorite`,
    { method },
  );
  const payload = await response.text();

  return new Response(payload, {
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
    status: response.status,
  });
}

export async function PUT(
  _request: Request,
  context: { params: Promise<{ provider: string; objectId: string }> },
): Promise<Response> {
  return proxyFavorite("PUT", context);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ provider: string; objectId: string }> },
): Promise<Response> {
  return proxyFavorite("DELETE", context);
}
