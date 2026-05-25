// =====================================================================================================================
// importApi — window-mounted helpers for CSV/XLSX import preview + commit.
// =====================================================================================================================
//
// XMLUI XS expressions can't drive `fetch` with `FormData` directly (the
// sandbox doesn't expose either), and APICall's body field would force a
// JSON-stringify on the upload. So the import flow follows the same
// trick as the export/resume helpers: mount plain functions on `window`
// from a TS module, and let XS call them by name. The XMLUI side stays
// declarative and the multipart construction lives next to the rest of
// the browser-only code.
//
// Two entrypoints:
//   - window.animoImportPreview(file, formatHint, onSuccess, onError)
//       POSTs the file (and optional source_format) to
//       /api/import/{csv,xlsx}/preview, picked by extension.
//   - window.animoImportCommit(sessionId, isXlsx, onSuccess, onError)
//       POSTs the sessionId to /api/import/{csv,xlsx}/commit.
//
// Both callbacks: pass parsed JSON on success, a human-readable error
// string on failure. Errors come from either the network layer or the
// backend's `{ "error": "..." }` envelope.

type PreviewResponse = {
  sessionId: string;
  format: string;
  totalRows: number;
  validRows: number;
  duplicateWarnings: number;
  errorRows: { row: number; message: string }[];
  entitiesToCreate: { clients: string[]; projects: string[]; tags: string[] };
};

type CommitResponse = {
  entriesCreated: number;
  clientsCreated: number;
  projectsCreated: number;
  tagsCreated: number;
  duplicatesSkipped: number;
};

declare global {
  interface Window {
    __ANIMO_API_BASE__?: string;
    animoImportPreview?: (
      file: File,
      formatHint: string | null,
      onSuccess: (data: PreviewResponse) => void,
      onError: (message: string) => void,
    ) => void;
    animoImportCommit?: (
      sessionId: string,
      isXlsx: boolean,
      onSuccess: (data: CommitResponse) => void,
      onError: (message: string) => void,
    ) => void;
  }
}

function apiBase(): string {
  return window.__ANIMO_API_BASE__ || "http://127.0.0.1:8080/api";
}

function isXlsxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".xlsx");
}

async function jsonOrErrorMessage(response: Response): Promise<unknown> {
  if (response.ok) {
    return response.json();
  }
  // Try to surface the backend's `{ "error": "..." }` envelope; fall back
  // to status text when the body isn't JSON.
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

window.animoImportPreview = function animoImportPreview(
  file,
  formatHint,
  onSuccess,
  onError,
) {
  if (!file) {
    onError("No file selected");
    return;
  }
  const fd = new FormData();
  fd.append("file", file);
  if (formatHint && formatHint !== "auto") {
    fd.append("source_format", formatHint);
  }
  const route = isXlsxFile(file) ? "xlsx" : "csv";
  fetch(`${apiBase()}/import/${route}/preview`, {
    method: "POST",
    body: fd,
    credentials: "include",
  })
    .then(jsonOrErrorMessage)
    .then((data) => onSuccess(data as PreviewResponse))
    .catch((err: unknown) => onError(toMessage(err)));
};

window.animoImportCommit = function animoImportCommit(
  sessionId,
  isXlsx,
  onSuccess,
  onError,
) {
  const route = isXlsx ? "xlsx" : "csv";
  fetch(`${apiBase()}/import/${route}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ sessionId }),
  })
    .then(jsonOrErrorMessage)
    .then((data) => onSuccess(data as CommitResponse))
    .catch((err: unknown) => onError(toMessage(err)));
};

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Import failed";
}

export {};
