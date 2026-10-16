import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DatePicker } from "../components/DatePicker/DatePicker";
import { DescriptionAutocomplete } from "../components/DescriptionAutocomplete/DescriptionAutocomplete";
import { TimePicker } from "../components/TimePicker/TimePicker";
import { apiFetch } from "../lib/api";
import {
  addSecToTime,
  combineDateTime,
  descriptionSuggestions,
  existingTagIdsOnly,
  formatHms,
  parseHmsToSec,
  parseTimeToSec,
  todayIso,
} from "../lib/format";
import { keys, useAllEntries, useProjects, useSaveEntry, useTags } from "../lib/queries";
import type { Tag, TimeEntry } from "../lib/types";
import { useIsMobile } from "../lib/useIsMobile";
import { useKeyListener } from "../lib/useKeyListener";
import { Button } from "../ui/Button";
import { Card, Switch } from "../ui/controls";
import { DrawerAction, Sheet } from "../ui/overlays";
import { AutoComplete } from "../ui/Select";
import { toast } from "../ui/toast";

export type EntryEditorTarget =
  | { mode: "edit"; entry: TimeEntry }
  | { mode: "new"; date?: string; startTime?: string; endTime?: string };

type Props = {
  target: EntryEditorTarget | null;
  onClose: () => void;
  onDeleteRequested: (entry: TimeEntry) => void;
};

/** Create / edit a time entry — a modal on desktop, a tall drawer on mobile. */
export function EntryEditor({ target, onClose, onDeleteRequested }: Props) {
  if (!target) return null;
  return (
    <EntryEditorBody
      // Fresh form state for every opening.
      key={target.mode === "edit" ? target.entry.id : JSON.stringify(target)}
      target={target}
      onClose={onClose}
      onDeleteRequested={onDeleteRequested}
    />
  );
}

const CARD_SHADOW = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };

