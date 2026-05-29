// =====================================================================================================================
// Demo-mode in-browser API — a tiny self-contained fetch handler that mimics
// the Rust backend just well enough for the Netlify demo.
// =====================================================================================================================
//
// Why not XMLUI's built-in MSW interceptor?
//   We tried that first. XMLUI registers the service worker inside React's
//   useEffect after `startApp` runs, and early DataSource requests can hit the
//   static Netlify host and gets HTML back. The `waitForApiInterceptor` prop
//   that would block children rendering until MSW is up isn't exposed
//   through `startApp`. Monkey-patching `window.fetch` synchronously in
//   index.ts before `startApp` sidesteps the issue entirely.
//
// Storage:
//   * Initial seed (4 weeks of entries, 2 clients × 2 projects, 5 tags) is
//     generated relative to "today" at first launch, then snapshotted to
//     localStorage on every mutation.
//   * To reset the demo, clear site data in the browser dev tools.

const STORAGE_KEY = "animo-demo-state-v2";

// ---------------------------------------------------------------------------------------------------------------------
// Types — mirror the Rust API JSON shapes the frontend already consumes.
// ---------------------------------------------------------------------------------------------------------------------

type Client = { id: string; name: string; color: string };
type Project = {
  id: string;
  name: string;
  color: string;
  clientId: string | null;
  hourlyRate: number | null;
  currency: string | null;
};
type Tag = { id: string; name: string; color: string };
type TimeEntry = {
  id: string;
  projectId: string | null;
  description: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  billable: boolean;
  tagIds: string[];
};
type UserPreferences = {
  id: number;
  userId: string;
  theme: string;
  uiDensity: string;
  dateFormat: string;
  timeFormat: string;
  preferencesJson: string;
  createdAt: string;
  updatedAt: string;
};
type LocalUser = {
  id: string;
  name: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  preferences: UserPreferences;
};

type DemoState = {
  user: LocalUser;
  clients: Client[];
  projects: Project[];
  tags: Tag[];
  timeEntries: TimeEntry[];
  nextId: number;
};

