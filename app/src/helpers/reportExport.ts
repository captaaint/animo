// =====================================================================================================================
// reportExport — window-mounted helper that downloads server-rendered exports.
// =====================================================================================================================
//
// The PDF export already runs client-side via `xmlui-pdf` (see
// ReportsScreen.xmlui's `tt:export-report` handler). CSV and XLSX exports,
// in contrast, are produced by the API — the SQLite joins and aggregations
// live there, and we'd just duplicate them in the browser otherwise.
//
// Why a helper rather than `<a href>` or a Button onClick with fetch?
//   - The endpoints require credentials (`include`) so the cookie reaches
//     the embedded axum server; a plain anchor link doesn't carry session
//     state in cross-origin dev mode.
//   - We want a single place to construct the URL, set the download
//     filename, and revoke the blob URL after the click — duplicating
//     that across XS expressions would invite drift.
//
// Public API:
//   window.animoDownloadReport(format, from, to)
//     format: "csv" | "xlsx"
//     from / to: YYYY-MM-DD strings (same shape as RangeQuery on the server)

declare global {
  interface Window {
    __ANIMO_API_BASE__?: string;
    animoDownloadReport?: (format: "csv" | "xlsx", from: string, to: string) => void;
  }
}

function apiBase(): string {
  return window.__ANIMO_API_BASE__ || "http://127.0.0.1:8080/api";
}

window.animoDownloadReport = function animoDownloadReport(format, from, to) {
  const ext = format === "xlsx" ? "xlsx" : "csv";
  const url = `${apiBase()}/reports/export.${ext}?from=${encodeURIComponent(
    from,
  )}&to=${encodeURIComponent(to)}`;

  fetch(url, { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) {
        // Backend sends `{ "error": "…" }` JSON for 4xx/5xx; surface that
        // verbatim so the user sees the actual validation message.
        let message = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body && typeof body.error === "string" && body.error) {
            message = body.error;
          }
        } catch {
          if (response.statusText) message = response.statusText;
        }
        throw new Error(message);
      }
      return response.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `animo_report_${from}_${to}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoke on the next tick so Chromium-based browsers have a chance
      // to commit the download. Immediate revoke occasionally cancels it
      // mid-stream — same workaround the PDF preview drawer uses.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    })
    .catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Export failed";
      // The XMLUI host wires a global `toast` accessible from XS, but
      // helpers don't get that injection. Fall back to a console error
      // and let the calling component decide whether to surface a toast.
      console.error("animoDownloadReport:", message);
      alert(`Export failed: ${message}`);
    });
};

export {};
