import * as Popover from "@radix-ui/react-popover";
import { memo, useCallback, useMemo, useState } from "react";
import { Icon } from "../../ui/Icon";

import styles from "./EntryList.module.scss";

// =====================================================================================================================
// EntryList — the List screen's per-day entry list, rendered in plain React.
//
// Renders the per-day entry list from a pre-formatted view model
// (`listViewDays` in lib/format.ts), so the List, Reports and PDF export
// share one set of formatters.
// =====================================================================================================================

export type EntryTag = { id: string; name: string; color: string };

export type EntryRow = {
  /** The original list-table row; passed back unchanged in every event. */
  entry: Record<string, unknown>;
  id: string;
  description: string;
  projectId: string | null;
  projectName: string;
  projectColor: string;
  startHm: string;
  endHm: string;
  durationSeconds: number;
  durationText: string;
  durationCompact: string;
  billable: boolean;
  tags: EntryTag[];
};

export type EntryDay = {
  date: string;
  datePart: string;
  dayPart: string;
  totalText: string;
  totalCompact: string;
  entries: EntryRow[];
};

type EntryHandler = (entry: Record<string, unknown>) => void;

export type EntryListProps = {
  days?: EntryDay[];
  layout?: "table" | "cards";
  /** `data-testid` of each entry row (List: list-entry-row, Reports: reports-entry-row). */
  rowTestId?: string;
  /** Cards layout: show the per-day "+" (add entry) button. */
  showAddButton?: boolean;
  onOpenEntry?: EntryHandler;
  onDuplicateEntry?: EntryHandler;
  onDeleteEntry?: EntryHandler;
  onAddNew?: () => void;
};

type SortKey = "projectName" | "durationSeconds" | "billable";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

// The TimerBar's Stopwatch listens for this event (see lib/useStopwatch.ts) and
// starts the timer with the entry's description and project.
function publishResume(row: EntryRow) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("tt:resume", {
      detail: { description: row.description, projectId: row.projectId },
    }),
  );
}

function sortRows(rows: EntryRow[], sort: Sort): EntryRow[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    if (typeof av === "boolean" && typeof bv === "boolean") return (Number(av) - Number(bv)) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

// asc → desc → unsorted on repeated header clicks.
function nextSort(current: Sort, key: SortKey): Sort {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

// --- Row actions menu -----------------------------------------------------------------------------------------------

type RowMenuProps = {
  row: EntryRow;
  onOpenEntry?: EntryHandler;
  onDuplicateEntry?: EntryHandler;
  onDeleteEntry?: EntryHandler;
};

const RowMenu = memo(function RowMenu({
  row,
  onOpenEntry,
  onDuplicateEntry,
  onDeleteEntry,
}: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.menuTrigger}
          data-testid="row-actions"
          aria-label="Entry actions"
        >
          <Icon name="dotmenu" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.menu} align="end" sideOffset={4} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-testid="resume-entry"
            onClick={run(() => publishResume(row))}
          >
            <Icon name="play" />
            Resume
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-testid="duplicate-entry"
            onClick={run(() => onDuplicateEntry?.(row.entry))}
          >
            <Icon name="copy" />
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-testid="edit-entry"
            onClick={run(() => onOpenEntry?.(row.entry))}
          >
            <Icon name="pencil" />
            Edit
          </button>
          <div className={styles.menuSeparator} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-testid="delete-entry"
            onClick={run(() => onDeleteEntry?.(row.entry))}
          >
            <Icon name="trash" />
            Delete
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

function TagChips({ tags, large }: { tags: EntryTag[]; large?: boolean }) {
  if (!tags.length) return null;
  return (
    <>
      {tags.map((t) => (
        <span
          key={t.id}
          className={large ? styles.tagLarge : styles.tag}
          style={{ backgroundColor: t.color }}
        >
          {t.name}
        </span>
      ))}
    </>
  );
}

// --- Desktop: one collapsible table per day -------------------------------------------------------------------------

type DayProps = {
  day: EntryDay;
  collapsed: boolean;
  onToggle: (date: string) => void;
  rowTestId: string;
  showAddButton: boolean;
} & Omit<EntryListProps, "days" | "layout" | "rowTestId" | "showAddButton">;

const SortHeader = ({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}) => {
  const active = sort?.key === sortKey ? sort.dir : null;
  return (
    <th
      className={styles.sortable}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
    >
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)}>
        {label}
        {active && <Icon name={active === "asc" ? "sortasc" : "sortdesc"} />}
      </button>
    </th>
  );
};