// ---------------------------------------------------------------------------------------------------------------------
// Seed-data generator
// ---------------------------------------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function isoAt(daysAgo: number, hh: number, mm: number): string {
  // Build a "naive UTC" ISO string whose date + clock portions read exactly
  // as `<today minus daysAgo>` at `hh:mm`. The WeekCalendar / List screens
  // slice the raw ISO (`startTime.slice(11, 16)`) instead of converting to
  // local time, so the stored value has to already look like the visitor's
  // wall clock. Using setHours/setUTCHours both miss this in CEST — one
  // shifts the date, the other shifts the displayed hour.
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${ymd}T${pad2(hh)}:${pad2(mm)}:00.000Z`;
}

function isoEnd(startIso: string, durationSec: number): string {
  // Parse the naive ISO as if it were UTC, add the duration, then re-emit.
  // Math stays in UTC space, so we don't accidentally re-introduce a TZ shift.
  const end = new Date(new Date(startIso).getTime() + durationSec * 1000);
  return end.toISOString();
}

function buildSeedState(): DemoState {
  const now = new Date().toISOString();
  const user: LocalUser = {
    id: "demo-user",
    name: "Demo User",
    username: "demo",
    createdAt: now,
    updatedAt: now,
    preferences: {
      id: 1,
      userId: "demo-user",
      theme: "system",
      uiDensity: "comfortable",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      preferencesJson: "{}",
      createdAt: now,
      updatedAt: now,
    },
  };

  // All colors below come from the Animo brand palette
  // (see app/src/themes/tracker-theme.ts). Picked so that adjacent
  // categories don't share a hue and the calendar/Reports charts
  // read at a glance.
  const clients: Client[] = [
    { id: "c1", name: "Acme Corp", color: "#3F8F8C" }, // Sage Teal
    { id: "c2", name: "Globex Inc.", color: "#F2A82F" }, // Warm Amber
  ];
  const projects: Project[] = [
    { id: "p1", name: "Website Redesign", color: "#3F8F8C", clientId: "c1", hourlyRate: 120, currency: "USD" }, // Sage Teal
    { id: "p2", name: "Platform API", color: "#A7D0C9", clientId: "c1", hourlyRate: 140, currency: "USD" }, // Soft Mint
    { id: "p3", name: "Internal Tools", color: "#1E2328", clientId: "c2", hourlyRate: null, currency: null }, // Deep Charcoal
    { id: "p4", name: "Mobile Companion", color: "#FF6F61", clientId: "c2", hourlyRate: 110, currency: "EUR" }, // Soft Coral
  ];
  const tags: Tag[] = [
    { id: "t1", name: "frontend", color: "#3F8F8C" }, // Sage Teal
    { id: "t2", name: "backend", color: "#A7D0C9" }, // Soft Mint
    { id: "t3", name: "meeting", color: "#F2A82F" }, // Warm Amber
    { id: "t4", name: "design", color: "#FF6F61" }, // Soft Coral
    { id: "t5", name: "bugfix", color: "#1E2328" }, // Deep Charcoal
  ];

  const tagPools: string[][] = [
    ["t1", "t4"],
    ["t2", "t5"],
    ["t1", "t3"],
    ["t2"],
    ["t3"],
  ];
  const descPool: Record<string, string[]> = {
    p1: ["Homepage redesign", "Pricing page tweaks", "Component library audit", "A/B test wiring"],
    p2: ["Auth flow refactor", "Session expiry bug", "Rate-limiter tuning", "Migration backfill"],
    p3: ["Onboarding flow", "Dashboard polish", "Empty-state illustrations", "Search UX pass"],
    p4: ["API integration", "Webhook retries", "Audit log endpoints", "Background job cleanup"],
  };

  const rand = mulberry32(20260518);
  const projectIds = projects.map((p) => p.id);
  const timeEntries: TimeEntry[] = [];
  let nextId = 1;
  const HORIZON_DAYS = 60; // ~2 months back through today; weekends are skipped below

  // Walk from the furthest day forward to today so IDs come out in
  // chronological order and Reports lists them naturally.
  for (let daysAgo = HORIZON_DAYS; daysAgo >= 0; daysAgo--) {
    const ref = new Date();
    ref.setHours(0, 0, 0, 0);
    ref.setDate(ref.getDate() - daysAgo);
    const dow = ref.getDay(); // 0 = Sun, 6 = Sat
    if (dow === 0 || dow === 6) continue; // weekdays only — keeps the calendar tidy

    const entriesToday = 2 + Math.floor(rand() * 2);
    let hour = 9;
    for (let i = 0; i < entriesToday; i++) {
      const projectId = projectIds[Math.floor(rand() * projectIds.length)];
      const tagIds = tagPools[Math.floor(rand() * tagPools.length)].slice();
      const description = descPool[projectId][Math.floor(rand() * descPool[projectId].length)];
      const durationMin = 45 + Math.floor(rand() * 90);
      const durationSec = durationMin * 60;
      const startTime = isoAt(daysAgo, hour, Math.floor(rand() * 30));
      const endTime = isoEnd(startTime, durationSec);
      const billable = projectId !== "p3";
      timeEntries.push({
        id: "e" + nextId++,
        projectId,
        description,
        startTime,
        endTime,
        durationSeconds: durationSec,
        billable,
        tagIds,
      });
      hour += Math.ceil(durationMin / 60) + 1;
    }
  }

  return { user, clients, projects, tags, timeEntries, nextId };
}

// ---------------------------------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------------------------------

let state: DemoState | null = null;

function loadState(): DemoState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed && Array.isArray(parsed.timeEntries)) {
        if (!parsed.user) parsed.user = buildSeedState().user;
        state = parsed;
        return state;
      }
    }
  } catch {
    // Corrupt cache — fall through to fresh seed.
  }
  state = buildSeedState();
  saveState();
  return state;
}

function saveState() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private-mode failures aren't fatal for the demo.
  }
}

function nextId(prefix: string): string {
  const s = loadState();
  const id = prefix + s.nextId++;
  saveState();
  return id;
}

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(message = "not found"): Response {
  return json({ error: message }, 404);
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function parseUrl(url: string): { path: string; query: URLSearchParams } {
  const u = new URL(url, "http://demo.local");
  let path = u.pathname.replace(/^\/api/, "");
  if (path === "") path = "/";
  return { path, query: u.searchParams };
}

async function readJson<T>(init: RequestInit | undefined): Promise<T | null> {
  const body = init?.body;
  if (body == null) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }
  if (body instanceof Blob) {
    const text = await body.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function withinRange(iso: string, from: string | null, to: string | null): boolean {
  const day = (iso || "").slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function enrichEntry(entry: TimeEntry, projects: Project[], clients: Client[]) {
  const project = projects.find((p) => p.id === entry.projectId) || null;
  const client = project ? clients.find((c) => c.id === project.clientId) || null : null;
  return {
    id: entry.id,
    projectId: entry.projectId,
    projectName: project ? project.name : null,
    clientName: client ? client.name : null,
    description: entry.description || "",
    startTime: entry.startTime,
    endTime: entry.endTime,
    durationSeconds: entry.durationSeconds || 0,
    billable: !!entry.billable,
    hourlyRate: project ? project.hourlyRate : null,
    currency: project ? project.currency : null,
    tagIds: entry.tagIds || [],
    tag_ids: entry.tagIds || [],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Export helpers (CSV + XLSX)
// ---------------------------------------------------------------------------------------------------------------------

function fmtDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m`;
}

