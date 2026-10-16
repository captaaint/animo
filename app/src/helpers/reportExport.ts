// =====================================================================================================================
// reportExport — save server-rendered exports and blob URLs to disk.
// =====================================================================================================================
//
// The PDF export runs client-side (see helpers/reportPdf.ts) and produces a
// blob URL. CSV and XLSX exports are produced by the API — the SQLite joins
// and aggregations live there.
//
// Saving the bytes to disk needs two code paths:
//   • Browser: classic `<a download>` + programmatic click.
//   • Tauri 2: WKWebView ignores the `download` attribute (and silently
//     drops `anchor.click()` for blob URLs), so the same flow there is
//     "fetch → blob → dialog.save() → fs.writeFile()". Tauri detection
//     hangs off `window.__TAURI_INTERNALS__`, set by the runtime before
//     the webview boots.

import { apiBase } from "../lib/api";

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function extToFilter(ext: string): { name: string; extensions: string[] } {
  if (ext === "pdf") return { name: "PDF", extensions: ["pdf"] };
  if (ext === "xlsx") return { name: "Excel Workbook", extensions: ["xlsx"] };
  if (ext === "csv") return { name: "CSV", extensions: ["csv"] };
  return { name: ext.toUpperCase(), extensions: [ext] };
}

function inferExt(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : "";
}

// Classic browser save — anchor with `download`, programmatic click,
// revoke on next tick so Chromium has a chance to commit the download.
function saveViaAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Tauri save — native save dialog + fs.writeFile. Pulled in dynamically
// so non-Tauri builds (browser, Netlify demo) don't fail at import time
// when the plugin modules are absent or stubbed by Vite.
async function saveViaTauri(blob: Blob, fileName: string): Promise<void> {
  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const ext = inferExt(fileName);
  const path = await save({
    defaultPath: fileName,
    filters: ext ? [extToFilter(ext)] : undefined,
  });
  if (!path) return; // user cancelled
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
}

async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  if (isTauri()) {
    await saveViaTauri(blob, fileName);
    return;
  }
  saveViaAnchor(blob, fileName);
}

/** Download a server-rendered CSV/XLSX report for the given range. */
export async function downloadReport(
  format: "csv" | "xlsx",
  from: string,
  to: string,
): Promise<void> {
  const ext = format === "xlsx" ? "xlsx" : "csv";
  const url = `${apiBase()}/reports/export.${ext}?from=${encodeURIComponent(
    from,
  )}&to=${encodeURIComponent(to)}`;

  const response = await fetch(url, { credentials: "include" });
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
  await saveBlob(await response.blob(), `animo_report_${from}_${to}.${ext}`);
}

/** Save an already-created blob: URL under `fileName`. */
export async function downloadBlobUrl(blobUrl: string, fileName: string): Promise<void> {
  const blob = await (await fetch(blobUrl)).blob();
  await saveBlob(blob, fileName);
}
