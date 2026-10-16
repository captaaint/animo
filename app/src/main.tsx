import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { startAutoCheck } from "./helpers/updater";
import "./styles/theme.css";
import "./styles/ui.css";
import { applyTone, initialTone } from "./lib/theme";

// Resolve the API base before mounting. Three runtime modes:
//   • Demo build (Netlify): an in-browser handler intercepts `/api/*`, so we
//     just point at the relative `/api` prefix and let the mock handle it.
//     Selected at build time via `VITE_ANIMO_DEMO=true` (see `build:demo`).
//   • Tauri desktop: Tauri assigns a random port at boot and exposes it
//     via the `api_base` invoke command. We block on it so the first
//     requests already go to the right place.
//   • Browser dev/prod: API runs on its own origin (127.0.0.1:8080).
async function resolveApiBase(): Promise<string> {
  if (import.meta.env.VITE_ANIMO_DEMO === "true") {
    return "/api";
  }
  if (window.__TAURI_INTERNALS__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("api_base");
  }
  return "http://127.0.0.1:8080/api";
}

async function boot() {
  // Paint the saved tone before anything renders (no flash of light mode).
  applyTone(initialTone());

  // Dev builds: install the local feedback sink BEFORE the demo API so the
  // feedback POST is captured locally instead of hitting the production
  // function (which blocks localhost origins via CORS) — no real GitHub
  // issues from local testing. No-op in production/preview builds.
  if (import.meta.env.DEV) {
    const { installFeedbackDevSink } = await import("./helpers/feedbackDevSink");
    installFeedbackDevSink();
  }
  // Demo build: install the in-browser /api/* fetch handler before any request.
  if (import.meta.env.VITE_ANIMO_DEMO === "true") {
    const { installDemoApi } = await import("./demoApi");
    installDemoApi();
  }
  window.__ANIMO_API_BASE__ = await resolveApiBase();
  window.__ANIMO_VERSION__ = import.meta.env.VITE_ANIMO_VERSION || "0.0.0";
  window.__ANIMO_DEMO__ = import.meta.env.VITE_ANIMO_DEMO === "true";

  // Desktop only: periodic update check (no-op outside Tauri).
  startAutoCheck();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
