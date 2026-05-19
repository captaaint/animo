// =====================================================================================================================
// reportPdf — client-side "Detailed Report" PDF generator (pdfmake)
// =====================================================================================================================
//
// Mounts a single window-global function `window.generateReportPdf(opts, …)`
// that ReportsScreen.xmlui calls in place of the previous backend
// /reports/export.pdf endpoint. The output mirrors the screenshot the user
// shared: a clean, Toggl/Kimai-style detailed report with:
//   - "Detailed Report" headline + date range
//   - Avatar circle (initials) in the top-right
//   - "TOTAL HOURS" big number
//   - Table: TIME ENTRY (description), TAGS, DURATION, DATE,
//     grouped by client and project when the report spans multiple groups
//
// pdfmake is loaded eagerly (one ~600 KB chunk), but the actual rendering
// is deferred to the first call. Roboto (the default vfs font) covers
// Hungarian accents — verified with "Tamás Kapitány".

// pdfmake ships as plain JS without TypeScript types of its own.
// @ts-expect-error — runtime module, types via @types/pdfmake.
import pdfMake from "pdfmake/build/pdfmake.js";
// @ts-expect-error — vfs_fonts is a side-effect bundle, no .d.ts.
import pdfFonts from "pdfmake/build/vfs_fonts.js";

// Both shapes seen in the wild: pdfFonts.pdfMake.vfs (older) and pdfFonts.vfs (newer).
const vfs =
  (pdfFonts as { pdfMake?: { vfs?: unknown }; vfs?: unknown }).pdfMake?.vfs ||
  (pdfFonts as { vfs?: unknown }).vfs;
if (vfs) (pdfMake as { vfs?: unknown }).vfs = vfs;

// =====================================================================================================================
// Public API
// =====================================================================================================================

export type ReportEntryTag = { name: string; color?: string | null };

export type ReportEntry = {
  description: string;
  projectName?: string | null;
  projectColor?: string | null; // hex, e.g. "#7c3aed"
  clientName?: string | null;
  durationSeconds: number;
  date: string; // ISO date "YYYY-MM-DD"
  tags?: ReportEntryTag[];
};

export type ReportPdfOptions = {
  fromDate: string; // "YYYY-MM-DD"
  toDate: string; // "YYYY-MM-DD"
  user: { name?: string; email?: string };
  totalSeconds: number;
  entries: ReportEntry[];
};

type SummaryEntry = {
  id?: string;
  projectId?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  description?: string;
  startTime: string;
  endTime: string;
  durationSeconds?: number;
  tags?: string[];
};

type Project = { id: string; name: string; color?: string | null; clientId?: string | null };
type Client = { id: string; name: string };

type ExportInput = {
  fromDate: string;
  toDate: string;
  user?: { name?: string; email?: string } | null;
  summary: { totalSeconds?: number; entries?: SummaryEntry[] } | null | undefined;
  projects: Project[] | null | undefined;
  clients: Client[] | null | undefined;
};

declare global {
  interface Window {
    generateReportPdf?: (
      opts: ReportPdfOptions,
      onReady: (blobUrl: string) => void,
      onError?: (message: string) => void,
      onProgress?: (ratio: number) => void,
    ) => void;
    exportTimeReport?: (
      input: ExportInput,
      onReady: (blobUrl: string, fileName: string) => void,
      onError?: (message: string) => void,
      onProgress?: (ratio: number) => void,
    ) => void;
  }
}

window.generateReportPdf = function generateReportPdf(opts, onReady, onError, onProgress) {
  try {
    if (onProgress) onProgress(0.1);
    const docDefinition = buildDocDefinition(opts);
    if (onProgress) onProgress(0.6);
    const pdf = (pdfMake as {
      createPdf: (def: unknown) => { getBlob: (cb: (b: Blob) => void) => void };
    }).createPdf(docDefinition);
    pdf.getBlob((blob: Blob) => {
      if (onProgress) onProgress(1);
      const url = URL.createObjectURL(blob);
      onReady(url);
    });
  } catch (e) {
    if (onError) onError((e as Error)?.message || "PDF generation failed");
  }
};

/**
 * Top-level entry point that ReportsScreen.xmlui calls. Pulls projects/clients
 * out of the user's DataSources to enrich each entry with project color and
 * client name (the /reports/summary endpoint already provides projectName,
 * but not the color), then hands off to generateReportPdf.
 *
 * Lives here (not in markup) because XMLScript can't parse multi-line arrow
 * function bodies with braces — see the "Unclosed expression" error history
 * if you're tempted to inline this back into the onClick attribute.
 */
