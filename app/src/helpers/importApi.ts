// =====================================================================================================================
// importApi — CSV/XLSX import preview + commit.
// =====================================================================================================================
//
// Two entrypoints:
//   - importPreview(file, formatHint) POSTs the file (and optional
//     source_format) to /api/import/{csv,xlsx}/preview, picked by extension.
//   - importCommit(sessionId, isXlsx) POSTs the sessionId to
//     /api/import/{csv,xlsx}/commit.
//
// Both resolve with the parsed JSON and reject with an Error carrying a
// human-readable message from either the network layer or the backend's
// `{ "error": "..." }` envelope.

import { apiBase } from "../lib/api";

export type PreviewResponse = {
  sessionId: string;
  format: string;
  totalRows: number;
  validRows: number;
  duplicateWarnings: number;
  errorRows: { row: number; message: string }[];
  entitiesToCreate: { clients: string[]; projects: string[]; tags: string[] };
};

export type CommitResponse = {
  entriesCreated: number;
  clientsCreated: number;
  projectsCreated: number;
  tagsCreated: number;
  duplicatesSkipped: number;
};

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

export async function importPreview(
  file: File,
  formatHint: string | null,
): Promise<PreviewResponse> {
  const fd = new FormData();
  fd.append("file", file);
  if (formatHint && formatHint !== "auto") {
    fd.append("source_format", formatHint);
  }
  const route = isXlsxFile(file) ? "xlsx" : "csv";
  try {
    const response = await fetch(`${apiBase()}/import/${route}/preview`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    return (await jsonOrErrorMessage(response)) as PreviewResponse;
  } catch (err) {
    throw new Error(toMessage(err));
  }
}

export async function importCommit(
  sessionId: string,
  isXlsx: boolean,
): Promise<CommitResponse> {
  const route = isXlsx ? "xlsx" : "csv";
  try {
    const response = await fetch(`${apiBase()}/import/${route}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sessionId }),
    });
    return (await jsonOrErrorMessage(response)) as CommitResponse;
  } catch (err) {
    throw new Error(toMessage(err));
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Import failed";
}

