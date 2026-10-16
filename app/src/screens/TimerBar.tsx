import { useRef, useState } from "react";

import { Picker } from "../components/Picker/Picker";
import { projectsForPicker } from "../lib/format";
import { useClients, useProjects, useSaveEntry, useTags } from "../lib/queries";
import { useKeyListener } from "../lib/useKeyListener";
import { useStopwatch } from "../lib/useStopwatch";
import { Button } from "../ui/Button";
import { TextField } from "../ui/controls";
import { toast } from "../ui/toast";

/**
 * Header timer: description + project/tag pickers + play/stop. Stopping
 * saves the entry right away.
 */
export function TimerBar() {
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: tags = [] } = useTags();
  const saveEntry = useSaveEntry();

  const [descr, setDescr] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);

  // The stop handler runs from timers / tray events; read the latest form
  // values through a ref instead of a stale closure.
  const formRef = useRef({ descr, projectId, tagIds });
  formRef.current = { descr, projectId, tagIds };

  const sw = useStopwatch({
    label: descr,
    onStop: ({ startTime, endTime }) => {
      const f = formRef.current;
      saveEntry.mutate(
        {
          body: {
            projectId: f.projectId || null,
            description: f.descr || "",
            startTime,
            endTime,
            tagIds: f.tagIds,
          },
        },
        {
          onSuccess: () => {
            toast.success("Entry saved");
            setDescr("");
            setTagIds([]);
          },
          onError: () => toast.error("Save failed"),
        },
      );
    },
    onResume: (p) => {
      setDescr(p.description || "");
      setProjectId(p.projectId || null);
    },
  });

  // Alt+T (Option+T on macOS) starts/stops the timer. A bare "T" fired too
  // easily by accident, so the shortcut needs a modifier; with one it is safe
  // to keep active inside text fields too. The chord matches exact
  // modifiers, so the desktop global hotkey (Cmd/Ctrl+Shift+T) never
  // double-fires it.
  useKeyListener({
    chord: "Alt+T",
    onKey: () => (sw.running ? sw.stop() : sw.start()),
  });

  return (
    <div className="row row--gap-3 grow">
      <TextField
        className="grow"
        variant="ghost"
        placeholder="What are you working on?"
        value={descr}
        onChange={setDescr}
      />
      <Picker
        icon="folder"
        data={projectsForPicker(projects, clients)}
        valueField="id"
        labelField="name"
        groupField="clientName"
        colorField="color"
        searchPlaceholder="Search project or client"
        value={projectId ?? ""}
        onDidChange={(v) => setProjectId((v as string | null) || null)}
      />
      <Picker
        icon="hash"
        multiSelect
        data={tags}
        valueField="id"
        labelField="name"
        colorField="color"
        searchPlaceholder="Search tag"
        value={tagIds}
        onDidChange={(v) => setTagIds((v as string[] | null) || [])}
      />
      <span className="keycap" title="Press Alt+T (⌥T on Mac) to start or stop the timer">
        Alt+T
      </span>
      <span className="text-mono text-bold" style={{ fontSize: "1.25rem", color: "var(--animo-textColor-primary)" }}>
        {sw.display}
      </span>
      {sw.running ? (
        <Button label="■" themeColor="attention" title="Stop the timer (Alt+T)" onClick={sw.stop} />
      ) : (
        <Button label="▶" title="Start the timer (Alt+T)" onClick={sw.start} />
      )}
    </div>
  );
}
