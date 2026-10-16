import { lazy, Suspense, useMemo, useState } from "react";

import { BarChart } from "../components/BarChart";
import { DatePicker } from "../components/DatePicker/DatePicker";
import { EntryList } from "../components/EntryList/EntryList";
import { PieChart } from "../components/PieChart";
import { downloadBlobUrl, downloadReport } from "../helpers/reportExport";
import {
  amountsFromEntries,
  applyReportFilters,
  dailyTotalsFromEntries,
  entriesForListTable,
  filterEntries,
  formatDuration,
  groupEntriesByDay,
  listViewDays,
  mondayOfWeek,
  NO_PROJECT_COLOR,
  projectOptionsGroupedByClient,
  rangeAverageSecondsFromDaily,
  shiftDate,
  sumBillableSeconds,
  sumDurationSeconds,
  tagsForIds,
} from "../lib/format";
import { useClients, useProjects, useReportSummary, useTags } from "../lib/queries";
import type { Client, Project, ReportEntry, Tag, TimeEntry } from "../lib/types";
import { useIsMobile } from "../lib/useIsMobile";
import { useCurrentUser } from "../lib/user";
import { Button } from "../ui/Button";
import { Card, EmptyState, ProgressBar, Spinner, TextField } from "../ui/controls";
import { Icon, type IconName } from "../ui/Icon";
import { DropdownMenu, Modal } from "../ui/overlays";
import { AutoComplete, Select } from "../ui/Select";
import { toast } from "../ui/toast";
import { useEntryDialogs } from "./Timesheet";

// pdfmake (with its font VFS) and pdf.js are large; load them on first export.
const PdfPreview = lazy(() =>
  import("../components/PdfPreview").then((m) => ({ default: m.PdfPreview })),
);

type SliceBy = "billable" | "project" | "client" | "tag";
type ExportFormat = "pdf" | "csv" | "xlsx";

const SLICE_LABELS: Record<SliceBy, { title: string; button: string }> = {
  billable: { title: "Billable", button: "Billable" },
  project: { title: "Project", button: "Projects" },
  client: { title: "Client", button: "Clients" },
  tag: { title: "Tag", button: "Tags" },
};

const EXPORT_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (XLSX)" },
];

const EXPORT_FORMAT_KEY = "animo:exportFormat";
const DAY_PAGE_SIZE = 7;

function readExportFormat(): ExportFormat {
  try {
    const v = localStorage.getItem(EXPORT_FORMAT_KEY);
    return v === "csv" || v === "xlsx" ? v : "pdf";
  } catch {
    return "pdf";
  }
}

function defaultRange() {
  const from = mondayOfWeek(new Date());
  return { from, to: shiftDate(from, 6) };
}

type Slice = { label: string; seconds: number; color: string };

function distribution(
  sliceBy: SliceBy,
  entries: ReportEntry[],
  projects: Project[],
  clients: Client[],
  tags: Tag[],
): Slice[] {
  if (sliceBy === "billable") {
    const billable = sumBillableSeconds(entries);
    return [
      { label: "Billable", seconds: billable, color: "#3F8F8C" },
      {
        label: "Non-billable",
        seconds: sumDurationSeconds(entries) - billable,
        color: NO_PROJECT_COLOR,
      },
    ];
  }
  const acc = new Map<string, Slice>();
  const add = (key: string, label: string, color: string, seconds: number) => {
    const slot = acc.get(key) ?? { label, seconds: 0, color };
    slot.seconds += seconds;
    acc.set(key, slot);
  };
  for (const e of entries) {
    const secs = e.durationSeconds || 0;
    const project = projects.find((p) => p.id === e.projectId);
    if (sliceBy === "project") {
      if (project) add(project.id, project.name, project.color, secs);
      else add("__none__", "No project", NO_PROJECT_COLOR, secs);
    } else if (sliceBy === "client") {
      const client = project ? clients.find((c) => c.id === project.clientId) : undefined;
      if (client) add(client.id, client.name, client.color, secs);
      else add("__none__", "No client", NO_PROJECT_COLOR, secs);
    } else {
      const entryTags = tagsForIds(e.tagIds, tags);
      if (entryTags.length === 0) add("__none__", "No tag", NO_PROJECT_COLOR, secs);
      for (const t of entryTags) add(t.id, t.name, t.color, secs);
    }
  }
  return [...acc.values()];
}

