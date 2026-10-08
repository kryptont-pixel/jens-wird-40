const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export async function readJson<T>(request: Request, maxBytes = 64_000): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new HttpError(413, "REQUEST_TOO_LARGE", "Die Anfrage ist zu groß.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "REQUEST_TOO_LARGE", "Die Anfrage ist zu groß.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Die Anfrage ist ungültig.");
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function handleError(error: unknown, label: string): Response {
  if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
  const requestId = crypto.randomUUID();
  console.error(`[${label}] ${requestId}`, error instanceof Error ? error.message : String(error));
  return errorResponse(500, "INTERNAL_ERROR", `Das hat gerade nicht geklappt. Bitte versuche es erneut. (${requestId})`);
}

export function assertMethod(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Diese Anfrage ist nicht erlaubt.");
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = process.env.PUBLIC_SITE_URL?.trim();
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && (!expected || origin !== new URL(expected).origin)) {
    throw new HttpError(403, "BAD_ORIGIN", "Diese Anfrage wurde aus Sicherheitsgründen abgelehnt.");
  }
}