function csvEscape(value: string): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type ExportRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  durationFormatted: string;
  description: string;
  projectName: string;
  clientName: string;
  tags: string;
  billable: boolean;
  hourlyRate: number | null;
  currency: string;
  amount: number | null;
};

function buildExportRows(s: DemoState, query: URLSearchParams): ExportRow[] {
  const from = query.get("from");
  const to = query.get("to");
  const tagNameById = new Map(s.tags.map((t) => [t.id, t.name]));
  return s.timeEntries
    .filter((e) => withinRange(e.startTime, from, to))
    .slice()
    .sort((a, b) => (a.startTime < b.startTime ? -1 : 1))
    .map((e) => {
      const project = s.projects.find((p) => p.id === e.projectId) || null;
      const client = project
        ? s.clients.find((c) => c.id === project.clientId) || null
        : null;
      const amount =
        e.billable && project && project.hourlyRate
          ? Math.round((e.durationSeconds / 3600) * project.hourlyRate * 100) / 100
          : null;
      return {
        id: e.id,
        date: (e.startTime || "").slice(0, 10),
        startTime: (e.startTime || "").slice(11, 19),
        endTime: (e.endTime || "").slice(11, 19),
        durationSeconds: e.durationSeconds || 0,
        durationFormatted: fmtDuration(e.durationSeconds || 0),
        description: e.description || "",
        projectName: project ? project.name : "",
        clientName: client ? client.name : "",
        tags: (e.tagIds || [])
          .map((id) => tagNameById.get(id) || "")
          .filter(Boolean)
          .join(", "),
        billable: !!e.billable,
        hourlyRate: project ? project.hourlyRate : null,
        currency: project && project.currency ? project.currency : "",
        amount,
      };
    });
}