export function ReportsScreen() {
  const isMobile = useIsMobile();
  const user = useCurrentUser();
  const [range, setRange] = useState(defaultRange);
  // Bumped by "Clear filters" to remount the (uncontrolled) range picker.
  const [rangeKey, setRangeKey] = useState(0);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sliceBy, setSliceBy] = useState<SliceBy>("billable");
  const [exportFormat, setExportFormat] = useState<ExportFormat>(readExportFormat);
  const [dayPage, setDayPage] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; fileName: string } | null>(null);

  const { data: summary } = useReportSummary(range.from, range.to);
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: tags = [] } = useTags();
  const entryDialogs = useEntryDialogs();

  const filtered = useMemo(
    () => applyReportFilters(summary?.entries || [], projectFilter, tagFilter),
    [summary, projectFilter, tagFilter],
  );
  const daily = useMemo(
    () => dailyTotalsFromEntries(filtered, range.from, range.to),
    [filtered, range],
  );
  const dailyChart = daily.map((d) => ({
    day: d.date.slice(5),
    hours: Math.round((d.seconds / 3600) * 100) / 100,
  }));
  const slices = useMemo(
    () => distribution(sliceBy, filtered, projects, clients, tags),
    [sliceBy, filtered, projects, clients, tags],
  );
  const totalSeconds = sumDurationSeconds(filtered);
  const billableSeconds = sumBillableSeconds(filtered);
  const amounts = amountsFromEntries(filtered);

  const searched = useMemo(
    () => filterEntries(filtered, search, projects, clients, tags),
    [filtered, search, projects, clients, tags],
  );
  const grouped = useMemo(
    () => groupEntriesByDay(entriesForListTable(searched, projects)),
    [searched, projects],
  );
  const pageCount = Math.max(1, Math.ceil(grouped.length / DAY_PAGE_SIZE));
  const safePage = Math.min(dayPage, pageCount - 1);
  const pagedDays = useMemo(
    () =>
      listViewDays(
        grouped.slice(safePage * DAY_PAGE_SIZE, (safePage + 1) * DAY_PAGE_SIZE),
        projects,
        tags,
      ),
    [grouped, safePage, projects, tags],
  );

  const defaults = defaultRange();
  const filtersActive =
    projectFilter.length > 0 ||
    tagFilter.length > 0 ||
    range.from !== defaults.from ||
    range.to !== defaults.to;
  const narrowed = !!search || projectFilter.length > 0 || tagFilter.length > 0;

  const clearFilters = () => {
    setProjectFilter([]);
    setTagFilter([]);
    setRange(defaultRange());
    setRangeKey((k) => k + 1);
    setDayPage(0);
  };

  const exportPdf = () => {
    setProgress(0);
    const enriched = filtered.map((e) => {
      const p = projects.find((pp) => pp.id === e.projectId);
      const c = p && clients.find((cc) => cc.id === p.clientId);
      return {
        description: e.description || "",
        projectName: p ? p.name : e.projectName || null,
        projectColor: p ? p.color : null,
        clientName: c ? c.name : e.clientName || null,
        durationSeconds: e.durationSeconds,
        date: (e.startTime || "").slice(0, 10),
        tags: tagsForIds(e.tagIds, tags).map((t) => ({ name: t.name, color: t.color })),
      };
    });
    import("../helpers/reportPdf")
      .then(({ generateReportPdf }) =>
        generateReportPdf(
          {
            fromDate: range.from,
            toDate: range.to,
            user: { name: user.name || "Local User" },
            totalSeconds: sumDurationSeconds(filtered),
            entries: enriched,
          },
          setProgress,
        ),
      )
      .then((url) => {
        setProgress(null);
        setPreview({ url, fileName: `report_${range.from}_${range.to}.pdf` });
      })
      .catch((err: Error) => {
        setProgress(null);
        toast.error("Export failed: " + err.message);
      });
  };

  const runExport = () => {
    if (exportFormat === "pdf") {
      exportPdf();
      return;
    }
    downloadReport(exportFormat, range.from, range.to).catch((err: Error) =>
      toast.error("Export failed: " + err.message),
    );
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const downloadPreview = () => {
    if (!preview) return;
    const { url, fileName } = preview;
    setPreview(null);
    downloadBlobUrl(url, fileName)
      .catch((err: Error) => toast.error("Download failed: " + err.message))
      .finally(() => URL.revokeObjectURL(url));
  };

  const kpis: { icon: IconName; label: string; value: string }[] = [
    { icon: "clock", label: "Total Hours", value: formatDuration(totalSeconds) },
    {
      icon: "file-text",
      label: "Billable Hours",
      value: billableSeconds === 0 ? "—" : formatDuration(billableSeconds),
    },
    {
      icon: "credit-card",
      label: "Amount",
      value:
        amounts.length === 0
          ? "—"
          : amounts.map((a) => a.amount.toFixed(2) + " " + a.currency).join(" + "),
    },
    {
      icon: "trending-up",
      label: "Average Daily Hours",
      value: formatDuration(rangeAverageSecondsFromDaily(daily)),
    },
  ];

  const pagination = grouped.length > DAY_PAGE_SIZE && (
    <div className="pagination">
      <Button
        size="sm"
        variant="ghost"
        themeColor="secondary"
        icon="chevronleft"
        aria-label="Previous page"
        disabled={safePage === 0}
        onClick={() => setDayPage(safePage - 1)}
      />
      {Array.from({ length: pageCount }, (_, i) => i)
        .filter((i) => Math.abs(i - safePage) <= 1)
        .map((i) => (
          <Button
            key={i}
            size="sm"
            variant={i === safePage ? "solid" : "ghost"}
            themeColor={i === safePage ? "primary" : "secondary"}
            label={String(i + 1)}
            onClick={() => setDayPage(i)}
          />
        ))}
      <Button
        size="sm"
        variant="ghost"
        themeColor="secondary"
        icon="chevronright"
        aria-label="Next page"
        disabled={safePage >= pageCount - 1}
        onClick={() => setDayPage(safePage + 1)}
      />
    </div>
  );

  return (
    <div className="page" style={{ padding: "0 var(--animo-space-4)" }}>
      {entryDialogs.dialogs}

      <Modal open={progress !== null} onClose={() => undefined} title="Generating report" maxWidth={420}>
        <div className="stack stack--gap-4">
          <div>Preparing your PDF…</div>
          <ProgressBar value={progress ?? 0} />
          <div className="text-secondary text-small">
            {(progress ?? 0) >= 1 ? "Done" : Math.round((progress ?? 0) * 100) + "%"}
          </div>
        </div>
      </Modal>

      <Modal open={!!preview} onClose={closePreview} maxWidth={980} height="95vh" flush>
        <div className="stack" style={{ height: "100%" }}>
          <div
            style={{
              flex: "1 1 0%",
              minHeight: 0,
              overflowY: "auto",
              padding: 20,
              background: "var(--animo-color-surface-100)",
            }}
          >
            {preview && (
              <Suspense fallback={<Spinner />}>
                <PdfPreview src={preview.url} />
              </Suspense>
            )}
          </div>
          <div className="row" style={{ padding: 12, borderTop: "1px solid var(--animo-color-surface-200)" }}>
            <Button label="Discard" variant="ghost" onClick={closePreview} />
            <span className="spacer" />
            <Button label="Download" icon="download" onClick={downloadPreview} />
          </div>
        </div>
      </Modal>

      {/* Filters: date range + project + tag selectors, then export. */}
      <Card>
        <div className="row row--gap-2 row--wrap row--end">
          <div style={isMobile ? { width: "100%" } : undefined}>
            <DatePicker
              key={rangeKey}
              id="rangePicker"
              label="Date range"
              mode="range"
              weekStartsOn={1}
              dateFormat="yyyy-MM-dd"
              width={isMobile ? "100%" : undefined}
              initialValue={range}
              onDidChange={(v) => {
                if (!v || typeof v !== "object") return;
                const next = v as { from?: string; to?: string };
                if (next.from && next.to) {
                  setRange({ from: next.from, to: next.to });
                  setDayPage(0);
                }
              }}
            />
          </div>
          <AutoComplete
            className="grow"
            style={{ minWidth: isMobile ? "100%" : 300 }}
            label="Projects"
            placeholder="Search project or client"
            multiple
            grouped
            testId="filter-project"
            options={projectOptionsGroupedByClient(projects, clients).map((p) => ({
              value: p.id,
              label: p.name,
              color: p.color,
              group: p.clientName,
              keywords: p.keywords,
            }))}
            value={projectFilter}
            onChange={(v) => {
              setProjectFilter(v);
              setDayPage(0);
            }}
          />
          <AutoComplete
            className="grow"
            style={{ minWidth: isMobile ? "100%" : 240 }}
            label="Tags"
            placeholder="Search tag"
            multiple
            testId="filter-tag"
            options={tags.map((t) => ({ value: t.id, label: t.name, color: t.color }))}
            value={tagFilter}
            onChange={(v) => {
              setTagFilter(v);
              setDayPage(0);
            }}
          />
        </div>
        <div className="row row--gap-2 row--wrap">
          <Button
            label="Clear filters"
            variant="ghost"
            size="sm"
            data-testid="filter-clear"
            disabled={!filtersActive}
            onClick={clearFilters}
          />
          <span className="spacer" />
          <div className="row row--gap-2">
            <Select
              style={{ width: 140 }}
              testId="export-format"
              options={EXPORT_FORMATS}
              value={exportFormat}
              onChange={(v) => {
                const next = (v || "pdf") as ExportFormat;
                setExportFormat(next);
                try {
                  localStorage.setItem(EXPORT_FORMAT_KEY, next);
                } catch {
                  // Per-device convenience only.
                }
              }}
            />
            {/* One button, format-aware: PDF renders client-side and opens
                the preview; CSV/XLSX are rendered by the API and saved. */}
            <Button
              label="Export"
              icon="download"
              variant="ghost"
              data-testid="header-export"
              onClick={runExport}
            />
          </div>
        </div>
      </Card>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="row row--gap-3">
              <span
                style={{
                  padding: 12,
                  borderRadius: 6,
                  background: "var(--animo-color-primary-100)",
                  color: "var(--animo-color-primary-500)",
                  display: "inline-flex",
                }}
              >
                <Icon name={k.icon} size="md" />
              </span>
              <div className="stack stack--gap-1">
                <span className="kpi__label">{k.label}</span>
                <span className="kpi__value">{k.value}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="two-col">
        <Card style={{ padding: 24 }}>
          <h3>Daily hours</h3>
          <div style={{ height: 280 }}>
            <BarChart orientation="vertical" data={dailyChart} dataKeys={["hours"]} nameKey="day" />
          </div>
        </Card>
        <Card style={{ padding: 24 }}>
          <div className="row">
            <h3>{SLICE_LABELS[sliceBy].title} distribution</h3>
            <span className="spacer" />
            <DropdownMenu
              trigger={
                <Button variant="outlined" themeColor="secondary" size="sm">
                  {SLICE_LABELS[sliceBy].button}
                  <Icon name="chevrondown" size={14} />
                </Button>
              }
              items={(Object.keys(SLICE_LABELS) as SliceBy[]).map((s) => ({
                label: SLICE_LABELS[s].button,
                onSelect: () => setSliceBy(s),
              }))}
            />
          </div>
          <div style={{ height: 280, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <PieChart
              cutout="65%"
              showLegend
              data={slices}
              dataKey="seconds"
              nameKey="label"
              colors={slices.map((s) => s.color)}
            />
          </div>
        </Card>
      </div>

      <Card>
        <TextField
          placeholder="Search description, project, client, tag…"
          startIcon="search"
          testId="reports-search"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setDayPage(0);
          }}
        />
      </Card>

      {searched.length === 0 ? (
        <Card>
          <EmptyState
            compact={isMobile}
            image="time-entries-empty-list"
            alt="No time entries"
            title={narrowed ? "No entries match your filters" : "No entries in this date range"}
            subtitle={
              narrowed
                ? "Try adjusting search, project, tag, or date filters."
                : "Choose another date range or add time entries to see them here."
            }
          />
        </Card>
      ) : (
        <Card
          style={
            isMobile
              ? { padding: 0, background: "transparent", border: 0, boxShadow: "none" }
              : undefined
          }
        >
          <EntryList
            layout={isMobile ? "cards" : "table"}
            rowTestId="reports-entry-row"
            showAddButton={false}
            days={pagedDays}
            onOpenEntry={(e) => entryDialogs.openEntry(e as unknown as TimeEntry)}
            onDuplicateEntry={(e) => entryDialogs.duplicate(e as unknown as TimeEntry)}
            onDeleteEntry={(e) => entryDialogs.requestDelete(e as unknown as TimeEntry)}
          />
          {pagination}
        </Card>
      )}
    </div>
  );
}
