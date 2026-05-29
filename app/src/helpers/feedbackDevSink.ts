// =====================================================================================================================
// Dev-only feedback sink — a local test endpoint for the feedback form.
// =====================================================================================================================
//
// Why this exists:
//   The production feedback function (website/netlify/functions/feedback.ts,
//   served at getanimo.app/api/feedback) only allowlists the deployed web
//   origins and the bundled desktop origin (`tauri://localhost`) for CORS.
//   Local dev runs on `http://localhost:*` (both `app:demo` in the browser
//   and `tauri:dev:demo`, whose webview loads the Vite dev URL over http), so
//   every local submission is blocked by CORS before it ever lands — and we
//   don't want test runs creating real GitHub issues either.
//
//   This intercepts the feedback POST in dev builds, records the payload
//   (console + localStorage) and returns a synthetic success so the full
//   flow — including the redesigned result modal — is testable locally
//   without anything reaching GitHub.
//
// Scope:
//   Installed only when `import.meta.env.DEV` is true (see app/index.ts).
//   Production/preview builds (`xmlui build --prod`, `tauri build`, the
//   deployed Netlify demo) never install it, so real delivery is unchanged.

const RECORD_KEY = "animo_feedback_dev_submissions";
const MAX_RECORDS = 20;

type DevSubmission = {
  at: string;
  id: number;
  payload: unknown;
};

function readRecords(): DevSubmission[] {
  try {
    const raw = window.localStorage.getItem(RECORD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DevSubmission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: DevSubmission[]): void {
  try {
    window.localStorage.setItem(RECORD_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Quota / private-mode failures aren't fatal for a dev sink.
  }
}

async function extractPayload(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<unknown> {
  try {
    const raw =
      init?.body ?? (input instanceof Request ? await input.clone().text() : null);
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {
    // Unparseable body — record it as null rather than throwing.
  }
  return null;
}

/**
 * Patches `window.fetch` so any POST to a `/api/feedback` URL is answered
 * locally with a synthetic success instead of going to the network. Idempotent.
 * Install BEFORE `installDemoApi` so the demo handler's feedback bypass
 * (`return origFetch(...)`) resolves to this sink rather than the real network.
 */
export function installFeedbackDevSink(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __ANIMO_FEEDBACK_DEV_SINK__?: boolean;
    animoFeedbackDevSubmissions?: () => DevSubmission[];
  };
  if (w.__ANIMO_FEEDBACK_DEV_SINK__) return;
  w.__ANIMO_FEEDBACK_DEV_SINK__ = true;

  // Convenience inspector: `animoFeedbackDevSubmissions()` in the console.
  w.animoFeedbackDevSubmissions = readRecords;

  const origFetch = window.fetch.bind(window);

  window.fetch = async function feedbackDevSinkFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isFeedback = /\/api\/feedback(?:[/?]|$)/.test(url);
    if (!isFeedback) return origFetch(input, init);

    const payload = await extractPayload(input, init);
    const records = readRecords();
    const id = (records.length > 0 ? records[records.length - 1].id : 0) + 1;
    records.push({ at: new Date().toISOString(), id, payload });
    writeRecords(records);

    console.info(
      `[feedback dev sink] captured submission #${id} locally — NOT sent to GitHub. ` +
        `Inspect with animoFeedbackDevSubmissions().`,
      payload,
    );

    return new Response(
      JSON.stringify({ ok: true, issue_url: `http://localhost/dev-feedback/${id}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}
