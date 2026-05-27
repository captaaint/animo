type HeaderMap = Record<string, string | undefined>;

type NetlifyEvent = {
  body: string | null;
  headers: HeaderMap;
  httpMethod: string;
};

type NetlifyResponse = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

type FeedbackCategory = "bug" | "feature" | "question";

type FeedbackPayload = {
  category?: unknown;
  title?: unknown;
  body?: unknown;
  diagnostics_opt_in?: unknown;
  diagnostics?: unknown;
  turnstile_token?: unknown;
};

type ValidFeedbackPayload = {
  category: FeedbackCategory;
  title: string;
  body: string;
  diagnosticsOptIn: boolean;
  diagnostics?: unknown;
  turnstileToken?: string;
};

const ALLOWED_ORIGINS = new Set([
  "https://getanimo.app",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 8000;
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitBuckets = new Map<string, number[]>();

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const headers = corsHeaders(event.headers);

  if (event.httpMethod === "OPTIONS") {
    return json(204, {}, headers);
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, headers);
  }

  if (byteLength(event.body || "") > MAX_BODY_BYTES) {
    return json(413, { error: "Payload too large" }, headers);
  }

  const parsed = parseJson(event.body || "{}");
  if (!parsed.ok) {
    return json(400, { error: "Invalid JSON" }, headers);
  }

  const desktopOrigin = isDesktopOrigin(event.headers);
  const payload = validatePayload(parsed.value, { allowMissingTurnstile: desktopOrigin });
  if (!payload.ok) {
    return json(400, { error: payload.error }, headers);
  }

  const ip = clientIp(event.headers);
  if (!checkRateLimit(ip)) {
    return json(429, { error: "Rate limit exceeded" }, headers);
  }

  if (payload.value.turnstileToken) {
    const turnstileResult = await verifyTurnstile(payload.value.turnstileToken, ip);
    if (!turnstileResult.ok) {
      return json(turnstileResult.statusCode, { error: turnstileResult.error }, headers);
    }
  }

  const issueResult = await createGithubIssue(payload.value);
  if (!issueResult.ok) {
    return json(issueResult.statusCode, { error: issueResult.error }, headers);
  }

  return json(200, { ok: true, issue_url: issueResult.issueUrl }, headers);
}

function corsHeaders(headers: HeaderMap): Record<string, string> {
  const origin = header(headers, "origin");
  const cors: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    cors["Access-Control-Allow-Origin"] = origin;
    cors.Vary = "Origin";
  }

  return cors;
}

function json(statusCode: number, value: unknown, headers: Record<string, string>): NetlifyResponse {
  return {
    statusCode,
    headers,
    body: statusCode === 204 ? "" : JSON.stringify(value),
  };
}

function parseJson(body: string): { ok: true; value: FeedbackPayload } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) as FeedbackPayload };
  } catch {
    return { ok: false };
  }
}

function validatePayload(
  payload: FeedbackPayload,
  options: { allowMissingTurnstile: boolean },
): { ok: true; value: ValidFeedbackPayload } | { ok: false; error: string } {
  if (!isCategory(payload.category)) {
    return { ok: false, error: "Invalid category" };
  }

  if (!isNonEmptyString(payload.title) || payload.title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: "Invalid title" };
  }

  if (!isNonEmptyString(payload.body) || payload.body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: "Invalid body" };
  }

  if (!isNonEmptyString(payload.turnstile_token) && !options.allowMissingTurnstile) {
    return { ok: false, error: "Missing Turnstile token" };
  }

  const diagnosticsOptIn = payload.diagnostics_opt_in === true;

  return {
    ok: true,
    value: {
      category: payload.category,
      title: payload.title.trim(),
      body: payload.body.trim(),
      diagnosticsOptIn,
      diagnostics: diagnosticsOptIn ? payload.diagnostics : undefined,
      turnstileToken: isNonEmptyString(payload.turnstile_token)
        ? payload.turnstile_token
        : undefined,
    },
  };
}

function isCategory(value: unknown): value is FeedbackCategory {
  return value === "bug" || value === "feature" || value === "question";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(ip) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT) return false;

  recent.push(now);
  rateLimitBuckets.set(ip, recent);
  return true;
}

async function verifyTurnstile(
  token: string,
  ip: string,
): Promise<{ ok: true } | { ok: false; error: string; statusCode: number }> {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not configured");
    return { ok: false, statusCode: 500, error: "Feedback endpoint is not configured" };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: ip,
    });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = (await response.json()) as { success?: boolean };
    if (!response.ok || result.success !== true) {
      return { ok: false, statusCode: 403, error: "Invalid Turnstile token" };
    }
    return { ok: true };
  } catch (error) {
    console.error("Turnstile verification failed:", error);
    return { ok: false, statusCode: 502, error: "Turnstile verification failed" };
  }
}

async function createGithubIssue(
  payload: ValidFeedbackPayload,
): Promise<{ ok: true; issueUrl: string } | { ok: false; error: string; statusCode: number }> {
  const token = env("GITHUB_TOKEN");
  if (!token) {
    console.error("GITHUB_TOKEN is not configured");
    return { ok: false, statusCode: 500, error: "Feedback endpoint is not configured" };
  }

  const repository = env("GITHUB_FEEDBACK_REPOSITORY") || "captaaint/animo";
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("GITHUB_FEEDBACK_REPOSITORY must be owner/repo");
    return { ok: false, statusCode: 500, error: "Feedback endpoint is not configured" };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `[${payload.category}] ${payload.title}`,
        body: issueBody(payload),
        labels: ["feedback", "from-app"],
      }),
    });
    const result = (await response.json()) as { html_url?: string; message?: string };

    if (!response.ok || !result.html_url) {
      console.error("GitHub issue creation failed:", result.message || response.statusText);
      return { ok: false, statusCode: 502, error: "Failed to create feedback issue" };
    }

    return { ok: true, issueUrl: result.html_url };
  } catch (error) {
    console.error("GitHub issue creation failed:", error);
    return { ok: false, statusCode: 502, error: "Failed to create feedback issue" };
  }
}

function issueBody(payload: ValidFeedbackPayload): string {
  const parts = [payload.body];

  if (payload.diagnosticsOptIn && payload.diagnostics !== undefined) {
    parts.push(`**Diagnostics:**\n\n\`\`\`json\n${JSON.stringify(payload.diagnostics, null, 2)}\n\`\`\``);
  }

  return parts.join("\n\n---\n\n");
}

function clientIp(headers: HeaderMap): string {
  return (
    header(headers, "x-nf-client-connection-ip") ||
    header(headers, "client-ip") ||
    header(headers, "x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isDesktopOrigin(headers: HeaderMap): boolean {
  const origin = header(headers, "origin");
  return (
    origin === "tauri://localhost" ||
    origin === "http://tauri.localhost" ||
    origin === "https://tauri.localhost"
  );
}

function header(headers: HeaderMap, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === lowerName);
  return key ? headers[key] : undefined;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function env(name: string): string | undefined {
  return (
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name] || undefined
  );
}