window.exportTimeReport = function exportTimeReport(
  input,
  onReady,
  onError,
  onProgress,
) {
  try {
    const summary = input.summary || {};
    const projects = input.projects || [];
    const clients = input.clients || [];
    const rawEntries = summary.entries || [];

    const enriched: ReportEntry[] = rawEntries.map((e) => {
      const p = projects.find((pp) => pp.id === e.projectId) || null;
      const c =
        (p && p.clientId && clients.find((cc) => cc.id === p.clientId)) ||
        null;
      const dur =
        typeof e.durationSeconds === "number"
          ? e.durationSeconds
          : Math.max(
              0,
              Math.round(
                (new Date(e.endTime).getTime() -
                  new Date(e.startTime).getTime()) /
                  1000,
              ),
            );
      return {
        description: e.description || "",
        projectName: p ? p.name : e.projectName || null,
        projectColor: p ? p.color || null : null,
        clientName: c ? c.name : e.clientName || null,
        durationSeconds: dur,
        date: (e.startTime || "").slice(0, 10),
        tags: (e.tags || []).map((name) => ({ name, color: null })),
      };
    });

    const totalSeconds =
      typeof summary.totalSeconds === "number"
        ? summary.totalSeconds
        : enriched.reduce((acc, e) => acc + e.durationSeconds, 0);

    const fileName = `report_${input.fromDate}_${input.toDate}.pdf`;

    window.generateReportPdf!(
      {
        fromDate: input.fromDate,
        toDate: input.toDate,
        user: input.user || { name: "User", email: "" },
        totalSeconds,
        entries: enriched,
      },
      (blobUrl) => onReady(blobUrl, fileName),
      (msg) => onError && onError(msg),
      onProgress,
    );
  } catch (e) {
    if (onError) onError((e as Error)?.message || "Export failed");
  }
};

// =====================================================================================================================
// Layout — matches the user-supplied screenshot
// =====================================================================================================================

// Animo palette — match web/src/themes/tracker-theme.ts so the PDF and
// the on-screen Reports view sit in the same visual language.
const PRIMARY = "#3F8F8C"; // Sage Teal
const TEXT = "#1E2328"; // Deep Charcoal
const TEXT_MUTED = "#76716D"; // surface-500
const BORDER = "#E0DCD7"; // surface-200
const BORDER_FAINT = "#F0EDEA"; // surface-100
const GROUP_HEADER_BG = "#F7F4F1";
const SQUARE = "■";

function buildDocDefinition(opts: ReportPdfOptions) {
  const totalText = formatHms(opts.totalSeconds);

  return {
    pageSize: "A4",
    pageMargins: [56, 48, 56, 56], // L, T, R, B — generous margins like the screenshot
    info: {
      title: `Detailed Report ${opts.fromDate}${opts.toDate}`,
      author: opts.user.name || opts.user.email || "Time Tracker",
      creator: "Time Tracker",
      producer: "Time Tracker (pdfmake)",
    },
    content: [
      // ---------------------------------------------------------------------------------------------------------------
      // Header band — title + date range on the left, user name on the right
      // ---------------------------------------------------------------------------------------------------------------
      {
        columns: [
          {
            width: "*",
            stack: [
              {
                text: "Detailed Report",
                fontSize: 28,
                bold: true,
                color: TEXT,
                margin: [0, 6, 0, 6],
              },
              {
                text: `${formatDate(opts.fromDate)} – ${formatDate(opts.toDate)}`,
                fontSize: 12,
                color: TEXT_MUTED,
              },
            ],
          },
          {
            width: "auto",
            text: opts.user.name || opts.user.email || "—",
            fontSize: 12,
            color: TEXT,
            alignment: "right",
            margin: [0, 14, 0, 0],
          },
        ],
        columnGap: 16,
      },

      // ---------------------------------------------------------------------------------------------------------------
      // Separator
      // ---------------------------------------------------------------------------------------------------------------
      hr(28),

      // ---------------------------------------------------------------------------------------------------------------
      // TOTAL HOURS block — total time on the left, project/client list on the right
      // ---------------------------------------------------------------------------------------------------------------
      {
        columns: [
          {
            width: "auto",
            stack: [
              {
                text: "TOTAL HOURS",
                fontSize: 9,
                color: TEXT_MUTED,
                characterSpacing: 0.6,
                margin: [0, 0, 0, 6],
              },
              {
                text: splitHmsToRuns(totalText),
                fontSize: 36,
                color: TEXT,
              },
            ],
          },
          {
            width: "*",
            stack: projectClientStack(opts.entries),
          },
        ],
        columnGap: 32,
      },

      hr(28),

      // ---------------------------------------------------------------------------------------------------------------
      // Entries table
      // ---------------------------------------------------------------------------------------------------------------
      {
        // Width ratios chosen to match the screenshot proportions on A4.
        table: {
          widths: ["*", 140, 60, 70],
          headerRows: 1,
          dontBreakRows: true,
          body: buildTableBody(opts.entries),
        },
        layout: tableLayout(),
      },
    ],
    styles: {
      tableHeader: {
        color: TEXT_MUTED,
        fontSize: 9,
        characterSpacing: 0.6,
      },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 11,
      color: TEXT,
      lineHeight: 1.25,
    },
  };
}

