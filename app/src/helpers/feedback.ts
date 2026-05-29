import { FEEDBACK_ENDPOINT, TURNSTILE_SITE_KEY } from "../config";
import { collectDiagnostics, collectDiagnosticsSync, type Diagnostics } from "./diagnostics";

export type FeedbackCategory = "bug" | "feature" | "question";

export type FeedbackDraft = {
  category: FeedbackCategory;
  title: string;
  body: string;
  diagnostics_opt_in: boolean;
};

export type FeedbackPayload = {
  category: FeedbackCategory;
  title: string;
  body: string;
  diagnostics_opt_in: boolean;
  diagnostics?: Diagnostics;
  turnstile_token?: string;
};

export type FeedbackResult =
  | { ok: true; issue_url?: string }
  | { ok: false; error: string };

type TurnstileRenderOptions = {
  sitekey: string;
  size?: "normal" | "compact" | "flexible" | "invisible";
  appearance?: "always" | "execute" | "interaction-only";
  execution?: "render" | "execute";
  callback?: (token: string) => void;
  "error-callback"?: (errorCode: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
};

type TurnstileApi = {
  render: (
    container: HTMLElement | string,
    options: TurnstileRenderOptions,
  ) => string | undefined;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
  execute: (widgetId?: string) => void;
};

declare global {
  interface Window {
    animoFeedbackClearDraft?: () => void;
    animoFeedbackLoadDraft?: () => FeedbackDraft | null;
    animoFeedbackSaveDraft?: (draft: FeedbackDraft) => void;
    animoFeedbackCollectDiagnostics?: () => Promise<Diagnostics>;
    animoFeedbackBuildPreview?: (draft: FeedbackDraft) => string;
    animoFeedbackSubmit?: (
      draft: FeedbackDraft,
      onSuccess: (result: FeedbackResult) => void,
      onError?: (message: string) => void,
    ) => void;
    turnstile?: TurnstileApi;
  }
}

const DRAFT_KEY = "animo_feedback_draft";
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 8000;
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_TOKEN_TIMEOUT_MS = 30_000;

export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  category: "bug",
  title: "",
  body: "",
  diagnostics_opt_in: false,
};

export function saveDraft(draft: FeedbackDraft): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(normalizeDraft(draft)));
  } catch (error) {
    console.warn("Failed to save feedback draft:", error);
  }
}

export function loadDraft(): FeedbackDraft | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw) as Partial<FeedbackDraft>);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Best effort only; a stale draft is harmless.
  }
}

export async function buildFeedbackPayload(
  draft: FeedbackDraft,
  turnstileToken?: string,
): Promise<FeedbackPayload> {
  const normalized = normalizeDraft(draft);
  const payload: FeedbackPayload = {
    category: normalized.category,
    title: normalized.title.slice(0, MAX_TITLE_LENGTH),
    body: normalized.body.slice(0, MAX_BODY_LENGTH),
    diagnostics_opt_in: normalized.diagnostics_opt_in,
  };

  if (turnstileToken) {
    payload.turnstile_token = turnstileToken;
  }

  if (normalized.diagnostics_opt_in) {
    payload.diagnostics = await collectDiagnostics();
  }

  return payload;
}

// Synchronous so the XMLUI caller can assign the result to reactive state
// directly (an awaited/Promise result only updates state from an event
// handler, not from a method). The preview only needs the diagnostics block,
// which collectDiagnosticsSync produces without any async work.
export function buildFeedbackPreview(_draft: FeedbackDraft): string {
  return JSON.stringify(collectDiagnosticsSync(), null, 2);
}

