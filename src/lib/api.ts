export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Keine Verbindung. Prüfe kurz dein Internet und versuche es erneut.", 0);
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError("INVALID_RESPONSE", "Der Server hat unerwartet geantwortet. Bitte versuche es erneut.", response.status);
  }
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(error?.code ?? "REQUEST_FAILED", error?.message ?? "Das hat gerade nicht geklappt.", response.status);
  }
  return data as T;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
