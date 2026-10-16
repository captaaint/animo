import { useMemo, useState } from "react";

import { EntryList } from "../components/EntryList/EntryList";
import { WeekCalendar } from "../components/WeekCalendar";
import {
  dayTotalSeconds,
  duplicateEntryPayload,
  entriesForListTable,
  filterEntries,
  formatDuration,
  formatMonthDay,
  groupEntriesByDay,
  listViewDays,
  mondayOfWeek,
  shiftDate,
  todayIso,
  weekTotalSeconds,
} from "../lib/format";
import {
  useClients,
  useDeleteEntry,
  useEntriesInRange,
  useProjects,
  useSaveEntry,
  useTags,
} from "../lib/queries";
import type { TimeEntry } from "../lib/types";
import { useIsMobile } from "../lib/useIsMobile";
import { Button } from "../ui/Button";
import { Card, EmptyState, TextField } from "../ui/controls";
import { toast } from "../ui/toast";
import { DeleteConfirm, type DeleteTarget } from "./DeleteConfirm";
import { EntryEditor, type EntryEditorTarget } from "./EntryEditor";

/**
 * Editor + delete-confirm dialogs and the duplicate/delete actions shared by
 * the Timesheet and the Reports screen.
 */
export function useEntryDialogs(options: { onEditorClosed?: () => void } = {}) {
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null);
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const saveEntry = useSaveEntry();
  const deleteEntry = useDeleteEntry();

  const duplicate = (entry: TimeEntry) =>
    saveEntry.mutate(
      { body: duplicateEntryPayload(entry) },
      {
        onSuccess: () => toast.success("Entry duplicated"),
        onError: () => toast.error("Duplicate failed"),
      },
    );

  const remove = (id: string) =>
    deleteEntry.mutate(id, {
      onSuccess: () => toast.success("Entry deleted"),
      onError: () => toast.error("Delete failed"),
    });

  const dialogs = (
    <>
      <EntryEditor
        target={editor}
        onClose={() => {
          setEditor(null);
          options.onEditorClosed?.();
        }}
        onDeleteRequested={(entry) => setToDelete({ kind: "entry", entry })}
      />
      <DeleteConfirm target={toDelete} onClose={() => setToDelete(null)} onConfirm={remove} />
    </>
  );

  return {
    dialogs,
    openEntry: (entry: TimeEntry) => setEditor({ mode: "edit", entry }),
    openNew: (slot: Omit<Extract<EntryEditorTarget, { mode: "new" }>, "mode"> = {}) =>
      setEditor({ mode: "new", ...slot }),
    requestDelete: (entry: TimeEntry) => setToDelete({ kind: "entry", entry }),
    duplicate,
  };
}

type Slot = { dateIso: string; startMin: number; endMin: number };

export function Timesheet({ view }: { view: "calendar" | "list" }) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const { data: entries = [] } = useEntriesInRange(weekStart, shiftDate(weekStart, 6));
  const { data: projects = [] } = useProjects();
  const saveEntry = useSaveEntry();
  const entryDialogs = useEntryDialogs({ onEditorClosed: () => setSelectedSlot(null) });

  return (
    <div className="page page--fill">
      {entryDialogs.dialogs}
      {view === "calendar" ? (
        // The calendar auto-fits 24 hours into its height; the floor keeps an
        // hour tall enough (~32px) to show the entry description on short
        // windows — below that the page scrolls instead.
        <Card style={{ padding: 0, overflow: "hidden", flex: "1 1 0%", minHeight: 900 }}>
          <WeekCalendar
            entries={entries}
            projects={projects}
            currentDate={weekStart}
            viewMode="week"
            weekStartsOn={1}
            dayStartHour={0}
            dayEndHour={24}
            pixelsPerHour={48}
            snapMinutes={15}
            defaultEntryMinutes={60}
            inlinePopover={false}
            selectedSlot={selectedSlot}
            onCreateEntry={(p) =>
              entryDialogs.openNew({
                date: p.startTime.slice(0, 10),
                startTime: p.startTime.slice(11, 16),
                endTime: p.endTime.slice(11, 16),
              })
            }
            onSlotSelected={setSelectedSlot}
            onSelectEntry={(e) => {
              const entry = entries.find((x) => x.id === e.id);
              if (entry) entryDialogs.openEntry(entry);
            }}
            onUpdateEntry={(p) =>
              saveEntry.mutate(
                {
                  id: p.id,
                  body: {
                    projectId: p.projectId,
                    description: p.description || "",
                    startTime: p.startTime,
                    endTime: p.endTime,
                  },
                },
                { onError: () => toast.error("Update failed") },
              )
            }
            onDateChange={(d) => setWeekStart(mondayOfWeek(new Date(d)))}
          />
        </Card>
      ) : (
        <ListView
          weekStart={weekStart}
          entries={entries}
          onWeekChange={setWeekStart}
          onOpenEntry={entryDialogs.openEntry}
          onAddNew={() => entryDialogs.openNew()}
          onDuplicate={entryDialogs.duplicate}
          onDelete={entryDialogs.requestDelete}
        />
      )}
    </div>
  );
}