export async function submitFeedback(draft: FeedbackDraft): Promise<FeedbackResult> {
  const normalized = normalizeDraft(draft);
  if (!normalized.title.trim() || !normalized.body.trim()) {
    return { ok: false, error: "Title and description are required." };
  }

  // Web submissions need a Turnstile token. Skip it for the desktop app
  // (the function exempts the bundled desktop origin) and for dev builds,
  // where the request is answered by the local feedback sink (see
  // app/src/helpers/feedbackDevSink.ts) rather than the real endpoint.
  let turnstileToken: string | undefined;
  if (!isDesktopRuntime() && !import.meta.env.DEV) {
    try {
      turnstileToken = await getTurnstileToken();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not verify the request.";
      return { ok: false, error: friendlyVerificationError(message) };
    }
  }

  const payload = await buildFeedbackPayload(normalized, turnstileToken);

  if (byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: "Feedback payload is too large." };
  }

  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await parseResponse(response);

    if (response.ok && result.ok === true) {
      clearDraft();
      return { ok: true, issue_url: result.issue_url };
    }

    return {
      ok: false,
      error: result.error || `Feedback submission failed with HTTP ${response.status}.`,
    };
  } catch {
    return { ok: false, error: "Network error while sending feedback." };
  }
}

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstileScript(): Promise<TurnstileApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile is only available in the browser."));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${TURNSTILE_SCRIPT_URL.split("?")[0]}"]`,
    );
    const onReady = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile script loaded but global is missing."));
    };
    if (existing) {
      if (window.turnstile) {
        onReady();
        return;
      }
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Turnstile script.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener(
      "error",
      () => {
        turnstileScriptPromise = null;
        reject(new Error("Failed to load Turnstile script."));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

async function getTurnstileToken(): Promise<string> {
  if (!TURNSTILE_SITE_KEY) {
    throw new Error(
      "Feedback verification is not configured. Set VITE_TURNSTILE_SITE_KEY at build time.",
    );
  }

  const turnstile = await loadTurnstileScript();

  return new Promise<string>((resolve, reject) => {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "-10000px";
    container.style.width = "1px";
    container.style.height = "1px";
    container.style.overflow = "hidden";
    container.setAttribute("aria-hidden", "true");
    document.body.appendChild(container);

    let widgetId: string | undefined;
    let settled = false;

    const cleanup = () => {
      if (widgetId !== undefined) {
        try {
          turnstile.remove(widgetId);
        } catch {
          // Widget may already be removed; ignore.
        }
      }
      if (container.parentNode) container.parentNode.removeChild(container);
    };

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Verification timed out. Please try again."));
    }, TURNSTILE_TOKEN_TIMEOUT_MS);

    const settle = (resolution: { ok: true; token: string } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      if (resolution.ok) resolve(resolution.token);
      else reject(new Error(resolution.error));
    };

    try {
      widgetId = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        callback: (token: string) => settle({ ok: true, token }),
        "error-callback": (errorCode: string) =>
          settle({ ok: false, error: `Verification failed (${errorCode}).` }),
        "expired-callback": () =>
          settle({ ok: false, error: "Verification expired. Please try again." }),
        "timeout-callback": () =>
          settle({ ok: false, error: "Verification timed out. Please try again." }),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to render verification.";
      settle({ ok: false, error: message });
    }
  });
}

function normalizeDraft(draft: Partial<FeedbackDraft>): FeedbackDraft {
  return {
    category: isFeedbackCategory(draft.category) ? draft.category : EMPTY_FEEDBACK_DRAFT.category,
    title: typeof draft.title === "string" ? draft.title : "",
    body: typeof draft.body === "string" ? draft.body : "",
    diagnostics_opt_in: draft.diagnostics_opt_in === true,
  };
}

function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return value === "bug" || value === "feature" || value === "question";
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function friendlyVerificationError(message: string): string {
  if (message.includes("110200")) {
    return "Feedback verification is not authorized for this app domain. Please update Animo or try again later.";
  }
  return message;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function parseResponse(response: Response): Promise<{
  ok?: boolean;
  issue_url?: string;
  error?: string;
}> {
  try {
    return (await response.json()) as { ok?: boolean; issue_url?: string; error?: string };
  } catch {
    return {};
  }
}

if (typeof window !== "undefined") {
  window.animoFeedbackBuildPreview = buildFeedbackPreview;
  window.animoFeedbackClearDraft = clearDraft;
  window.animoFeedbackCollectDiagnostics = collectDiagnostics;
  window.animoFeedbackLoadDraft = loadDraft;
  window.animoFeedbackSaveDraft = saveDraft;
  window.animoFeedbackSubmit = (draft, onSuccess, onError) => {
    submitFeedback(draft)
      .then(onSuccess)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to submit feedback.";
        onError?.(message);
      });
  };
}
