// =====================================================================================================================
// timerBus — window-mounted helpers for cross-tree TimerBar control.
// =====================================================================================================================
//
// XMLUI sandboxes XS expressions, which means `window.dispatchEvent(new
// CustomEvent(...))` from Globals.xs silently fails. The reports flow uses
// the same trick (window.generateReportPdf et al.) — we mount a plain
// function on `window` from a regular TS module, and XS expressions call it
// by name. The function then has full DOM access.
//
// Public API: `window.ttPublishResume(description, projectId)` dispatches a
// `tt:resume` CustomEvent that the Stopwatch React extension listens for.

declare global {
  interface Window {
    ttPublishResume?: (description: string, projectId: string | null) => void;
    ttExportReport?: () => void;
  }
}

window.ttPublishResume = function ttPublishResume(description, projectId) {
  try {
    window.dispatchEvent(
      new CustomEvent("tt:resume", {
        detail: {
          description: description || "",
          projectId: projectId || null,
        },
      }),
    );
  } catch {
    // Best-effort; if dispatch fails we silently no-op so XS callers do not crash.
  }
};

window.ttExportReport = function ttExportReport() {
  try {
    window.dispatchEvent(new CustomEvent("tt:export-report"));
  } catch {
    // Best-effort
  }
};

export {};