// =====================================================================================================================
// Table helpers
// =====================================================================================================================

function buildTableBody(entries: ReportEntry[]) {
  const headerRow = [
    { text: "TIME ENTRY", style: "tableHeader", border: [false, false, false, false] },
    { text: "TAGS", style: "tableHeader", border: [false, false, false, false] },
    { text: "DURATION", style: "tableHeader", border: [false, false, false, false] },
    { text: "DATE", style: "tableHeader", border: [false, false, false, false] },
  ];

  if (entries.length === 0) {
    return [
      headerRow,
      [
        {
          text: "No entries in this date range.",
          colSpan: 4,
          color: TEXT_MUTED,
          italics: true,
          alignment: "center",
          margin: [0, 18, 0, 18],
        },
        {},
        {},
        {},
      ],
    ];
  }

  const grouped = groupEntriesByClientAndProject(entries);
  const shouldGroup =
    grouped.length > 1 ||
    grouped.some((clientGroup) => clientGroup.projects.length > 1);

  const rows = shouldGroup
    ? grouped.flatMap((clientGroup) => clientGroupRows(clientGroup))
    : entries.map(entryRow);

  return [headerRow, ...rows];
}

type ProjectEntryGroup = {
  name: string;
  color: string | null;
  clientName: string;
  entries: ReportEntry[];
};

type ClientEntryGroup = {
  name: string;
  projects: ProjectEntryGroup[];
};

function groupEntriesByClientAndProject(entries: ReportEntry[]): ClientEntryGroup[] {
  const clientMap = new Map<string, ClientEntryGroup>();

  for (const entry of entries) {
    const clientName = entry.clientName || "(no client)";
    const projectName = entry.projectName || "(no project)";
    const clientKey = clientName.toLocaleLowerCase();
    const projectKey = projectName.toLocaleLowerCase();

    let clientGroup = clientMap.get(clientKey);
    if (!clientGroup) {
      clientGroup = { name: clientName, projects: [] };
      clientMap.set(clientKey, clientGroup);
    }

    let projectGroup = clientGroup.projects.find(
      (group) => group.name.toLocaleLowerCase() === projectKey,
    );
    if (!projectGroup) {
      projectGroup = {
        name: projectName,
        color: entry.projectColor || null,
        clientName,
        entries: [],
      };
      clientGroup.projects.push(projectGroup);
    }

    projectGroup.entries.push(entry);
  }

  return Array.from(clientMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  ).map((clientGroup) => ({
    ...clientGroup,
    projects: clientGroup.projects.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    ),
  }));
}

function clientGroupRows(group: ClientEntryGroup) {
  const rows: unknown[][] = [];

  for (const project of group.projects) {
    rows.push(projectHeaderRow(project));
    rows.push(...project.entries.map(entryRow));
  }

  return rows;
}

function projectHeaderRow(project: ProjectEntryGroup) {
  return [
    {
      stack: [
        {
          text: [
            { text: `${SQUARE}  `, color: project.color || PRIMARY },
            { text: project.name, bold: true, color: TEXT },
          ],
        },
        {
          text: project.clientName,
          color: TEXT_MUTED,
          fontSize: 8,
          margin: [14, 0, 0, 0],
        },
      ],
      colSpan: 2,
      fillColor: GROUP_HEADER_BG,
      margin: [6, 2, 0, 2],
    },
    { text: "", fillColor: GROUP_HEADER_BG },
    {
      text: formatHms(sumEntrySeconds(project.entries)),
      color: TEXT_MUTED,
      bold: true,
      fillColor: GROUP_HEADER_BG,
      margin: [0, 7, 6, 0],
    },
    { text: "", fillColor: GROUP_HEADER_BG, margin: [0, 2, 6, 2] },
  ];
}

