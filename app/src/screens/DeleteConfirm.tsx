import type { ReactNode } from "react";

import { formatHms, parseTimeToSec, tagsForIds } from "../lib/format";
import { useProjects, useTags } from "../lib/queries";
import type { TimeEntry } from "../lib/types";
import { useIsMobile } from "../lib/useIsMobile";
import { Button } from "../ui/Button";
import { Card } from "../ui/controls";
import { Icon, type IconName } from "../ui/Icon";
import { DrawerAction, DrawerHeader, Drawer, Modal } from "../ui/overlays";

/** What is being deleted: a time entry, or a named + colored item. */
export type DeleteTarget =
  | { kind: "entry"; entry: TimeEntry }
  | { kind: "item"; id: string; name: string; color?: string };

type Props = {
  target: DeleteTarget | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  title?: string;
  /** Desktop body text. */
  message?: string;
  /** Mobile: heading of the confirmation card. */
  confirmText?: string;
  /** Mobile: body of the confirmation card. */
  mobileMessage?: string;
};

function targetId(t: DeleteTarget): string {
  return t.kind === "entry" ? t.entry.id : t.id;
}

/** Delete confirmation — a modal on desktop, a drawer with details on mobile. */
export function DeleteConfirm({
  target,
  onClose,
  onConfirm,
  title = "Delete entry",
  message = "Are you sure you want to delete this time entry? This action cannot be undone.",
  confirmText = "Delete this entry?",
  mobileMessage = "This action cannot be undone.",
}: Props) {
  const isMobile = useIsMobile();
  const confirm = () => {
    if (target) onConfirm(targetId(target));
    onClose();
  };

  if (isMobile) {
    return (
      <Drawer
        open={!!target}
        onClose={onClose}
        title={title}
        header={
          <DrawerHeader
            title={title}
            onClose={onClose}
            action={<DrawerAction icon="trash" attention onClick={confirm} />}
          />
        }
      >
        <Card style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div className="stack stack--gap-1">
            <div className="text-strong">{confirmText}</div>
            <div className="text-small">{mobileMessage}</div>
          </div>
        </Card>
        {target?.kind === "entry" && <EntryDetails entry={target.entry} />}
        {target?.kind === "item" && (
          <Card style={{ padding: 12 }}>
            <div className="row row--gap-3">
              {target.color && (
                <span className="color-square" style={{ background: target.color }} />
              )}
              <span className="text-strong">{target.name}</span>
            </div>
          </Card>
        )}
      </Drawer>
    );
  }

  return (
    <Modal open={!!target} onClose={onClose} maxWidth={480}>
      <div className="row row--gap-3">
        <span className="icon-bubble icon-bubble--danger" style={{ width: 48, height: 48 }}>
          <Icon name="trash" />
        </span>
        <div className="text-strong" style={{ fontSize: "var(--animo-fontSize-2xl)", fontWeight: 700 }}>
          {title}
        </div>
      </div>
      <div style={{ color: "var(--animo-color-surface-700)" }}>{message}</div>
      <div className="separator" />
      <div className="row row--gap-3">
        <span className="spacer" />
        <Button label="Cancel" variant="outlined" themeColor="secondary" onClick={onClose} />
        <Button icon="trash" label="Delete" themeColor="attention" onClick={confirm} />
      </div>
    </Modal>
  );
}

function DetailRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="row row--gap-3" style={{ padding: 12 }}>
      <Icon name={icon} color="var(--animo-color-primary-500)" />
      <div className="stack stack--gap-0_5 grow">
        <div className="text-strong">{label}</div>
        <div style={{ color: "var(--animo-color-surface-700)" }}>{children}</div>
      </div>
    </div>
  );
}

function EntryDetails({ entry }: { entry: TimeEntry }) {
  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const project = projects.find((p) => p.id === entry.projectId);
  const entryTags = tagsForIds(entry.tagIds, tags);
  const startHm = entry.startTime.slice(11, 16);
  const endHm = entry.endTime.slice(11, 16);
  return (
    <Card style={{ padding: 8, gap: 0 }}>
      <DetailRow icon="doc" label="Description">
        {entry.description || "—"}
      </DetailRow>
      <div className="separator" />
      <DetailRow icon="folder" label="Project">
        {project?.name || "—"}
      </DetailRow>
      <div className="separator" />
      <DetailRow icon="tag" label="Tags">
        {entryTags.length === 0 ? (
          "—"
        ) : (
          <span className="row row--gap-2 row--wrap">
            {entryTags.map((t) => (
              <span
                key={t.id}
                className="text-small"
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  background: "var(--animo-color-primary-100)",
                  color: "var(--animo-color-primary-700)",
                }}
              >
                {t.name}
              </span>
            ))}
          </span>
        )}
      </DetailRow>
      <div className="separator" />
      <DetailRow icon="clock" label="Time">
        {startHm}–{endHm}
      </DetailRow>
      <div className="separator" />
      <DetailRow icon="timer" label="Duration">
        {formatHms(parseTimeToSec(endHm) - parseTimeToSec(startHm))}
      </DetailRow>
      <div className="separator" />
      <DetailRow icon="date" label="Date">
        {entry.startTime.slice(0, 10)}
      </DetailRow>
    </Card>
  );
}
