import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, useTheme } from "xmlui";

// =====================================================================================================================
// Types
// =====================================================================================================================

export type RawEntry = {
  id: string;
  projectId: string | null;
  description?: string;
  startTime: string; // ISO
  endTime: string; // ISO
};

export type RawProject = {
  id: string;
  name: string;
  color?: string;
};

export type ViewMode = "day" | "workweek" | "week";

export type WeekCalendarProps = {
  entries?: RawEntry[];
  projects?: RawProject[];
  /** ISO date (YYYY-MM-DD) of the focused day. The visible range is derived from this + viewMode. */
  currentDate?: string;
  viewMode?: ViewMode;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStartsOn?: 0 | 1;
  /** First and last hour of the visible day window. */
  dayStartHour?: number;
  dayEndHour?: number;
  /** Vertical zoom — pixels per hour. */
  pixelsPerHour?: number;
  /** Snap step in minutes (drag-create / move / resize). */
  snapMinutes?: number;
  /** Default duration in minutes for a single click-to-create. */
  defaultEntryMinutes?: number;
  /** Whether the inline edit popover should be shown when a block is clicked. */
  inlinePopover?: boolean;
  /**
   * Controlled "selected slot" highlight — kept visible after a drag-create
   * release so the parent's create dialog can show next to it. The parent
   * (typically CalendarScreen) manages the lifecycle: set on `slotSelected`,
   * cleared when the dialog closes.
   */
  selectedSlot?: {
    dateIso: string;
    startMin: number;
    endMin: number;
  } | null;

  // Event callbacks injected by XMLUI's wrapComponent (events: ["createEntry", ...]).
  onCreateEntry?: (payload: {
    startTime: string;
    endTime: string;
    description: string;
    projectId: string | null;
  }) => void;
  onUpdateEntry?: (payload: {
    id: string;
    startTime: string;
    endTime: string;
    description: string;
    projectId: string | null;
  }) => void;
  onDeleteEntry?: (payload: { id: string }) => void;
  onSelectEntry?: (entry: RawEntry) => void;
  onSlotSelected?: (payload: {
    dateIso: string;
    startMin: number;
    endMin: number;
  }) => void;
  onDateChange?: (currentDate: string) => void;

  style?: CSSProperties;
};

// =====================================================================================================================
// Date helpers (UTC-based ISO, no external library)
// =====================================================================================================================

const DAY_LABELS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(iso: string, weekStartsOn: 0 | 1): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 (Sun) … 6 (Sat)
  const diff = (day - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function combineDateMinutes(dateIso: string, minutesFromMidnight: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutesFromMidnight)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${dateIso}T${pad2(h)}:${pad2(mm)}:00.000Z`;
}

function isoToDateAndMinutes(iso: string): { date: string; minutes: number } {
  // Treat the stored ISO as already-formatted UTC; we render in UTC for predictability.
  const date = iso.slice(0, 10);
  const h = parseInt(iso.slice(11, 13), 10) || 0;
  const m = parseInt(iso.slice(14, 16), 10) || 0;
  return { date, minutes: h * 60 + m };
}

function snap(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function formatDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${pad2(m)}m`;
}

// =====================================================================================================================
// Layout helpers — overlap columns
// =====================================================================================================================

type Layouted = { entry: RawEntry; col: number; cols: number };

function layoutDay(
  entries: RawEntry[],
  // Optional sort-key override: lets the caller pin a moving entry's sort
  // position so column assignments don't swap mid-drag when the live time
  // crosses a neighbour's startTime. Cluster/overlap detection still uses
  // the entry's actual `startTime`/`endTime`.
  sortKey?: (e: RawEntry) => string,
): Layouted[] {
  const key = sortKey ?? ((e: RawEntry) => e.startTime);
  const sorted = [...entries].sort((a, b) => {
    const ak = key(a);
    const bk = key(b);
    if (ak !== bk) return ak < bk ? -1 : 1;
    // Stable id tiebreak so equal sort keys never reorder between renders.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const result: Layouted[] = [];
  let cluster: RawEntry[] = [];
  let clusterEnd = "";

  function flush() {
    if (!cluster.length) return;
    // Greedy column assignment within the cluster.
    const cols: { end: string }[] = [];
    const assignments: number[] = [];
    for (const e of cluster) {
      let placed = -1;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].end <= e.startTime) {
          cols[i].end = e.endTime;
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        cols.push({ end: e.endTime });
        placed = cols.length - 1;
      }
      assignments.push(placed);
    }
    cluster.forEach((e, i) =>
      result.push({ entry: e, col: assignments[i], cols: cols.length }),
    );
    cluster = [];
  }

  for (const e of sorted) {
    if (cluster.length === 0 || e.startTime < clusterEnd) {
      cluster.push(e);
      if (e.endTime > clusterEnd) clusterEnd = e.endTime;
    } else {
      flush();
      cluster.push(e);
      clusterEnd = e.endTime;
    }
  }
  flush();
  return result;
}

// =====================================================================================================================
// Component
// =====================================================================================================================

type DragState =
  | null
  | {
      kind: "create";
      dateIso: string;
      anchorMin: number;
      currentMin: number;
    }
  | {
      kind: "move";
      entry: RawEntry;
      pointerOffsetMin: number;
      dateIso: string;
      startMin: number;
      endMin: number;
    }
  | {
      kind: "resize-top" | "resize-bottom";
      entry: RawEntry;
      dateIso: string;
      startMin: number;
      endMin: number;
    };