function entryRow(e: ReportEntry) {
  return [
    timeEntryCell(e),
    tagsCell(e.tags || []),
    { text: formatHms(e.durationSeconds), color: TEXT, alignment: "left" },
    { text: formatDate(e.date), color: TEXT, alignment: "left" },
  ];
}

function sumEntrySeconds(entries: ReportEntry[]) {
  return entries.reduce((acc, entry) => acc + entry.durationSeconds, 0);
}

/**
 * Tags cell — each tag rendered as a coloured square plus name, matching the
 * tag's colour from the in-app list. pdfmake's inline text array supports
 * mixed colours within one logical paragraph, so tags wrap as a single run.
 */
function tagsCell(tags: ReportEntryTag[]) {
  if (!tags.length) {
    return { text: "—", color: TEXT_MUTED, fontSize: 11 };
  }
  const runs: unknown[] = [];
  tags.forEach((t, i) => {
    if (i > 0) runs.push({ text: "  ", color: TEXT });
    runs.push({ text: `${SQUARE} `, color: t.color || TEXT_MUTED });
    runs.push({ text: t.name, color: TEXT });
  });
  return { text: runs, fontSize: 11 };
}

/**
 * The leftmost cell — just the description text. Project and client info
 * has moved to the header (next to TOTAL HOURS) so the table stays compact.
 */
function timeEntryCell(e: ReportEntry) {
  return {
    text: e.description || "(no description)",
    color: TEXT,
    fontSize: 11,
  };
}

/**
 * Builds the right-hand side of the TOTAL HOURS header — a list of
 * project + client pairs found in the report range, deduplicated and stacked
 * vertically (project with its color square, client with a muted square).
 */
function projectClientStack(entries: ReportEntry[]): unknown[] {
  const seen = new Set<string>();
  const pairs: Array<{ projectName: string; projectColor: string | null; clientName: string | null }> = [];
  for (const e of entries) {
    const projectName = e.projectName || "";
    const clientName = e.clientName || "";
    const key = `${projectName}\u0000${clientName}`;
    if (!projectName && !clientName) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      projectName,
      projectColor: e.projectColor || null,
      clientName: clientName || null,
    });
  }
  if (pairs.length === 0) return [];

  const stack: unknown[] = [];
  for (const p of pairs) {
    if (p.projectName) {
      stack.push({
        text: [
          { text: `${SQUARE}  `, color: p.projectColor || PRIMARY },
          { text: p.projectName, color: TEXT },
        ],
        fontSize: 11,
        margin: [0, 0, 0, 2],
      });
    }
    if (p.clientName) {
      stack.push({
        text: [
          { text: `${SQUARE}  `, color: TEXT_MUTED },
          { text: p.clientName, color: TEXT_MUTED },
        ],
        fontSize: 11,
        margin: [0, 0, 0, 6],
      });
    }
  }
  return stack;
}

/**
 * pdfmake table layout — only horizontal lines, very faint; generous padding
 * so each row has the same vertical breathing room as the screenshot.
 */
function tableLayout() {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) => {
      if (i === 0) return 0;
      if (i === 1) return 0.6; // under header
      if (i === node.table.body.length) return 0.6; // closing line
      return 0.4;
    },
    vLineWidth: () => 0,
    hLineColor: (i: number) => (i === 1 ? BORDER : BORDER_FAINT),
    paddingTop: (i: number) => (i === 0 ? 0 : 6),
    paddingBottom: (i: number) => (i === 0 ? 6 : 6),
    paddingLeft: () => 0,
    paddingRight: () => 0,
  };
}

function hr(margin: number) {
  // 595 (A4 width pt) − 56 − 56 = 483 usable width.
  return {
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.6, lineColor: BORDER },
    ],
    margin: [0, margin / 2, 0, margin / 2],
  };
}

/**
 * "12:34:56" → ["12:34:", { text: "56", color: TEXT_MUTED }] so the seconds
 * fade slightly, matching the screenshot's typographic detail.
 */
function splitHmsToRuns(hms: string) {
  const lastColon = hms.lastIndexOf(":");
  if (lastColon < 0) return hms;
  return [
    { text: hms.slice(0, lastColon + 1) },
    { text: hms.slice(lastColon + 1), color: TEXT_MUTED },
  ];
}

function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${pad2(m)}:${pad2(sec)}`;
}

function formatDate(iso: string): string {
  // YYYY-MM-DD → MM/DD/YYYY (matches the screenshot)
  if (!iso || iso.length < 10) return iso || "";
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  return `${m}/${d}/${y}`;
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}