function buildCsvExport(s: DemoState, query: URLSearchParams): Response {
  const from = query.get("from") || "";
  const to = query.get("to") || "";
  const rows = buildExportRows(s, query);
  const header = [
    "entry_id",
    "date",
    "start_time",
    "end_time",
    "duration_seconds",
    "duration_formatted",
    "description",
    "project_name",
    "client_name",
    "tags",
    "billable",
    "hourly_rate",
    "currency",
    "amount",
  ];
  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.date),
        csvEscape(r.startTime),
        csvEscape(r.endTime),
        String(r.durationSeconds),
        csvEscape(r.durationFormatted),
        csvEscape(r.description),
        csvEscape(r.projectName),
        csvEscape(r.clientName),
        csvEscape(r.tags),
        r.billable ? "true" : "false",
        r.hourlyRate != null ? r.hourlyRate.toFixed(2) : "",
        csvEscape(r.currency),
        r.amount != null ? r.amount.toFixed(2) : "",
      ].join(","),
    );
  }
  const body = lines.join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="animo_export_${from}_${to}.csv"`,
    },
  });
}

async function buildXlsxExport(s: DemoState, query: URLSearchParams): Promise<Response> {
  // Dynamic import so the XLSX writer only ships in the demo bundle when
  // an XLSX download is actually requested.
  const { default: writeXlsxFile, getSheetData } = await import("write-excel-file/browser");
  type WriteXlsxFile = typeof writeXlsxFile;
  type SheetArg = Parameters<WriteXlsxFile>[0];
  type SheetData = ReturnType<typeof getSheetData>;
  type Cell = SheetData[number][number];

  const from = query.get("from") || "";
  const to = query.get("to") || "";
  const rows = buildExportRows(s, query);

  // Columns mirror the CSV export so the demo round-trips through the
  // import pipeline the same way the desktop output does.
  const entriesData: SheetData = getSheetData(rows, [
    { header: "entry_id", cell: (r) => r.id },
    { header: "date", cell: (r) => r.date },
    { header: "start_time", cell: (r) => r.startTime },
    { header: "end_time", cell: (r) => r.endTime },
    { header: "duration_seconds", cell: (r) => ({ value: r.durationSeconds, type: Number }) },
    { header: "duration_formatted", cell: (r) => r.durationFormatted },
    { header: "description", cell: (r) => r.description },
    { header: "project_name", cell: (r) => r.projectName },
    { header: "client_name", cell: (r) => r.clientName },
    { header: "tags", cell: (r) => r.tags },
    { header: "billable", cell: (r) => ({ value: r.billable, type: Boolean }) },
    {
      header: "hourly_rate",
      cell: (r) =>
        r.hourlyRate != null
          ? ({ value: r.hourlyRate, type: Number, format: "0.00" } as Cell)
          : null,
    },
    { header: "currency", cell: (r) => r.currency },
    {
      header: "amount",
      cell: (r) =>
        r.amount != null
          ? ({ value: r.amount, type: Number, format: "0.00" } as Cell)
          : null,
    },
  ]);

  // Summary sheet — small pivot to match the desktop XLSX layout.
  const totalSeconds = rows.reduce((acc, r) => acc + r.durationSeconds, 0);
  const billableSeconds = rows
    .filter((r) => r.billable)
    .reduce((acc, r) => acc + r.durationSeconds, 0);
  const projectTotals = new Map<string, number>();
  for (const r of rows) {
    const key = r.projectName || "(no project)";
    projectTotals.set(key, (projectTotals.get(key) || 0) + r.durationSeconds);
  }
  const currencyTotals = new Map<string, number>();
  for (const r of rows) {
    if (!r.billable || r.amount == null || !r.currency) continue;
    currencyTotals.set(r.currency, (currencyTotals.get(r.currency) || 0) + r.amount);
  }

  const bold = (value: string): Cell => ({ value, type: String, fontWeight: "bold" });
  const summaryData: SheetData = [
    [bold("Range"), `${from} → ${to}`],
    [bold("Total hours"), fmtDuration(totalSeconds)],
    [bold("Billable hours"), fmtDuration(billableSeconds)],
    [],
    [bold("Project"), bold("Hours")],
  ];
  for (const [name, secs] of Array.from(projectTotals.entries()).sort()) {
    summaryData.push([name, fmtDuration(secs)]);
  }
  if (currencyTotals.size > 0) {
    summaryData.push([]);
    summaryData.push([bold("Currency"), bold("Amount")]);
    for (const [cur, amount] of Array.from(currencyTotals.entries()).sort()) {
      summaryData.push([
        cur,
        { value: Math.round(amount * 100) / 100, type: Number, format: "0.00" } as Cell,
      ]);
    }
  }

  const sheets = [
    { data: entriesData, sheet: "Entries" },
    { data: summaryData, sheet: "Summary" },
  ] as unknown as SheetArg;
  const blob = await writeXlsxFile(sheets).toBlob();

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="animo_export_${from}_${to}.xlsx"`,
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------------------------------------------------