type Popover = {
  entryId: string;
  // If "new", entry is a draft that hasn't been saved; submitting fires createEntry.
  mode: "edit" | "new";
  draft: {
    description: string;
    projectId: string | null;
    startTime: string;
    endTime: string;
  };
  anchor: { x: number; y: number };
};

const TIME_GUTTER_WIDTH = 56;
const HEADER_HEIGHT = 56;

// =====================================================================================================================
// Theme token bridge — resolves component-scoped XMLUI theme variables to CSS values.
// =====================================================================================================================

const COMP = "WeekCalendar";

const TOKEN_NAMES = [
  "backgroundColor",
  "borderColor",
  "borderRadius",
  "backgroundColor-toolbar",
  "backgroundColor-header",
  "backgroundColor-gutter",
  "backgroundColor-columnAlt",
  "borderColor-hour",
  "borderColor-halfHour",
  "backgroundColor-today",
  "textColor",
  "textColor-secondary",
  "textColor-strong",
  "textColor-today",
  "backgroundColor-entry",
  "textColor-entry",
  "borderColor-entry",
  "borderRadius-entry",
  "boxShadow-entry",
  "backgroundColor-create",
  "borderColor-create",
  "textColor-create",
  "color-now",
  "backgroundColor-button",
  "backgroundColor-button-active",
  "textColor-button",
  "textColor-button-active",
  "borderColor-button",
  "backgroundColor-popover",
  "borderColor-popover",
  "borderRadius-popover",
  "boxShadow-popover",
  "textColor-popover",
  "textColor-popover-secondary",
  "textColor-popover-danger",
  "borderColor-popover-danger",
  "backgroundColor-popoverPrimary",
  "borderColor-popoverPrimary",
  "textColor-popoverPrimary",
] as const;

type TokenName = (typeof TOKEN_NAMES)[number];
type Tokens = Record<TokenName, string>;

function resolveCssValue(value: string | undefined, el: HTMLElement | undefined): string {
  if (!value) return "";
  if (!el) return value;
  // getThemeVar may return a `var(--xmlui-...)` reference — peel one level via getComputedStyle.
  const m = value.match(/var\((--[^)]+)\)/);
  if (m) {
    const resolved = getComputedStyle(el).getPropertyValue(m[1]).trim();
    return resolved || value;
  }
  return value;
}

function useWeekCalendarTokens(): Tokens {
  const { getThemeVar, root } = useTheme();
  return useMemo(() => {
    const out = {} as Tokens;
    for (const name of TOKEN_NAMES) {
      const raw = getThemeVar(`${name}-${COMP}`);
      out[name] = resolveCssValue(raw, root);
    }
    return out;
  }, [getThemeVar, root]);
}