const TableDay = memo(function TableDay({
  day,
  collapsed,
  onToggle,
  rowTestId,
  onOpenEntry,
  onDuplicateEntry,
  onDeleteEntry,
}: DayProps) {
  const [sort, setSort] = useState<Sort>(null);
  const rows = useMemo(() => sortRows(day.entries, sort), [day.entries, sort]);
  const onSort = useCallback((key: SortKey) => setSort((s) => nextSort(s, key)), []);
  return (
    <section className={styles.day} data-testid="list-day" data-date={day.date}>
      <button
        type="button"
        className={styles.daySummary}
        aria-expanded={!collapsed}
        onClick={() => onToggle(day.date)}
      >
        <span className={styles.dayDate}>{day.date}</span>
        <span className={styles.dayTotal}>{day.totalText}</span>
        <Icon name={collapsed ? "chevronright" : "chevrondown"} />
      </button>
      {!collapsed && (
        <table className={styles.table}>
          <colgroup>
            {/* Description and project share whatever is left; the value columns
                are sized to their content so they never run into each other. */}
            <col style={{ width: "60%" }} />
            <col style={{ width: "40%" }} />
            <col style={{ width: "124px" }} />
            <col style={{ width: "92px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "64px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Description</th>
              <SortHeader label="Project" sortKey="projectName" sort={sort} onSort={onSort} />
              <th>Time</th>
              <SortHeader label="Duration" sortKey="durationSeconds" sort={sort} onSort={onSort} />
              <SortHeader label="Billable" sortKey="billable" sort={sort} onSort={onSort} />
              <th className={styles.actionsHeader}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={rowTestId}>
                <td>
                  <div className={styles.description} title={row.description || undefined}>
                    {row.description || "(no description)"}
                  </div>
                  {row.tags.length > 0 && (
                    <div className={styles.tags}>
                      <TagChips tags={row.tags} />
                    </div>
                  )}
                </td>
                <td>
                  <span className={styles.project}>
                    <span className={styles.swatch} style={{ backgroundColor: row.projectColor }} />
                    <span className={styles.ellipsis}>{row.projectName}</span>
                  </span>
                </td>
                <td className={styles.timeRange}>
                  {row.startHm} – {row.endHm}
                </td>
                <td className={styles.nowrap}>{row.durationText}</td>
                <td>{row.billable ? "Yes" : "No"}</td>
                <td className={styles.actionsCell}>
                  <RowMenu
                    row={row}
                    onOpenEntry={onOpenEntry}
                    onDuplicateEntry={onDuplicateEntry}
                    onDeleteEntry={onDeleteEntry}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
});

// --- Mobile: timeline cards per day ---------------------------------------------------------------------------------

const CardsDay = memo(function CardsDay({
  day,
  collapsed,
  onToggle,
  rowTestId,
  showAddButton,
  onOpenEntry,
  onDuplicateEntry,
  onDeleteEntry,
  onAddNew,
}: DayProps) {
  return (
    <section className={styles.cardDay} data-testid="list-day" data-date={day.date}>
      <button
        type="button"
        className={styles.cardDaySummary}
        aria-expanded={!collapsed}
        onClick={() => onToggle(day.date)}
      >
        <span className={styles.dateBadge}>
          <Icon name="date" size="14px" />
        </span>
        <span className={styles.cardDayLabel}>
          <span className={styles.cardDayDate}>{day.datePart}</span>
          <span className={styles.cardDayName}>{day.dayPart}</span>
        </span>
        <span className={styles.cardDayTotal}>{day.totalCompact}</span>
        <Icon name={collapsed ? "chevronright" : "chevrondown"} />
      </button>
      {!collapsed && (
        <>
          <div className={styles.cardList}>
            {day.entries.map((row) => (
              <div key={row.id} className={styles.cardRow} data-testid={rowTestId}>
                <div className={styles.timeline}>
                  <span className={styles.timelineStart} style={{ color: row.projectColor }}>
                    {row.startHm}
                  </span>
                  <span className={styles.timelineLine} />
                </div>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTimes}>
                        <span className={styles.cardRange}>
                          {row.startHm} – {row.endHm}
                        </span>
                        <span className={styles.cardDuration} style={{ color: row.projectColor }}>
                          {row.durationCompact}
                        </span>
                      </div>
                      <div className={styles.cardDescription}>
                        {row.description || "(no description)"}
                      </div>
                      <div className={styles.project}>
                        <span className={styles.swatch} style={{ backgroundColor: row.projectColor }} />
                        <span className={styles.cardProject}>{row.projectName}</span>
                      </div>
                    </div>
                    <RowMenu
                      row={row}
                      onOpenEntry={onOpenEntry}
                      onDuplicateEntry={onDuplicateEntry}
                      onDeleteEntry={onDeleteEntry}
                    />
                  </div>
                  {(row.tags.length > 0 || row.billable) && (
                    <div className={styles.cardTags}>
                      <TagChips tags={row.tags} large />
                      {row.billable && (
                        <span className={styles.billable}>
                          <Icon name="check" />
                          billable
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {showAddButton && (
            <div className={styles.cardAdd}>
              <button
                type="button"
                className={styles.addButton}
                aria-label="New entry"
                onClick={() => onAddNew?.()}
              >
                <Icon name="plus" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
});

// --- Root -------------------------------------------------------------------------------------------------------------

export function EntryList({
  days,
  layout = "table",
  rowTestId = "list-entry-row",
  showAddButton = true,
  onOpenEntry,
  onDuplicateEntry,
  onDeleteEntry,
  onAddNew,
}: EntryListProps) {
  // Days start expanded (matching the old `initiallyExpanded="true"`); only
  // the collapsed ones are tracked, keyed by ISO date so the state survives
  // data refreshes and week changes.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const onToggle = useCallback(
    (date: string) => setCollapsed((c) => ({ ...c, [date]: !c[date] })),
    [],
  );
  const Day = layout === "cards" ? CardsDay : TableDay;
  return (
    <div className={layout === "cards" ? styles.cardsRoot : styles.tableRoot}>
      {(days ?? []).map((day) => (
        <Day
          key={day.date}
          day={day}
          collapsed={!!collapsed[day.date]}
          onToggle={onToggle}
          rowTestId={rowTestId}
          showAddButton={showAddButton}
          onOpenEntry={onOpenEntry}
          onDuplicateEntry={onDuplicateEntry}
          onDeleteEntry={onDeleteEntry}
          onAddNew={onAddNew}
        />
      ))}
    </div>
  );
}

export default EntryList;