async function handle(method: string, path: string, query: URLSearchParams, init?: RequestInit): Promise<Response> {
  const s = loadState();

  // ----- local user -----
  if (path === "/user/bootstrap" && method === "GET") {
    return json({ setupComplete: true, user: s.user });
  }
  if (path === "/user/bootstrap" && method === "POST") {
    return json({ error: "conflict: user already exists" }, 409);
  }
  if (path === "/user/me" && method === "GET") return json(s.user);
  if (path === "/user/me" && method === "PATCH") {
    const body = (await readJson<Partial<LocalUser> & { preferences?: Partial<UserPreferences> }>(init)) || {};
    s.user = {
      ...s.user,
      name: body.name || s.user.name,
      username: body.username || s.user.username,
      updatedAt: new Date().toISOString(),
      preferences: body.preferences
        ? { ...s.user.preferences, ...body.preferences, updatedAt: new Date().toISOString() }
        : s.user.preferences,
    };
    saveState();
    return json(s.user);
  }

  // ----- clients -----
  if (path === "/clients" && method === "GET") return json(s.clients);
  if (path === "/clients" && method === "POST") {
    const body = (await readJson<Partial<Client>>(init)) || {};
    const client: Client = {
      id: nextId("c"),
      name: body.name || "Untitled client",
      color: body.color || "#64748b",
    };
    s.clients.push(client);
    saveState();
    return json(client);
  }
  {
    const m = path.match(/^\/clients\/([^/]+)$/);
    if (m) {
      const id = m[1];
      const idx = s.clients.findIndex((c) => c.id === id);
      if (idx < 0) return notFound("client not found");
      if (method === "PATCH") {
        const body = (await readJson<Partial<Client>>(init)) || {};
        s.clients[idx] = { ...s.clients[idx], ...body, id };
        saveState();
        return json(s.clients[idx]);
      }
      if (method === "DELETE") {
        s.clients.splice(idx, 1);
        saveState();
        return json({ ok: true });
      }
    }
  }

  // ----- projects -----
  if (path === "/projects" && method === "GET") return json(s.projects);
  if (path === "/projects" && method === "POST") {
    const body = (await readJson<Partial<Project>>(init)) || {};
    const project: Project = {
      id: nextId("p"),
      name: body.name || "Untitled project",
      color: body.color || "#6366f1",
      clientId: body.clientId || null,
      hourlyRate: body.hourlyRate ?? null,
      currency: body.currency ?? null,
    };
    s.projects.push(project);
    saveState();
    return json(project);
  }
  {
    const m = path.match(/^\/projects\/([^/]+)$/);
    if (m) {
      const id = m[1];
      const idx = s.projects.findIndex((p) => p.id === id);
      if (idx < 0) return notFound("project not found");
      if (method === "PATCH") {
        const body = (await readJson<Partial<Project>>(init)) || {};
        s.projects[idx] = { ...s.projects[idx], ...body, id };
        saveState();
        return json(s.projects[idx]);
      }
      if (method === "DELETE") {
        s.projects.splice(idx, 1);
        saveState();
        return json({ ok: true });
      }
    }
  }

  // ----- tags -----
  if (path === "/tags" && method === "GET") return json(s.tags);
  if (path === "/tags" && method === "POST") {
    const body = (await readJson<Partial<Tag>>(init)) || {};
    const tag: Tag = {
      id: nextId("t"),
      name: body.name || "Untitled tag",
      color: body.color || "#64748b",
    };
    s.tags.push(tag);
    saveState();
    return json(tag);
  }
  {
    const m = path.match(/^\/tags\/([^/]+)$/);
    if (m) {
      const id = m[1];
      const idx = s.tags.findIndex((t) => t.id === id);
      if (idx < 0) return notFound("tag not found");
      if (method === "PATCH") {
        const body = (await readJson<Partial<Tag>>(init)) || {};
        s.tags[idx] = { ...s.tags[idx], ...body, id };
        saveState();
        return json(s.tags[idx]);
      }
      if (method === "DELETE") {
        s.tags.splice(idx, 1);
        saveState();
        return json({ ok: true });
      }
    }
  }

  // ----- time entries -----
  if (path === "/time-entries" && method === "GET") {
    const from = query.get("from");
    const to = query.get("to");
    const rows = s.timeEntries
      .filter((e) => withinRange(e.startTime, from, to))
      .slice()
      .sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
    return json(rows);
  }
  if (path === "/time-entries" && method === "POST") {
    const body = (await readJson<Partial<TimeEntry>>(init)) || {};
    if (!body.startTime || !body.endTime) return badRequest("startTime and endTime are required");
    const durationSeconds =
      body.durationSeconds ??
      Math.max(
        0,
        Math.round((new Date(body.endTime).getTime() - new Date(body.startTime).getTime()) / 1000),
      );
    const entry: TimeEntry = {
      id: nextId("e"),
      projectId: body.projectId || null,
      description: body.description || "",
      startTime: body.startTime,
      endTime: body.endTime,
      durationSeconds,
      billable: !!body.billable,
      tagIds: Array.isArray(body.tagIds) ? [...body.tagIds] : [],
    };
    s.timeEntries.push(entry);
    saveState();
    return json(entry);
  }
  {
    const m = path.match(/^\/time-entries\/([^/]+)$/);
    if (m) {
      const id = m[1];
      const idx = s.timeEntries.findIndex((e) => e.id === id);
      if (idx < 0) return notFound("time entry not found");
      if (method === "PATCH") {
        const body = (await readJson<Partial<TimeEntry>>(init)) || {};
        const merged: TimeEntry = { ...s.timeEntries[idx], ...body, id };
        if (merged.startTime && merged.endTime) {
          merged.durationSeconds = Math.max(
            0,
            Math.round(
              (new Date(merged.endTime).getTime() - new Date(merged.startTime).getTime()) / 1000,
            ),
          );
        }
        if (Array.isArray(body.tagIds)) merged.tagIds = body.tagIds;
        s.timeEntries[idx] = merged;
        saveState();
        return json(merged);
      }
      if (method === "DELETE") {
        s.timeEntries.splice(idx, 1);
        saveState();
        return json({ ok: true });
      }
    }
  }

  // ----- reports / export -----
  // Mirror the Rust backend's CSV/XLSX shape so a demo download is
  // indistinguishable from the desktop one.
  if (path === "/reports/export.csv" && method === "GET") {
    return buildCsvExport(s, query);
  }
  if (path === "/reports/export.xlsx" && method === "GET") {
    return await buildXlsxExport(s, query);
  }

  // ----- reports -----
  if (path === "/reports/summary" && method === "GET") {
    const from = query.get("from");
    const to = query.get("to");
    const filtered = s.timeEntries
      .filter((e) => withinRange(e.startTime, from, to))
      .slice()
      .sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
    const enriched = filtered.map((e) => enrichEntry(e, s.projects, s.clients));

    const totalSeconds = enriched.reduce((acc, e) => acc + e.durationSeconds, 0);
    const billableSeconds = enriched.reduce(
      (acc, e) => acc + (e.billable ? e.durationSeconds : 0),
      0,
    );

    const daily: { date: string; seconds: number }[] = [];
    if (from && to) {
      const start = new Date(from + "T00:00:00Z");
      const end = new Date(to + "T00:00:00Z");
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const seconds = enriched
          .filter((e) => (e.startTime || "").slice(0, 10) === iso)
          .reduce((acc, e) => acc + e.durationSeconds, 0);
        daily.push({ date: iso, seconds });
      }
    }

    const amountByCurrency: Record<string, number> = {};
    for (const e of enriched) {
      if (!e.billable || !e.hourlyRate || !e.currency) continue;
      amountByCurrency[e.currency] =
        (amountByCurrency[e.currency] || 0) + (e.durationSeconds / 3600) * e.hourlyRate;
    }
    const amounts = Object.entries(amountByCurrency).map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    }));

    return json({ totalSeconds, billableSeconds, daily, entries: enriched, amounts });
  }

  return notFound(`no demo handler for ${method} ${path}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Public entry point — install at boot via index.ts
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Monkey-patches `window.fetch` so any request to `/api/*` is served by the
 * demo handler. Other requests pass through unchanged. Idempotent: only
 * installs once even if called multiple times.
 */
export function installDemoApi() {
  const w = window as Window & { __ANIMO_DEMO_API_INSTALLED__?: boolean };
  if (w.__ANIMO_DEMO_API_INSTALLED__) return;
  w.__ANIMO_DEMO_API_INSTALLED__ = true;

  // Eagerly load (or seed) state so the first request doesn't pay the cost.
  loadState();

  const origFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    // Match relative `/api/...` and the absolute form some XMLUI internals use.
    const looksLikeApi = /(?:^|\/\/[^/]+)\/api\//.test(url);
    // Feedback must reach the real Netlify function even in the demo — reports
    // from people clicking around the demo are valuable, so let the feedback
    // POST bypass the mock and hit getanimo.app/api/feedback for real.
    const isFeedback = /\/api\/feedback(?:[/?]|$)/.test(url);
    if (!looksLikeApi || isFeedback) {
      return origFetch(input, init);
    }
    const method = (
      init?.method || (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const { path, query } = parseUrl(url);
    try {
      return await handle(method, path, query, init);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "demo handler error" }, 500);
    }
  };
}