export function WeekCalendar(props: WeekCalendarProps) {
  const {
    entries: rawEntries = [],
    projects = [],
    currentDate: currentDateProp,
    viewMode: viewModeProp = "week",
    weekStartsOn = 1,
    dayStartHour = 6,
    dayEndHour = 22,
    pixelsPerHour: pixelsPerHourProp = 48,
    snapMinutes = 15,
    defaultEntryMinutes = 60,
    inlinePopover = true,
    selectedSlot,
    onCreateEntry,
    onUpdateEntry,
    onDeleteEntry,
    onSelectEntry,
    onSlotSelected,
    onDateChange,
    style,
  } = props;

  // Local controlled-by-default state for date and zoom.
  const [internalDate, setInternalDate] = useState<string>(
    currentDateProp || todayIso(),
  );
  useEffect(() => {
    if (currentDateProp && currentDateProp !== internalDate) {
      setInternalDate(currentDateProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateProp]);

  const [viewMode, setViewMode] = useState<ViewMode>(viewModeProp);
  useEffect(() => setViewMode(viewModeProp), [viewModeProp]);

  const [pxPerHour, setPxPerHour] = useState<number>(pixelsPerHourProp);
  useEffect(() => setPxPerHour(pixelsPerHourProp), [pixelsPerHourProp]);

  const [drag, setDrag] = useState<DragState>(null);
  const [popover, setPopover] = useState<Popover | null>(null);

  // Optimistic overrides for entries whose update has been dispatched but
  // whose new position hasn't yet round-tripped through the parent's data
  // refresh. Without this, the entry briefly flashes at its old slot between
  // `setDrag(null)` and the next `entries` prop update.
  const [pendingMove, setPendingMove] = useState<
    Record<string, { startTime: string; endTime: string }>
  >({});


  const gridRef = useRef<HTMLDivElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Mobile viewport drives column min-width, sticky gutter, and horizontal
  // grid scrolling — at full-week width on a phone, columns would shrink
  // to ~40px and become unusable.
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // After a real move/resize, the browser still synthesizes a `click` on the
  // entry block — which would re-open the popover / re-fire `onSelectEntry`.
  // This ref swallows that one click.
  const suppressNextClickRef = useRef(false);

  const tokens = useWeekCalendarTokens();

  // -------------------------------------------------------------------------------------------------------------------
  // Derived layout
  // -------------------------------------------------------------------------------------------------------------------
  // On mobile the calendar is locked to single-day view: only one day fits
  // comfortably on a phone, so the ◀/▶ arrows step ±1 day with no horizontal
  // overflow / scrolling.
  const effectiveViewMode: ViewMode = isMobile ? "day" : viewMode;
  const dayCount =
    effectiveViewMode === "day" ? 1 : effectiveViewMode === "workweek" ? 5 : 7;

  const visibleDates = useMemo<string[]>(() => {
    if (effectiveViewMode === "day") return [internalDate];
    const weekStart = startOfWeek(internalDate, weekStartsOn);
    const arr: string[] = [];
    for (let i = 0; i < dayCount; i++) arr.push(shiftDate(weekStart, i));
    return arr;
  }, [internalDate, effectiveViewMode, weekStartsOn, dayCount]);

  const dayLabels = weekStartsOn === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN;

  const projectIndex = useMemo(() => {
    const m = new Map<string, RawProject>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  function projectColor(pid: string | null): string {
    if (!pid) return tokens["backgroundColor-entry"];
    return projectIndex.get(pid)?.color || tokens["backgroundColor-entry"];
  }

  function projectName(pid: string | null): string {
    if (!pid) return "(no project)";
    return projectIndex.get(pid)?.name || "(unknown)";
  }

  const startMin = dayStartHour * 60;
  const endMin = dayEndHour * 60;
  const visibleMinutes = endMin - startMin;
  const minuteToPx = pxPerHour / 60;
  // Bottom padding inside the grid so the closing boundary line and the
  // 24:00 label have breathing room and never clip against the scroll edge.
  const GRID_BOTTOM_PAD = 24;
  const gridHeight = visibleMinutes * minuteToPx + GRID_BOTTOM_PAD;

  // Apply both the live drag (if any) and post-drop optimistic overrides on
  // top of the props entries. Folding the drag into the entry list makes the
  // overlap resolver split columns live during the drag, instead of waiting
  // for the API round-trip.
  const effectiveEntries = useMemo(() => {
    const hasPending = Object.keys(pendingMove).length > 0;
    const liveDrag = drag && drag.kind !== "create" ? drag : null;
    if (!hasPending && !liveDrag) return rawEntries;
    return rawEntries.map((e) => {
      let startTime = e.startTime;
      let endTime = e.endTime;
      const ov = pendingMove[e.id];
      if (ov) {
        startTime = ov.startTime;
        endTime = ov.endTime;
      }
      if (liveDrag && liveDrag.entry.id === e.id) {
        startTime = combineDateMinutes(liveDrag.dateIso, liveDrag.startMin);
        endTime = combineDateMinutes(liveDrag.dateIso, liveDrag.endMin);
      }
      return startTime === e.startTime && endTime === e.endTime
        ? e
        : { ...e, startTime, endTime };
    });
  }, [rawEntries, pendingMove, drag]);

  // Drop pending overrides once the parent's data catches up (or the entry
  // disappeared). On API failure the override would persist visually until
  // the next refetch — acceptable, since `toast.error` already signals it.
  useEffect(() => {
    setPendingMove((prev) => {
      const ids = Object.keys(prev);
      if (!ids.length) return prev;
      let changed = false;
      const next: typeof prev = {};
      for (const id of ids) {
        const ov = prev[id];
        const e = rawEntries.find((x) => x.id === id);
        if (!e) {
          changed = true;
          continue;
        }
        if (e.startTime === ov.startTime && e.endTime === ov.endTime) {
          changed = true;
          continue;
        }
        next[id] = ov;
      }
      return changed ? next : prev;
    });
  }, [rawEntries]);

  // Group entries by day (only those visible).
  const entriesByDay = useMemo(() => {
    const map: Record<string, RawEntry[]> = {};
    for (const d of visibleDates) map[d] = [];
    for (const e of effectiveEntries) {
      const day = e.startTime.slice(0, 10);
      if (map[day]) map[day].push(e);
    }
    return map;
  }, [effectiveEntries, visibleDates]);

  // While dragging, pin the moving entry's sort position to its original
  // time-of-day so column assignments don't swap when its live startTime
  // crosses a neighbour's. Time-of-day (not full ISO) is used so a cross-day
  // move sorts naturally relative to the target day's entries.
  const layoutSortKey = useMemo<((e: RawEntry) => string) | undefined>(() => {
    if (!drag || drag.kind === "create") return undefined;
    const dragId = drag.entry.id;
    const orig = rawEntries.find((x) => x.id === dragId);
    const pinnedTimeOfDay = (orig?.startTime ?? drag.entry.startTime).slice(11);
    return (e: RawEntry) =>
      e.id === dragId ? pinnedTimeOfDay : e.startTime.slice(11);
  }, [drag, rawEntries]);

  const layoutedByDay = useMemo(() => {
    const out: Record<string, Layouted[]> = {};
    for (const d of visibleDates) {
      out[d] = layoutDay(entriesByDay[d] || [], layoutSortKey);
    }
    return out;
  }, [entriesByDay, visibleDates, layoutSortKey]);

  // Daily totals — deliberately ignore the live drag so the header numbers
  // don't tick mid-drag. `pendingMove` IS applied so totals update once the
  // user releases (optimistically, until the parent's refetch confirms).
  const entriesForTotals = useMemo(() => {
    if (!Object.keys(pendingMove).length) return rawEntries;
    return rawEntries.map((e) => {
      const ov = pendingMove[e.id];
      return ov ? { ...e, startTime: ov.startTime, endTime: ov.endTime } : e;
    });
  }, [rawEntries, pendingMove]);

  const dayTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of visibleDates) out[d] = 0;
    for (const e of entriesForTotals) {
      const day = e.startTime.slice(0, 10);
      if (out[day] === undefined) continue;
      const a = isoToDateAndMinutes(e.startTime).minutes;
      const b = isoToDateAndMinutes(e.endTime).minutes;
      out[day] += b - a;
    }
    return out;
  }, [entriesForTotals, visibleDates]);

  // Live current-time tick.
  const [nowTick, setNowTick] = useState<number>(0);
  useEffect(() => {
    const t = window.setInterval(() => setNowTick((v) => v + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Width of the grid's scrollbar gutter. `scrollbar-gutter: stable` keeps a
  // constant gutter reserved on the grid; we mirror it as right-padding on
  // the header so day columns stay pixel-aligned.
  const [scrollbarGutter, setScrollbarGutter] = useState<number>(0);
  useEffect(() => {
    const measure = () => {
      const el = gridRef.current;
      if (!el) return;
      setScrollbarGutter(Math.max(0, el.offsetWidth - el.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (gridRef.current) ro.observe(gridRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Auto-fit pixelsPerHour to the grid slot height so the full 24-hour
  // day fits exactly with no scrollbar. We trust the inline-prop
  // pixelsPerHour as the "preferred" (max) value and only shrink it when
  // the slot is too short. Recomputed on every resize via the same
  // ResizeObserver pattern used for scrollbarGutter.
  useEffect(() => {
    const GRID_BOTTOM_PAD = 24;
    const GRID_TOP_PAD = 8;
    const visibleMin = (dayEndHour - dayStartHour) * 60;
    const fit = () => {
      const el = gridRef.current;
      if (!el || visibleMin <= 0) return;
      const available = el.clientHeight - GRID_BOTTOM_PAD - GRID_TOP_PAD;
      if (available <= 0) return;
      const fitted = (available / visibleMin) * 60;
      // Cap at the prop value — don't blow events up to giant blocks
      // on tall monitors. Floor at 12 px/h so labels stay readable.
      const next = Math.max(12, Math.min(pixelsPerHourProp, fitted));
      // Avoid feedback loops: only update if the change is meaningful.
      setPxPerHour((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (gridRef.current) ro.observe(gridRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [pixelsPerHourProp, dayStartHour, dayEndHour]);

  // Mirror the grid's horizontal scroll onto the header so day labels stay
  // aligned with their columns when the user pans the grid on mobile.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onScroll = () => {
      const h = headerScrollRef.current;
      if (h) h.scrollLeft = grid.scrollLeft;
    };
    grid.addEventListener("scroll", onScroll, { passive: true });
    return () => grid.removeEventListener("scroll", onScroll);
  }, []);

  // Read once per render (nowTick triggers re-render). The now-marker must
  // line up with the user's wall-clock — UTC math would lag by their TZ
  // offset (e.g. ~2h behind in CEST).
  const nowDate = new Date();
  const nowIsoDate = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}-${pad2(nowDate.getDate())}`;
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  // -------------------------------------------------------------------------------------------------------------------
  // Helpers — pointer to (date, minute)
  // -------------------------------------------------------------------------------------------------------------------
  function pointerToDayMin(
    e: ReactPointerEvent,
    dateIso: string,
  ): number {
    const col = columnRefs.current[dateIso];
    if (!col) return startMin;
    const rect = col.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const m = startMin + offsetY / minuteToPx;
    return snap(Math.max(startMin, Math.min(endMin, m)), snapMinutes);
  }

  // While a move drag is in progress, pointer capture routes all events to the
  // origin column — so we have to derive the actual day under the cursor from
  // its X coordinate rather than from the bubbling event's column.
  function findColumnDateAt(clientX: number): string | null {
    for (const date of visibleDates) {
      const col = columnRefs.current[date];
      if (!col) continue;
      const rect = col.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) return date;
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Pointer handlers
  // -------------------------------------------------------------------------------------------------------------------
  function onColumnPointerDown(e: ReactPointerEvent, dateIso: string) {
    if ((e.target as HTMLElement).closest("[data-entry-block]")) return;
    if ((e.target as HTMLElement).closest("[data-popover]")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const m = pointerToDayMin(e, dateIso);
    setDrag({
      kind: "create",
      dateIso,
      anchorMin: m,
      currentMin: m + snapMinutes,
    });
    setPopover(null);
  }

  function onColumnPointerMove(e: ReactPointerEvent, dateIso: string) {
    if (!drag) return;
    if (drag.kind === "create" && drag.dateIso === dateIso) {
      const m = pointerToDayMin(e, dateIso);
      setDrag({ ...drag, currentMin: m });
    } else if (drag.kind === "move") {
      // Pointer capture routes all events to the origin column, so derive the
      // actual day under the cursor from its X coordinate.
      const targetDate = findColumnDateAt(e.clientX) || drag.dateIso;
      const m = pointerToDayMin(e, targetDate);
      const dur = drag.endMin - drag.startMin;
      const newStart = Math.max(
        startMin,
        Math.min(endMin - dur, m - drag.pointerOffsetMin),
      );
      setDrag({
        ...drag,
        dateIso: targetDate,
        startMin: newStart,
        endMin: newStart + dur,
      });
    } else if (drag.kind === "resize-top" && drag.dateIso === dateIso) {
      const m = pointerToDayMin(e, dateIso);
      const newStart = Math.min(drag.endMin - snapMinutes, m);
      setDrag({ ...drag, startMin: Math.max(startMin, newStart) });
    } else if (drag.kind === "resize-bottom" && drag.dateIso === dateIso) {
      const m = pointerToDayMin(e, dateIso);
      const newEnd = Math.max(drag.startMin + snapMinutes, m);
      setDrag({ ...drag, endMin: Math.min(endMin, newEnd) });
    }
  }

  function onColumnPointerUp(e: ReactPointerEvent, dateIso: string) {
    if (!drag) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (drag.kind === "create") {
      const a = Math.min(drag.anchorMin, drag.currentMin);
      const b = Math.max(drag.anchorMin, drag.currentMin);
      // Treat tiny drags as click → default-length entry.
      const startM = a;
      let endM = b - a < snapMinutes ? a + defaultEntryMinutes : b;
      endM = Math.min(endMin, endM);
      const startTime = combineDateMinutes(drag.dateIso, startM);
      const endTime = combineDateMinutes(drag.dateIso, endM);
      const newId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      // Notify the parent so it can keep the highlight visible while its
      // create dialog is open (passed back via the controlled `selectedSlot`
      // prop) and clear it when the dialog closes.
      onSlotSelected?.({
        dateIso: drag.dateIso,
        startMin: startM,
        endMin: endM,
      });
      if (inlinePopover) {
        // Open popover for new entry — user confirms via Save (fires createEntry).
        const rect = (
          columnRefs.current[drag.dateIso] || gridRef.current
        )?.getBoundingClientRect();
        setPopover({
          entryId: newId,
          mode: "new",
          draft: {
            description: "",
            projectId: projects[0]?.id || null,
            startTime,
            endTime,
          },
          anchor: {
            x: (rect?.left || 0) + 8,
            y: (rect?.top || 0) + (startM - startMin) * minuteToPx + 8,
          },
        });
      } else if (onCreateEntry) {
        onCreateEntry({
          startTime,
          endTime,
          description: "",
          projectId: projects[0]?.id || null,
        });
      }
    } else if (drag.kind === "move" || drag.kind.startsWith("resize")) {
      const d = drag as Exclude<DragState, null | { kind: "create" }>;
      const origStartM = isoToDateAndMinutes(d.entry.startTime).minutes;
      const origEndM = isoToDateAndMinutes(d.entry.endTime).minutes;
      const origDate = d.entry.startTime.slice(0, 10);
      const changed =
        d.startMin !== origStartM ||
        d.endMin !== origEndM ||
        d.dateIso !== origDate;
      if (changed) {
        const newStart = combineDateMinutes(d.dateIso, d.startMin);
        const newEnd = combineDateMinutes(d.dateIso, d.endMin);
        // Stash the optimistic position so the entry stays at its new slot
        // until the parent's data refresh confirms the change.
        setPendingMove((prev) => ({
          ...prev,
          [d.entry.id]: { startTime: newStart, endTime: newEnd },
        }));
        onUpdateEntry?.({
          id: d.entry.id,
          startTime: newStart,
          endTime: newEnd,
          description: d.entry.description || "",
          projectId: d.entry.projectId,
        });
        // Eat the browser-synthesized click that follows pointerup, so the
        // edit popover / onSelectEntry don't fire after a real drag/resize.
        suppressNextClickRef.current = true;
        // Failsafe: if click doesn't actually fire (e.g. release outside
        // the entry), don't poison the next genuine click.
        setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }
    }
    setDrag(null);
  }

  function onEntryPointerDown(
    e: ReactPointerEvent,
    entry: RawEntry,
    dateIso: string,
    startM: number,
    endM: number,
    handle: "move" | "top" | "bottom",
  ) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pointerMin = pointerToDayMin(e, dateIso);
    if (handle === "move") {
      setDrag({
        kind: "move",
        entry,
        dateIso,
        startMin: startM,
        endMin: endM,
        pointerOffsetMin: pointerMin - startM,
      });
    } else if (handle === "top") {
      setDrag({
        kind: "resize-top",
        entry,
        dateIso,
        startMin: startM,
        endMin: endM,
      });
    } else {
      setDrag({
        kind: "resize-bottom",
        entry,
        dateIso,
        startMin: startM,
        endMin: endM,
      });
    }
  }

  function onEntryClick(
    e: ReactMouseEvent<HTMLDivElement>,
    entry: RawEntry,
  ) {
    e.stopPropagation();
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onSelectEntry?.(entry);
    if (!inlinePopover) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({
      entryId: entry.id,
      mode: "edit",
      draft: {
        description: entry.description || "",
        projectId: entry.projectId,
        startTime: entry.startTime,
        endTime: entry.endTime,
      },
      anchor: { x: rect.right + 8, y: rect.top },
    });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Toolbar handlers
  // -------------------------------------------------------------------------------------------------------------------
  function navigate(deltaDays: number) {
    const next = shiftDate(internalDate, deltaDays);
    setInternalDate(next);
    onDateChange?.(next);
  }

  function goToday() {
    const t = todayIso();
    setInternalDate(t);
    onDateChange?.(t);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------------------------------------------------
  function renderCreateGhost(dateIso: string) {
    let a: number | null = null;
    let b: number | null = null;
    if (drag && drag.kind === "create" && drag.dateIso === dateIso) {
      a = Math.min(drag.anchorMin, drag.currentMin);
      b = Math.max(drag.anchorMin, drag.currentMin);
    } else if (
      popover &&
      popover.mode === "new" &&
      popover.draft.startTime.slice(0, 10) === dateIso
    ) {
      // Inline-popover path: keep the highlight in sync with the popover's
      // editable time fields.
      a = isoToDateAndMinutes(popover.draft.startTime).minutes;
      b = isoToDateAndMinutes(popover.draft.endTime).minutes;
    } else if (selectedSlot && selectedSlot.dateIso === dateIso) {
      // External-modal path: the parent owns this prop and clears it when
      // its create dialog closes (save or cancel).
      a = selectedSlot.startMin;
      b = selectedSlot.endMin;
    }
    if (a === null || b === null) return null;
    const top = (a - startMin) * minuteToPx;
    const height = Math.max(snapMinutes, b - a) * minuteToPx;
    return (
      <div
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top,
          height,
          background: tokens["backgroundColor-create"],
          border: `1px dashed ${tokens["borderColor-create"]}`,
          borderRadius: tokens["borderRadius-entry"],
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 11, color: tokens["textColor-create"], padding: 4 }}>
          {formatHHMM(a)} – {formatHHMM(b)}
        </div>
      </div>
    );
  }

  function renderEntryBlock(layouted: Layouted, dateIso: string) {
    const { entry, col, cols } = layouted;
    const startM = isoToDateAndMinutes(entry.startTime).minutes;
    const endM = isoToDateAndMinutes(entry.endTime).minutes;

    // Use drag state values if this entry is being dragged.
    let useStart = startM;
    let useEnd = endM;
    let useDate = dateIso;
    if (
      drag &&
      drag.kind !== "create" &&
      drag.entry.id === entry.id
    ) {
      useStart = drag.startMin;
      useEnd = drag.endMin;
      useDate = drag.dateIso;
    }

    if (useDate !== dateIso) return null;

    const top = (useStart - startMin) * minuteToPx;
    const height = Math.max(16, (useEnd - useStart) * minuteToPx);
    const widthPct = 100 / cols;
    const leftPct = col * widthPct;
    const color = projectColor(entry.projectId);
    const entryShadow = tokens["boxShadow-entry"]
      ? `${tokens["boxShadow-entry"]}, inset 0 1px 0 rgba(255,255,255,0.16)`
      : "inset 0 1px 0 rgba(255,255,255,0.16)";

    return (
      <div
        key={entry.id}
        data-entry-block
        onPointerDown={(e) =>
          onEntryPointerDown(e, entry, dateIso, useStart, useEnd, "move")
        }
        onClick={(e) => onEntryClick(e, entry)}
        style={{
          position: "absolute",
          top,
          height,
          left: `calc(${leftPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
          background: `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 78%, black 22%) 100%)`,
          color: tokens["textColor-entry"],
          border: `1px solid ${tokens["borderColor-entry"] || "rgba(255,255,255,0.16)"}`,
          borderRadius: tokens["borderRadius-entry"],
          padding: "4px 6px",
          fontSize: 12,
          lineHeight: 1.3,
          cursor: "grab",
          overflow: "hidden",
          boxShadow: entryShadow,
          userSelect: "none",
        }}
      >
        <div
          data-handle="top"
          onPointerDown={(e) =>
            onEntryPointerDown(e, entry, dateIso, useStart, useEnd, "top")
          }
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            cursor: "ns-resize",
          }}
        />
        <div style={{ fontWeight: 600 }}>
          {formatHHMM(useStart)} – {formatHHMM(useEnd)}
        </div>
        {height > 30 && (
          <div
            style={{
              opacity: 0.92,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {entry.description || "(no description)"}
          </div>
        )}
        {height > 50 && entry.projectId && (
          <div style={{ opacity: 0.78, fontSize: 11 }}>
            {projectName(entry.projectId)}
          </div>
        )}
        <div
          data-handle="bottom"
          onPointerDown={(e) =>
            onEntryPointerDown(e, entry, dateIso, useStart, useEnd, "bottom")
          }
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            cursor: "ns-resize",
          }}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Popover render & handlers
  // -------------------------------------------------------------------------------------------------------------------
  function commitPopover() {
    if (!popover) return;
    const { mode, draft, entryId } = popover;
    if (mode === "new") {
      onCreateEntry?.({
        startTime: draft.startTime,
        endTime: draft.endTime,
        description: draft.description,
        projectId: draft.projectId,
      });
    } else {
      onUpdateEntry?.({
        id: entryId,
        startTime: draft.startTime,
        endTime: draft.endTime,
        description: draft.description,
        projectId: draft.projectId,
      });
    }
    setPopover(null);
  }

  function deleteFromPopover() {
    if (!popover || popover.mode !== "edit") return;
    onDeleteEntry?.({ id: popover.entryId });
    setPopover(null);
  }

  function renderPopover() {
    if (!popover) return null;
    const { x, y } = popover.anchor;
    const startM = isoToDateAndMinutes(popover.draft.startTime).minutes;
    const endM = isoToDateAndMinutes(popover.draft.endTime).minutes;
    const dateIso = popover.draft.startTime.slice(0, 10);

    const fieldStyle: CSSProperties = {
      width: "100%",
      padding: "6px 8px",
      border: `1px solid ${tokens["borderColor-popover"]}`,
      borderRadius: tokens["borderRadius-popover"],
      fontSize: 13,
      color: tokens["textColor-popover"],
      background: tokens["backgroundColor-popover"],
      boxSizing: "border-box",
    };
    return (
      <div
        data-popover
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: Math.min(x, window.innerWidth - 320),
          top: Math.min(y, window.innerHeight - 280),
          width: 300,
          background: tokens["backgroundColor-popover"],
          border: `1px solid ${tokens["borderColor-popover"]}`,
          borderRadius: tokens["borderRadius-popover"],
          boxShadow: tokens["boxShadow-popover"],
          padding: 12,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          color: tokens["textColor-popover"],
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {popover.mode === "new" ? "New entry" : "Edit entry"}
        </div>
        <input
          type="text"
          autoFocus
          placeholder="Description"
          value={popover.draft.description}
          onChange={(e) =>
            setPopover({
              ...popover,
              draft: { ...popover.draft, description: e.target.value },
            })
          }
          style={fieldStyle}
        />
        <select
          value={popover.draft.projectId || ""}
          onChange={(e) =>
            setPopover({
              ...popover,
              draft: {
                ...popover.draft,
                projectId: e.target.value || null,
              },
            })
          }
          style={fieldStyle}
        >
          <option value="">(no project)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="time"
            value={formatHHMM(startM)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              const newM = h * 60 + m;
              setPopover({
                ...popover,
                draft: {
                  ...popover.draft,
                  startTime: combineDateMinutes(dateIso, newM),
                },
              });
            }}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <input
            type="time"
            value={formatHHMM(endM)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              const newM = h * 60 + m;
              setPopover({
                ...popover,
                draft: {
                  ...popover.draft,
                  endTime: combineDateMinutes(dateIso, newM),
                },
              });
            }}
            style={{ ...fieldStyle, flex: 1 }}
          />
        </div>
        <div style={{ color: tokens["textColor-popover-secondary"], fontSize: 12 }}>
          {formatDuration(Math.max(0, endM - startM))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {popover.mode === "edit" && (
            <Button
              size="sm"
              themeColor="attention"
              variant="ghost"
              onClick={deleteFromPopover}
            >
              Delete
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button size="sm" variant="ghost" onClick={() => setPopover(null)}>
            Cancel
          </Button>
          <Button size="sm" themeColor="primary" onClick={commitPopover}>
            {popover.mode === "new" ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------------------------------------------------
  const hours: number[] = [];
  for (let h = dayStartHour; h <= dayEndHour; h++) hours.push(h);

  const rangeLabel =
    viewMode === "day"
      ? internalDate
      : `${visibleDates[0]} – ${visibleDates[visibleDates.length - 1]}`;

  // Compact label for the mobile toolbar: month + day of the visible range's
  // first day (e.g. "May 11"). Lets the user see where they are without the
  // full ISO range label.
  const MONTH_ABBR = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const weekStartDateObj = new Date(visibleDates[0] + "T00:00:00Z");
  const weekStartLabel =
    `${MONTH_ABBR[weekStartDateObj.getUTCMonth()]} ${weekStartDateObj.getUTCDate()}`;

  const totalWeekMin = visibleDates.reduce((s, d) => s + (dayTotals[d] || 0), 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: tokens["backgroundColor"],
        border: `1px solid ${tokens["borderColor"]}`,
        borderRadius: tokens["borderRadius"],
        color: tokens["textColor"],
        overflow: "hidden",
        // Fill the parent slot — the page/Tabs chain plus the
        // .xmlui-page-root flex override in web/index.html gives this a
        // definite height. The grid wrapper inside has flex:1 and the
        // pixelsPerHour state below adapts so the 24-hour content
        // always fits exactly with no scrollbar.
        height: "100%",
        minHeight: 0,
        ...style,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 6,
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${tokens["borderColor"]}`,
          background: tokens["backgroundColor-toolbar"],
        }}
      >
        <div style={{ display: "inline-flex", gap: 8, ...(isMobile ? { margin: "0 auto" } : {}) }}>
          <Button
            variant="solid"
            size="sm"
            onClick={() => navigate(-dayCount)}
          >
            ◀
          </Button>
          <Button variant="solid" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button
            variant="solid"
            size="sm"
            onClick={() => navigate(dayCount)}
          >
            ▶
          </Button>
        </div>
        {/* Range label, view-mode switcher, zoom, and totals — hidden on
            mobile to keep the toolbar to a single compact row. */}
        {!isMobile && (
          <>
            <div style={{ flex: 1 }} />
            <div style={{ fontWeight: 600, color: tokens["textColor-strong"] }}>
              {rangeLabel}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", gap: 4 }}>
              {(["day", "workweek", "week"] as ViewMode[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  themeColor={viewMode === m ? "primary" : "secondary"}
                  variant={viewMode === m ? "solid" : "ghost"}
                  onClick={() => setViewMode(m)}
                >
                  {m === "day" ? "Day" : m === "workweek" ? "5d" : "Week"}
                </Button>
              ))}
            </div>
            <div style={{ display: "inline-flex", gap: 4, marginLeft: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPxPerHour((v) => Math.max(12, v - 12))}
                title="Zoom out"
              >
                −
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPxPerHour((v) => Math.min(120, v + 12))}
                title="Zoom in"
              >
                +
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Header row — wrapped in a scrolling container whose scrollLeft is
          driven by the body grid's scroll so day labels track their columns
          when the user pans horizontally on mobile. */}
      <div
        ref={headerScrollRef}
        style={{
          overflow: "hidden",
          borderBottom: `1px solid ${tokens["borderColor"]}`,
          background: tokens["backgroundColor-header"],
          height: HEADER_HEIGHT,
          // Mirror the grid's vertical scrollbar gutter so day columns line up.
          paddingRight: scrollbarGutter,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? `repeat(${dayCount}, 1fr)`
              : `${TIME_GUTTER_WIDTH}px repeat(${dayCount}, 1fr)`,
            height: "100%",
          }}
        >
          {!isMobile && (
            <div
              style={{
                position: "sticky",
                left: 0,
                zIndex: 2,
                background: tokens["backgroundColor-header"],
              }}
            />
          )}
        {visibleDates.map((d, i) => {
          const dow = new Date(d + "T00:00:00Z").getUTCDay();
          const labelIdx = (dow - weekStartsOn + 7) % 7;
          const label =
            (weekStartsOn === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN)[labelIdx];
          const isToday = d === nowIsoDate;
          return (
            <div
              key={d}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                paddingTop: 6,
                paddingBottom: 8,
                boxSizing: "border-box",
                borderLeft: i === 0 ? "none" : `1px solid ${tokens["borderColor-hour"]}`,
                color: isToday ? tokens["textColor-today"] : tokens["textColor-secondary"],
                fontWeight: isToday ? 700 : 600,
                // Allow this grid item to shrink below its intrinsic content
                // width so the children's `text-overflow: ellipsis` can kick in
                // on narrow viewports.
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {label} {parseInt(d.slice(8, 10), 10)}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: tokens["textColor-secondary"],
                  fontWeight: 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                ({formatDuration(dayTotals[d] || 0)})
              </div>
            </div>
          );
        })}
        {/* unused dummy */}
        {dayLabels.length === 0 && null}
        </div>
      </div>

      {/* Grid — fills the remaining vertical space inside the wrapper.
          Vertical scroll is disabled and `pxPerHour` is auto-fitted to
          the slot height (see the ResizeObserver block above the
          return), so the full 24-hour day is always visible without a
          scrollbar. */}
      <div
        ref={gridRef}
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? `${TIME_GUTTER_WIDTH}px repeat(${dayCount}, minmax(150px, 1fr))`
            : `${TIME_GUTTER_WIDTH}px repeat(${dayCount}, 1fr)`,
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflowY: "hidden",
          overflowX: isMobile ? "auto" : "hidden",
          // Small gap between the day-name header and the calendar grid so
          // the first hour label has breathing room.
          paddingTop: 8,
        }}
      >
        {/* Time gutter — sticks to the left edge of the grid's horizontal
            scroll on mobile so hour labels stay visible when panning days. */}
        <div
          style={{
            position: isMobile ? "sticky" : "relative",
            left: 0,
            zIndex: 3,
            height: gridHeight,
            borderRight: `1px solid ${tokens["borderColor"]}`,
            background: tokens["backgroundColor-gutter"],
          }}
        >
          {hours.map((h) => {
            // Boundary labels (00:00 and 24:00) sit just inside the grid's
            // top / bottom edges and are emphasized so the start/end of the
            // day is obvious. All other labels are vertically centered on
            // their hour line.
            const lineTop = (h * 60 - startMin) * minuteToPx;
            const isBoundary = h === dayStartHour || h === dayEndHour;
            const top =
              h === dayStartHour
                ? 4
                : h === dayEndHour
                ? lineTop - 18
                : lineTop - 8;
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top,
                  right: 6,
                  fontSize: isBoundary ? 12 : 11,
                  fontWeight: isBoundary ? 700 : 400,
                  color: isBoundary
                    ? tokens["textColor-strong"]
                    : tokens["textColor-secondary"],
                  background: isBoundary ? tokens["backgroundColor-gutter"] : undefined,
                  padding: isBoundary ? "0 2px" : undefined,
                }}
              >
                {pad2(h)}:00
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        {visibleDates.map((d, i) => {
          const isToday = d === nowIsoDate;
          const columnBackground = isToday
            ? tokens["backgroundColor-today"]
            : i % 2 === 1 && tokens["backgroundColor-columnAlt"]
            ? tokens["backgroundColor-columnAlt"]
            : tokens["backgroundColor"];
          return (
            <div
              key={d}
              ref={(el) => {
                columnRefs.current[d] = el;
              }}
              onPointerDown={(e) => onColumnPointerDown(e, d)}
              onPointerMove={(e) => onColumnPointerMove(e, d)}
              onPointerUp={(e) => onColumnPointerUp(e, d)}
              onPointerCancel={(e) => {
                // Abort without committing — the browser interrupted the
                // pointer (e.g. on mobile when a touch becomes a scroll),
                // so creating an entry here would be unintended.
                try {
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {}
                setDrag(null);
              }}
              style={{
                position: "relative",
                height: gridHeight,
                borderLeft: i === 0 ? "none" : `1px solid ${tokens["borderColor-hour"]}`,
                background: columnBackground,
                cursor: "crosshair",
                // Desktop uses pointer-drag for create/move/resize; mobile
                // lets the browser handle pan gestures so the grid stays
                // scrollable in both axes (drag-create still works via the
                // pointerdown anchor when the user holds without panning).
                touchAction: isMobile ? "auto" : "none",
              }}
            >
              {/* hour grid lines — and a thicker boundary at the top
                  (00:00) and bottom (24:00) so the day's start and end are
                  unmistakable. */}
              {hours.map((h) => {
                const isBoundary = h === dayStartHour || h === dayEndHour;
                return (
                  <div
                    key={h}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: (h * 60 - startMin) * minuteToPx,
                      height: isBoundary ? 2 : 1,
                      background: isBoundary
                        ? tokens["borderColor"]
                        : tokens["borderColor-hour"],
                      pointerEvents: "none",
                    }}
                  />
                );
              })}
              {/* half-hour lines */}
              {hours.map((h) => (
                <div
                  key={`h-${h}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: (h * 60 + 30 - startMin) * minuteToPx,
                    height: 1,
                    background: tokens["borderColor-halfHour"],
                    pointerEvents: "none",
                  }}
                />
              ))}

              {/* current time line */}
              {isToday &&
                nowMin >= startMin &&
                nowMin <= endMin && (
                  <div
                    key={`now-${nowTick}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: (nowMin - startMin) * minuteToPx,
                      height: 2,
                      background: tokens["color-now"],
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -5,
                        top: -4,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: tokens["color-now"],
                      }}
                    />
                  </div>
                )}

              {/* entries (the dragged entry is folded into effectiveEntries
                  so the overlap layout splits live during the drag) */}
              {(layoutedByDay[d] || []).map((l) => renderEntryBlock(l, d))}

              {/* drag-create ghost */}
              {renderCreateGhost(d)}
            </div>
          );
        })}
      </div>

      {renderPopover()}
    </div>
  );
}

export default WeekCalendar;