function ListView({
  weekStart,
  entries,
  onWeekChange,
  onOpenEntry,
  onAddNew,
  onDuplicate,
  onDelete,
}: {
  weekStart: string;
  entries: TimeEntry[];
  onWeekChange: (weekStart: string) => void;
  onOpenEntry: (e: TimeEntry) => void;
  onAddNew: () => void;
  onDuplicate: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
}) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: tags = [] } = useTags();

  const searched = useMemo(
    () => filterEntries(entries, search, projects, clients, tags),
    [entries, search, projects, clients, tags],
  );
  const days = useMemo(
    () => listViewDays(groupEntriesByDay(entriesForListTable(searched, projects)), projects, tags),
    [searched, projects, tags],
  );

  const today = formatDuration(dayTotalSeconds(entries, todayIso()));
  const thisWeek = formatDuration(weekTotalSeconds(entries, mondayOfWeek(new Date())));
  const prev = () => onWeekChange(shiftDate(weekStart, -7));
  const next = () => onWeekChange(shiftDate(weekStart, 7));

  const emptyTitle = search ? "No entries match your search" : "No entries this week";
  const emptySubtitle = search
    ? "Try another search term or clear the search field."
    : "Add your first time entry to start tracking this week.";

  const searchBox = (
    <TextField
      className="grow"
      placeholder="Search description, project, client, tag…"
      startIcon="search"
      testId="list-search"
      value={search}
      onChange={setSearch}
    />
  );

  const list = (
    <EntryList
      layout={isMobile ? "cards" : "table"}
      days={days}
      onOpenEntry={(e) => onOpenEntry(e as unknown as TimeEntry)}
      onDuplicateEntry={(e) => onDuplicate(e as unknown as TimeEntry)}
      onDeleteEntry={(e) => onDelete(e as unknown as TimeEntry)}
      onAddNew={onAddNew}
    />
  );

  if (isMobile) {
    return (
      <div className="stack stack--gap-4">
        <Card>
          <div className="row">
            <Button size="sm" label="◀" onClick={prev} />
            <span className="spacer" />
            <span className="text-bold text-large text-strong">{formatMonthDay(weekStart)}</span>
            <span className="spacer" />
            <Button size="sm" label="▶" onClick={next} />
          </div>
          <div className="row">
            <div className="stack stack--gap-1 grow" style={{ alignItems: "center" }}>
              <span className="text-secondary text-tiny">Today</span>
              <span className="text-bold text-large text-primary">{today}</span>
            </div>
            <div style={{ width: 1, height: 40, background: "var(--animo-color-surface-200)" }} />
            <div className="stack stack--gap-1 grow" style={{ alignItems: "center" }}>
              <span className="text-secondary text-tiny">This week</span>
              <span className="text-bold text-large text-primary">{thisWeek}</span>
            </div>
          </div>
          <Button block label="New entry" icon="plus" onClick={onAddNew} />
        </Card>
        <Card>{searchBox}</Card>
        {searched.length === 0 ? (
          <Card>
            <EmptyState
              compact
              image="time-entries-empty-list"
              alt="No time entries"
              title={emptyTitle}
              subtitle={emptySubtitle}
            />
          </Card>
        ) : (
          list
        )}
      </div>
    );
  }

  return (
    <div className="stack stack--gap-4">
      <Card>
        <div className="row row--gap-4">
          <div className="row row--gap-2">
            <Button size="sm" label="◀" onClick={prev} />
            <Button size="sm" label="Today" onClick={() => onWeekChange(mondayOfWeek(new Date()))} />
            <Button size="sm" label="▶" onClick={next} />
          </div>
          <span className="spacer" />
          <span className="text-bold text-strong">{formatMonthDay(weekStart)}</span>
          <span className="spacer" />
          <div className="row row--gap-4">
            <div className="row row--gap-1">
              <span className="text-secondary text-small">Today</span>
              <span className="text-bold text-strong">{today}</span>
            </div>
            <div className="row row--gap-1">
              <span className="text-secondary text-small">This week</span>
              <span className="text-bold text-strong">{thisWeek}</span>
            </div>
          </div>
        </div>
        <div className="row row--gap-2">
          {searchBox}
          <Button label="New entry" icon="plus" onClick={onAddNew} />
        </div>
      </Card>
      <Card>
        {searched.length === 0 ? (
          <EmptyState
            image="time-entries-empty-list"
            alt="No time entries"
            title={emptyTitle}
            subtitle={emptySubtitle}
          />
        ) : (
          list
        )}
      </Card>
    </div>
  );
}