function EntryEditorBody({
  target,
  onClose,
  onDeleteRequested,
}: Props & { target: EntryEditorTarget }) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const { data: allEntries = [] } = useAllEntries();
  const saveEntry = useSaveEntry();

  const editing = target.mode === "edit" ? target.entry : null;
  const slot = target.mode === "new" ? target : null;
  const [date, setDate] = useState(editing ? editing.startTime.slice(0, 10) : slot?.date || todayIso());
  const [start, setStart] = useState(editing ? editing.startTime.slice(11, 16) : slot?.startTime || "09:00");
  const [end, setEnd] = useState(editing ? editing.endTime.slice(11, 16) : slot?.endTime || "10:00");
  const [descr, setDescr] = useState(editing?.description || "");
  const [projectId, setProjectId] = useState<string | null>(editing?.projectId ?? null);
  const [billable, setBillable] = useState(!!editing?.billable);
  const [tagIds, setTagIds] = useState<string[]>(editing?.tagIds || []);

  const suggestions = useMemo(() => descriptionSuggestions(allEntries), [allEntries]);
  const duration = formatHms(parseTimeToSec(end) - parseTimeToSec(start));

  const save = () => {
    if (parseTimeToSec(end) <= parseTimeToSec(start)) {
      toast.error("End must be after start");
      return;
    }
    saveEntry.mutate(
      {
        id: editing?.id,
        body: {
          projectId: projectId || null,
          description: descr || "",
          startTime: combineDateTime(date, start),
          endTime: combineDateTime(date, end),
          billable,
          tagIds: existingTagIdsOnly(tagIds, tags),
        },
      },
      {
        onSuccess: () => {
          toast.success(editing ? "Entry updated" : "Entry added");
          onClose();
        },
        onError: (err) => toast.error(err.message || "Save failed"),
      },
    );
  };

  // Enter saves from anywhere in the editor (including the time fields).
  useKeyListener({ keys: "Enter", onEnter: save });

  const createTag = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const tag = await apiFetch<Tag>("/tags", {
        method: "POST",
        body: { name: trimmed, color: "#3F8F8C" },
      });
      qc.setQueryData<Tag[]>(keys.tags, (prev) => [...(prev || []), tag]);
      void qc.invalidateQueries({ queryKey: keys.tags });
      setTagIds((prev) => [...prev, tag.id]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tag create failed");
    }
  };

  // Moving the start keeps the duration; editing the duration moves the end.
  const changeStart = (v: unknown) => {
    if (typeof v !== "string" || !v || v === start) return;
    const oldDur = parseTimeToSec(end) - parseTimeToSec(start);
    setStart(v);
    setEnd(addSecToTime(v, oldDur > 0 ? oldDur : 3600));
  };
  const changeEnd = (v: unknown) => {
    if (typeof v !== "string" || !v || v === end) return;
    setEnd(v);
  };
  const changeDuration = (v: unknown) => {
    const sec = parseHmsToSec(typeof v === "string" ? v : "");
    if (sec <= 0) return;
    const newEnd = addSecToTime(start, sec);
    if (newEnd !== end) setEnd(newEnd);
  };

  const requestDelete = () => {
    if (!editing) return;
    onClose();
    onDeleteRequested(editing);
  };

  const description = (
    <div className="stack stack--gap-2">
      <DescriptionAutocomplete
        id="descrInput"
        label="What did you work on?"
        width="100%"
        rows={5}
        maxLength={200}
        resize="none"
        initialValue={descr}
        suggestions={suggestions}
        onDidChange={(v) => setDescr(v || "")}
        placeholder="Add description..."
      />
      <div className="text-xs text-secondary" style={{ alignSelf: "flex-end" }}>
        {descr.length} / 200
      </div>
    </div>
  );

  const projectAndTags = (
    <>
      <AutoComplete
        label="Project"
        placeholder="Search project"
        options={projects.map((p) => ({ value: p.id, label: p.name, color: p.color }))}
        value={projectId}
        onChange={setProjectId}
      />
      <div className="stack stack--gap-1">
        <AutoComplete
          label="Tags"
          placeholder="Search tag"
          multiple
          options={tags.map((t) => ({ value: t.id, label: t.name, color: t.color }))}
          value={tagIds}
          onChange={(v) => setTagIds(existingTagIdsOnly(v, tags))}
          onCreate={(name) => void createTag(name)}
        />
        <div className="text-xs text-secondary">Add tags to help organize your time entries</div>
      </div>
    </>
  );

  const fieldWidth = isMobile ? "100%" : undefined;
  const time = (
    <Card style={CARD_SHADOW}>
      <div className="stack stack--gap-3">
        <div className="text-strong" style={{ fontWeight: 500 }}>
          Time
        </div>
        <div className="row row--gap-3 row--end">
          <div className={isMobile ? "grow" : undefined}>
            <TimePicker
              id="startInput"
              label="Start"
              iconAlign="start"
              width={fieldWidth}
              value={start}
              onDidChange={changeStart}
            />
          </div>
          <div className="text-secondary" style={{ height: 40, display: "flex", alignItems: "center" }}>
            →
          </div>
          <div className={isMobile ? "grow" : undefined}>
            <TimePicker
              id="endInput"
              label="End"
              iconAlign="start"
              width={fieldWidth}
              value={end}
              onDidChange={changeEnd}
            />
          </div>
        </div>
        <div>
          <TimePicker
            id="durInput"
            label="Duration"
            iconAlign="start"
            iconName="timer"
            step={60}
            width={fieldWidth}
            value={duration}
            onDidChange={changeDuration}
          />
        </div>
      </div>
    </Card>
  );

  const dateAndBillable = (
    <>
      <DatePicker
        id="entryDatePicker"
        label="Date"
        width="100%"
        initialValue={date}
        onDidChange={(v) => {
          if (typeof v === "string" && v) setDate(v);
        }}
        dateFormat="yyyy-MM-dd"
        startIcon="date"
      />
      <div className="row row--gap-3">
        <div className="stack stack--gap-1 grow">
          <div className="text-strong" style={{ fontWeight: 500 }}>
            Billable
          </div>
          <div className="text-xs text-secondary">Mark this entry as billable</div>
        </div>
        <Switch checked={billable} onChange={setBillable} label="Billable" />
      </div>
    </>
  );

  const title = editing ? "Edit entry" : "New entry";

  if (isMobile) {
    return (
      <Sheet open onClose={onClose} title={title} tall mobileAction={<DrawerAction onClick={save} />}>
        <Card style={CARD_SHADOW}>{description}</Card>
        <Card style={CARD_SHADOW}>
          <div className="stack stack--gap-3">{projectAndTags}</div>
        </Card>
        {time}
        <Card style={CARD_SHADOW}>
          <div className="stack stack--gap-3">{dateAndBillable}</div>
        </Card>
        {editing && (
          <Button
            block
            icon="trash"
            label="Delete"
            variant="outlined"
            themeColor="attention"
            onClick={requestDelete}
          />
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      maxWidth={720}
      footer={
        <>
          {editing && (
            <Button
              icon="trash"
              label="Delete"
              variant="outlined"
              themeColor="attention"
              onClick={requestDelete}
            />
          )}
          <span className="spacer" />
          <Button label="Cancel" variant="outlined" themeColor="secondary" onClick={onClose} />
          <Button label="Save entry" onClick={save} />
        </>
      }
    >
      <div className="row row--gap-4 row--stretch">
        <Card className="grow" style={CARD_SHADOW}>
          <div className="stack stack--gap-3">
            {description}
            {projectAndTags}
          </div>
        </Card>
        <div className="stack stack--gap-3 grow">
          {time}
          <Card className="grow" style={{ ...CARD_SHADOW, justifyContent: "space-between" }}>
            {dateAndBillable}
          </Card>
        </div>
      </div>
    </Sheet>
  );
}
