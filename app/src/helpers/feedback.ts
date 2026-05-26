import { FEEDBACK_ENDPOINT } from "../config";
import { collectDiagnostics, type Diagnostics } from "./diagnostics";

export type FeedbackCategory = "bug" | "feature" | "question";

export type FeedbackDraft = {
  category: FeedbackCategory;
  title: string;
  body: string;
  contact_email: string;
  diagnostics_opt_in: boolean;
};

export type FeedbackPayload = {
  category: FeedbackCategory;
  title: string;
  body: string;
  contact_email?: string;
  diagnostics_opt_in: boolean;
  diagnostics?: Diagnostics;
  turnstile_token: string;
};

export type FeedbackResult =
  | { ok: true; issue_url?: string }
  | { ok: false; error: string };

declare global {
  interface Window {
    animoFeedbackClearDraft?: () => void;
    animoFeedbackCollectDiagnostics?: (
      onSuccess: (diagnosticsJson: string) => void,
      onError?: (message: string) => void,
    ) => void;
    animoFeedbackLoadDraft?: () => FeedbackDraft | null;
    animoFeedbackSaveDraft?: (draft: FeedbackDraft) => void;
    animoFeedbackSubmit?: (
      draft: FeedbackDraft,
      turnstileToken: string,
      onSuccess: (result: FeedbackResult) => void,
      onError?: (message: string) => void,
    ) => void;
  }
}

const DRAFT_KEY = "animo_feedback_draft";
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 8000;

export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  category: "bug",
  title: "",
  body: "",
  contact_email: "",
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
  turnstileToken: string,
): Promise<FeedbackPayload> {
  const normalized = normalizeDraft(draft);
  const payload: FeedbackPayload = {
    category: normalized.category,
    title: normalized.title.slice(0, MAX_TITLE_LENGTH),
    body: normalized.body.slice(0, MAX_BODY_LENGTH),
    diagnostics_opt_in: normalized.diagnostics_opt_in,
    turnstile_token: turnstileToken,
  };

  if (normalized.contact_email.trim()) {
    payload.contact_email = normalized.contact_email.trim();
  }

  if (normalized.diagnostics_opt_in) {
    payload.diagnostics = await collectDiagnostics();
  }

  return payload;
}

export async function submitFeedback(
  draft: FeedbackDraft,
  turnstileToken: string,
): Promise<FeedbackResult> {
  if (!turnstileToken.trim()) {
    return { ok: false, error: "Feedback verification is required." };
  }

  const payload = await buildFeedbackPayload(draft, turnstileToken.trim());

  if (!payload.title.trim() || !payload.body.trim()) {
    return { ok: false, error: "Title and description are required." };
  }

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

function normalizeDraft(draft: Partial<FeedbackDraft>): FeedbackDraft {
  return {
    category: isFeedbackCategory(draft.category) ? draft.category : EMPTY_FEEDBACK_DRAFT.category,
    title: typeof draft.title === "string" ? draft.title : "",
    body: typeof draft.body === "string" ? draft.body : "",
    contact_email: typeof draft.contact_email === "string" ? draft.contact_email : "",
    diagnostics_opt_in: draft.diagnostics_opt_in === true,
  };
}

function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return value === "bug" || value === "feature" || value === "question";
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
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
  window.animoFeedbackClearDraft = clearDraft;
  window.animoFeedbackLoadDraft = loadDraft;
  window.animoFeedbackSaveDraft = saveDraft;
  window.animoFeedbackCollectDiagnostics = (onSuccess, onError) => {
    collectDiagnostics()
      .then((diagnostics) => onSuccess(JSON.stringify(diagnostics, null, 2)))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to collect diagnostics.";
        onError?.(message);
      });
  };
  window.animoFeedbackSubmit = (draft, turnstileToken, onSuccess, onError) => {
    submitFeedback(draft, turnstileToken)
      .then(onSuccess)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to submit feedback.";
        onError?.(message);
      });
  };
}
