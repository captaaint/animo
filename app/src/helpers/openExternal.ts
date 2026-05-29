// =====================================================================================================================
// External link opener — bridges XMLUI to the right "open in browser" path.
// =====================================================================================================================
//
// Why a bridge:
//   The XMLUI layer can't import Tauri plugins directly, and the correct way
//   to open a URL differs by runtime:
//     • Tauri desktop — the main webview must NOT navigate to the URL itself.
//       `@tauri-apps/plugin-opener` hands the URL to the OS default browser.
//       Imported lazily (the package calls native code at import time, which
//       throws outside the Tauri shell) and guarded by `isTauri()`, matching
//       helpers/updater.ts and helpers/reportExport.ts.
//     • Browser / demo — a plain `window.open(..., "_blank")`.
//
//   This module installs `window.animoOpenExternal(url)`, called from
//   FeedbackModal.xmlui. It registers via the eager `/src/**` glob in
//   app/index.ts (same mechanism as helpers/feedback.ts), so importing it
//   anywhere is unnecessary.

declare global {
  interface Window {
    animoOpenExternal?: (url: string) => void;
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function openExternal(url: string): Promise<void> {
  if (!url) return;

  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (error) {
      // Fall back to window.open so a misconfigured plugin doesn't dead-end
      // the click; log so the failure is visible during development.
      console.error("Failed to open URL via Tauri opener:", error);
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

if (typeof window !== "undefined") {
  window.animoOpenExternal = (url: string) => {
    void openExternal(url);
  };
}
