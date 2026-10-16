// Thin fetch wrapper around the Animo API.
//
// The base URL is resolved once on boot (see main.tsx → resolveApiBase) and
// parked on `window.__ANIMO_API_BASE__`; it differs between the browser dev
// build, the Tauri desktop shell (random port) and the demo build (relative
// `/api`, served by the in-browser handler).

export function apiBase(): string {
  return window.__ANIMO_API_BASE__ || "http://127.0.0.1:8080/api";
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error || body.message || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
