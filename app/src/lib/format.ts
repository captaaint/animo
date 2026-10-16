// Shared formatters and view-model builders (formerly Globals.xs).
//
// Time convention: the app stores ISO timestamps whose HH:MM is meant to be
// read as wall-clock time ("fake UTC") — `combineDateTime` builds them from
// the local date/time fields and every display path slices the HH:MM back out
// of the string. Keep new code on these helpers so the convention holds.

import type { Client, Project, ReportEntry, Tag, TimeEntry } from "./types";

export const NO_PROJECT_COLOR = "#C2BDB7";

export function pageTitleFromPath(path: string): string {
  switch (path || "/") {
    case "/projects":
      return "Projects";
    case "/clients":
      return "Clients";
    case "/tags":
      return "Tags";
    case "/import":
      return "Import";
    case "/reports":
      return "Reports";
    case "/list":
      return "List";
    case "/settings":
      return "Settings";
    default:
      return "Calendar";
  }
}

export function userInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function toIsoDate(d: Date | string | number): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function combineDateTime(dateStr: string, timeStr: string): string {
  const t = (timeStr || "").length === 5 ? timeStr + ":00" : timeStr;
  return new Date(dateStr + "T" + t + "Z").toISOString();
}

export function durationSeconds(startIso: string, endIso: string): number {
  return Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000),
  );
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + "h " + (m < 10 ? "0" + m : m) + "m";
}

export function formatDurationCompact(seconds: number): string {
  const h = Math.floor((seconds || 0) / 3600);
  const m = Math.floor(((seconds || 0) % 3600) / 60);
  if (h <= 0) return m + "m";
  return h + "h " + m + "m";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDatePart(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return d.getUTCFullYear() + ". " + (d.getUTCMonth() + 1) + ". " + d.getUTCDate() + ".";
}

export function formatDayPart(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return "(" + WEEKDAYS[d.getUTCDay()] + ")";
}

export function formatMonthDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
}

export function projectName(projectId: string | null | undefined, projects: Project[]): string {
  if (!projectId) return "(no project)";
  const p = projects.find((pp) => pp.id === projectId);
  return p ? p.name : "(unknown)";
}

// Fallback color when a time entry has no project or the project was
// deleted. Surface-300 from the Animo palette keeps the bullet visible
// without competing with real project colors.
export function projectColor(projectId: string | null | undefined, projects: Project[]): string {
  if (!projectId) return NO_PROJECT_COLOR;
  const p = projects.find((pp) => pp.id === projectId);
  return p ? p.color : NO_PROJECT_COLOR;
}

