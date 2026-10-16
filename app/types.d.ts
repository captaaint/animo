/// <reference types="vite/client" />

// Populated on boot (see src/main.tsx → resolveApiBase). lib/api.ts reads
// it as `window.__ANIMO_API_BASE__`; the value differs between the
// browser dev build (hard-coded http://127.0.0.1:8080/api), the Tauri
// desktop shell (random port supplied by the `api_base` invoke command),
// and the demo build (relative `/api`, served by the in-browser handler).
interface Window {
  __ANIMO_API_BASE__?: string;
  __TAURI_INTERNALS__?: unknown;
  __ANIMO_VERSION__?: string;
  __ANIMO_DEMO__?: boolean;
}

interface ImportMetaEnv {
  /** Set to "true" by the `build:demo` npm script; tells main.tsx to
   *  install the in-browser API
   *  handler instead of hitting the real backend. */
  readonly VITE_ANIMO_DEMO?: string;
  /** Build-time release version (e.g. "0.1.0"). Injected by
   *  .github/workflows/release.yml; falls back to a literal in
   *  main.tsx so local dev builds still render something sensible. */
  readonly VITE_ANIMO_VERSION?: string;
  /** Optional override for the Tauri update manifest URL. Defaults to
   *  https://getanimo.app/updates/latest.json — point at a local
   *  /updates/test.json during development to exercise the updater UI
   *  without shipping a release. */
  readonly VITE_ANIMO_UPDATES_URL?: string;
  /** Optional override for the feedback submission endpoint. Defaults
   *  to https://getanimo.app/api/feedback. */
  readonly VITE_FEEDBACK_ENDPOINT?: string;
  /** Optional flag to switch the app to hash-based routing (useful for
   *  static hosting that can't handle SPA fallbacks). */
  readonly VITE_ANIMO_HASH_ROUTING?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