export function mondayOfWeek(d: Date | string): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function shiftDate(iso: string, days: number): string {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type PickerProject = Project & { clientName: string };

export function projectsForPicker(projects: Project[], clients: Client[]): PickerProject[] {
  const cmap: Record<string, string> = {};
  for (const c of clients) cmap[c.id] = c.name;
  return projects.map((p) => ({
    ...p,
    clientName: p.clientId ? cmap[p.clientId] || "Unknown" : "No client",
  }));
}

export function dayTotalSeconds(entries: TimeEntry[], dayIso: string): number {
  return entries
    .filter((e) => e.startTime.slice(0, 10) === dayIso)
    .reduce((s, e) => s + durationSeconds(e.startTime, e.endTime), 0);
}

export function weekTotalSeconds(entries: TimeEntry[], weekStartIso: string): number {
  const weekEnd = shiftDate(weekStartIso, 7);
  return entries
    .filter((e) => {
      const d = e.startTime.slice(0, 10);
      return d >= weekStartIso && d < weekEnd;
    })
    .reduce((s, e) => s + durationSeconds(e.startTime, e.endTime), 0);
}

export type ListEntry = TimeEntry & { projectName: string; durationSeconds: number };

export type DayGroup = { date: string; entries: ListEntry[]; totalSec: number };

export function entriesForListTable(entries: TimeEntry[], projects: Project[]): ListEntry[] {
  return entries.map((e) => ({
    ...e,
    projectName: projectName(e.projectId, projects),
    durationSeconds: durationSeconds(e.startTime, e.endTime),
  }));
}

export function groupEntriesByDay(entries: ListEntry[]): DayGroup[] {
  const groups: Record<string, DayGroup> = {};
  for (const e of entries) {
    const day = e.startTime.slice(0, 10);
    if (!groups[day]) groups[day] = { date: day, entries: [], totalSec: 0 };
    groups[day].entries.push(e);
    groups[day].totalSec += e.durationSeconds;
  }
  for (const g of Object.values(groups)) {
    g.entries.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }
  return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
}

export function tagsForIds(tagIds: string[] | undefined, allTags: Tag[]): Tag[] {
  const map: Record<string, Tag> = {};
  for (const t of allTags) map[t.id] = t;
  return (tagIds || []).map((id) => map[id]).filter(Boolean);
}

// View model for <EntryList> (List and Reports screens). All display
// formatting stays here so the List, Reports and PDF export keep sharing one
// set of formatters; the component only renders. `entry` carries the
// original row so event payloads (open, duplicate, …) stay the raw entry.
export function listViewDays(days: DayGroup[], projects: Project[], tags: Tag[]) {
  return days.map((d) => ({
    date: d.date,
    datePart: formatDatePart(d.date),
    dayPart: formatDayPart(d.date),
    totalText: formatDuration(d.totalSec),
    totalCompact: formatDurationCompact(d.totalSec),
    entries: d.entries.map((e) => ({
      entry: e,
      id: e.id,
      description: e.description || "",
      projectId: e.projectId || null,
      projectName: e.projectName,
      projectColor: projectColor(e.projectId, projects),
      startHm: (e.startTime || "").slice(11, 16),
      endHm: (e.endTime || "").slice(11, 16),
      durationSeconds: e.durationSeconds,
      durationText: formatDuration(e.durationSeconds),
      durationCompact: formatDurationCompact(e.durationSeconds),
      billable: !!e.billable,
      tags: tagsForIds(e.tagIds, tags).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    })),
  }));
}

export function descriptionSuggestions(entries: TimeEntry[]): string[] {
  const seen: Record<string, boolean> = {};
  const rows = entries
    .map((e) => ({ description: (e.description || "").trim(), startTime: e.startTime || "" }))
    .filter((e) => e.description)
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
  const result: string[] = [];
  for (const row of rows) {
    const key = row.description.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    result.push(row.description);
  }
  return result;
}

export function parseTimeToSec(hhmm: string): number {
  if (!hhmm) return 0;
  const parts = String(hhmm).split(":");
  const h = parseInt(parts[0] || "0", 10) || 0;
  const m = parseInt(parts[1] || "0", 10) || 0;
  const s = parseInt(parts[2] || "0", 10) || 0;
  return h * 3600 + m * 60 + s;
}

export function addSecToTime(hhmm: string, seconds: number): string {
  let total = parseTimeToSec(hhmm) + seconds;
  if (total < 0) total = 0;
  if (total >= 86400) total = 86340;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

export function formatHms(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

export function parseHmsToSec(str: string): number {
  if (!str) return 0;
  const parts = String(str)
    .split(":")
    .map((p) => parseInt(p, 10) || 0);
  if (parts.length === 1) return parts[0] * 3600;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function existingTagIdsOnly(tagIds: string[], allTags: Tag[]): string[] {
  const known: Record<string, boolean> = {};
  for (const t of allTags) known[t.id] = true;
  return tagIds.filter((id) => known[id]);
}

export function applyReportFilters(
  entries: ReportEntry[],
  projectIds: string[],
  tagIds: string[],
): ReportEntry[] {
  return entries.filter((e) => {
    if (projectIds.length > 0 && projectIds.indexOf(e.projectId as string) === -1) return false;
    if (tagIds.length > 0) {
      const ids = e.tagIds || [];
      // OR-semantics: keep the entry when it matches any of the chosen tags.
      if (!tagIds.some((t) => ids.indexOf(t) !== -1)) return false;
    }
    return true;
  });
}

export type GroupedProjectOption = PickerProject & { keywords: string[] };

export function projectOptionsGroupedByClient(
  projects: Project[],
  clients: Client[],
): GroupedProjectOption[] {
  const clientMap: Record<string, Client> = {};
  for (const c of clients) clientMap[c.id] = c;
  const NO_CLIENT = "No client";
  const list = projects.map((p) => {
    const cName = p.clientId && clientMap[p.clientId] ? clientMap[p.clientId].name : NO_CLIENT;
    return { ...p, clientName: cName, keywords: [cName, p.name] };
  });
  list.sort((a, b) => {
    if (a.clientName === b.clientName) return a.name.localeCompare(b.name);
    if (a.clientName === NO_CLIENT) return 1;
    if (b.clientName === NO_CLIENT) return -1;
    return a.clientName.localeCompare(b.clientName);
  });
  return list;
}

export function sumDurationSeconds(entries: { durationSeconds?: number }[]): number {
  return entries.reduce((s, e) => s + (e.durationSeconds || 0), 0);
}

export function sumBillableSeconds(entries: ReportEntry[]): number {
  return entries.filter((e) => e.billable).reduce((s, e) => s + (e.durationSeconds || 0), 0);
}

export function dailyTotalsFromEntries(
  entries: ReportEntry[],
  fromIso: string,
  toIso: string,
): { date: string; seconds: number }[] {
  const out: { date: string; seconds: number }[] = [];
  let cursor = fromIso;
  // Hard iteration cap: a daily breakdown only makes sense for a bounded range.
  // Without this, an extreme/absurd range (e.g. a far-future year typed into the
  // date picker) — or a malformed date that never reaches `toIso` — would spin
  // this synchronous loop for millions of iterations and freeze the whole app.
  let guard = 0;
  while (cursor <= toIso && guard < 2000) {
    const day = cursor;
    const seconds = entries
      .filter((e) => (e.startTime || "").slice(0, 10) === day)
      .reduce((s, e) => s + (e.durationSeconds || 0), 0);
    out.push({ date: day, seconds });
    cursor = shiftDate(cursor, 1);
    guard++;
  }
  return out;
}

export function rangeAverageSecondsFromDaily(daily: { seconds: number }[]): number {
  if (!daily.length) return 0;
  const total = daily.reduce((s, d) => s + (d.seconds || 0), 0);
  return Math.round(total / daily.length);
}

export function amountsFromEntries(entries: ReportEntry[]): { currency: string; amount: number }[] {
  const map: Record<string, number> = {};
  for (const e of entries) {
    if (!e.billable) continue;
    const rate = e.hourlyRate || 0;
    if (rate <= 0) continue;
    const cur = e.currency || "EUR";
    map[cur] = (map[cur] || 0) + (e.durationSeconds / 3600) * rate;
  }
  return Object.keys(map)
    .sort()
    .map((cur) => ({ currency: cur, amount: Math.round(map[cur] * 100) / 100 }));
}

type Searchable = { description?: string; projectId?: string | null; tagIds?: string[] };

export function entryMatchesSearch(
  entry: Searchable,
  query: string,
  projects: Project[],
  clients: Client[],
  tags: Tag[],
): boolean {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  if ((entry.description || "").toLowerCase().indexOf(q) !== -1) return true;
  if (entry.projectId) {
    const p = projects.find((pp) => pp.id === entry.projectId);
    if (p) {
      if ((p.name || "").toLowerCase().indexOf(q) !== -1) return true;
      if (p.clientId) {
        const c = clients.find((cc) => cc.id === p.clientId);
        if (c && (c.name || "").toLowerCase().indexOf(q) !== -1) return true;
      }
    }
  }
  for (const t of tagsForIds(entry.tagIds, tags)) {
    if ((t.name || "").toLowerCase().indexOf(q) !== -1) return true;
  }
  return false;
}

export function filterEntries<E extends Searchable>(
  entries: E[],
  query: string,
  projects: Project[],
  clients: Client[],
  tags: Tag[],
): E[] {
  return entries.filter((e) => entryMatchesSearch(e, query, projects, clients, tags));
}

export function duplicateEntryPayload(entry: TimeEntry, targetDate?: string) {
  const date = targetDate || toIsoDate(new Date());
  const start = entry.startTime ? entry.startTime.slice(11, 16) : "09:00";
  const end = entry.endTime ? entry.endTime.slice(11, 16) : "10:00";
  return {
    projectId: entry.projectId || null,
    description: entry.description || "",
    startTime: combineDateTime(date, start),
    endTime: combineDateTime(date, end),
  };
}
