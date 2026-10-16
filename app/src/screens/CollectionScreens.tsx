import { useState, type ReactNode } from "react";

import { useClients, useCollectionMutations, useProjects, useTags } from "../lib/queries";
import type { Client, Project, Tag } from "../lib/types";
import { useIsMobile } from "../lib/useIsMobile";
import { Button } from "../ui/Button";
import { Card, EmptyState, NumberField, Spinner, TextField, type IllustrationName } from "../ui/controls";
import { Icon } from "../ui/Icon";
import { DrawerAction, DropdownMenu, Sheet } from "../ui/overlays";
import { AutoComplete, Select } from "../ui/Select";
import { toast } from "../ui/toast";
import { DeleteConfirm, type DeleteTarget } from "./DeleteConfirm";

// Projects, clients and tags share one screen shape: a table (desktop) or a
// card list (mobile), a create/edit sheet with a name + color palette, and a
// delete confirmation. Projects add a client and an hourly rate.

const COLOR_PALETTE = [
  { hex: "#3F8F8C", name: "Sage teal" },
  { hex: "#5BA84B", name: "Forest green" },
  { hex: "#A7C957", name: "Lime" },
  { hex: "#6FCF97", name: "Mint" },
  { hex: "#F2C94C", name: "Amber" },
  { hex: "#F2994A", name: "Orange" },
  { hex: "#EB5757", name: "Coral" },
  { hex: "#EB5C9D", name: "Magenta" },
  { hex: "#9B51E0", name: "Purple" },
  { hex: "#3F51B5", name: "Indigo" },
  { hex: "#2D9CDB", name: "Sky blue" },
  { hex: "#56CCF2", name: "Light blue" },
  { hex: "#4A6172", name: "Slate" },
  { hex: "#BDBDBD", name: "Gray" },
  { hex: "#8B5E3C", name: "Brown" },
  { hex: "#C77878", name: "Dusty rose" },
];

const DEFAULT_COLOR = COLOR_PALETTE[0].hex;

const CURRENCIES = ["EUR", "USD", "GBP", "HUF"].map((c) => ({ value: c, label: c }));

function ColorPalette({
  kind,
  value,
  onChange,
  fill,
}: {
  kind: string;
  value: string;
  onChange: (hex: string) => void;
  /** Stretch to the height of the surrounding column. */
  fill?: boolean;
}) {
  const current = COLOR_PALETTE.find((c) => c.hex === value);
  return (
    <Card style={fill ? { flex: "1 1 auto" } : undefined}>
      <div className="stack stack--gap-1">
        <div className="text-bold text-strong">Color</div>
        <div className="text-secondary text-small">Choose a color to identify your {kind}</div>
      </div>
      <div className="card card--inset">
        <div className="row row--gap-3">
        <span style={{ width: 40, height: 40, borderRadius: 8, background: value, flexShrink: 0 }} />
        <div className="stack">
          <span className="text-strong">{current ? current.name : "Custom"}</span>
          <span className="text-secondary text-small">{value}</span>
        </div>
        <span className="spacer" />
        <span
          className="icon-bubble"
          style={{ width: 28, height: 28, background: "var(--animo-color-primary-500)", color: "#fff" }}
        >
          <Icon name="checkmark" size={14} />
        </span>
        </div>
      </div>
      <div className="stack stack--gap-2">
        {[COLOR_PALETTE.slice(0, 8), COLOR_PALETTE.slice(8)].map((row, i) => (
          <div key={i} className="palette-row">
            {row.map((c) => (
              <div
                key={c.hex}
                role="button"
                tabIndex={0}
                className="palette-swatch"
                style={{ background: c.hex }}
                aria-label={c.name}
                aria-pressed={value === c.hex}
                onClick={() => onChange(c.hex)}
                onKeyDown={(e) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    onChange(c.hex);
                  }
                }}
              >
                {value === c.hex && (
                  <span className="palette-swatch__check">
                    <Icon name="checkmark" size={14} color={c.hex} />
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

type Kind = "project" | "client" | "tag";

type EditorValues = {
  name: string;
  color: string;
  clientId: string | null;
  hourlyRate: number | "";
  currency: string;
};

type Item = {
  id: string;
  name: string;
  color: string;
  clientId?: string | null;
  hourlyRate?: number;
  currency?: string;
};

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function ItemEditor({
  kind,
  item,
  clients,
  onClose,
  onDeleteRequested,
  save,
}: {
  kind: Kind;
  item: Item | null;
  clients: Client[];
  onClose: () => void;
  onDeleteRequested: (item: Item) => void;
  save: (id: string | undefined, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const isMobile = useIsMobile();
  const [values, setValues] = useState<EditorValues>({
    name: item?.name || "",
    color: item?.color || DEFAULT_COLOR,
    clientId: item?.clientId ?? null,
    hourlyRate: item?.hourlyRate || 0,
    currency: item?.currency || "EUR",
  });
  const set = <K extends keyof EditorValues>(key: K, v: EditorValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  // Projects carry more fields (client, rate), so on desktop they get the
  // entry editor's two-column layout instead of one tall column.
  const twoColumns = kind === "project" && !isMobile;

  const submit = () => {
    if (!values.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const body: Record<string, unknown> =
      kind === "project"
        ? {
            name: values.name,
            clientId: values.clientId || null,
            color: values.color,
            hourlyRate: Number(values.hourlyRate) || 0,
            currency: values.currency || "EUR",
          }
        : { name: values.name, color: values.color };
    save(item?.id, body)
      .then(() => {
        toast.success(item ? `${capitalize(kind)} updated` : `${capitalize(kind)} added`);
        onClose();
      })
      .catch((err: unknown) =>
        // Tag names are unique; surface the server's message for those.
        toast.error(kind === "tag" && err instanceof Error ? err.message : "Save failed"),
      );
  };

  const requestDelete = () => {
    if (!item) return;
    onClose();
    onDeleteRequested(item);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? `Edit ${kind}` : `New ${kind}`}
      maxWidth={twoColumns ? 720 : 480}
      mobileAction={<DrawerAction onClick={submit} />}
      footer={
        <>
          {item && (
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
          <Button label={`Save ${kind}`} onClick={submit} />
        </>
      }
    >
      {twoColumns ? (
        // Same two-column layout as the entry editor: fields on the left,
        // the color palette on the right.
        <div className="row row--gap-4 row--stretch">
          <div className="stack stack--gap-3 grow">
          <Card>
            <div className="stack stack--gap-1">
              <TextField label="Name" value={values.name} onChange={(v) => set("name", v)} />
              <div className="text-secondary text-small">Choose a name for your {kind}</div>
            </div>
            {kind === "project" && (
              <div className="stack stack--gap-1">
                <AutoComplete
                  label="Client"
                  placeholder="(no client)"
                  options={clients.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
                  value={values.clientId}
                  onChange={(v) => set("clientId", v)}
                />
                <div className="text-secondary text-small">Link this project to a client (optional)</div>
              </div>
            )}
          </Card>
          {kind === "project" && (
            <Card>
              <div className="row row--gap-2 row--end">
                <NumberField
                  className="grow"
                  label="Rate"
                  value={values.hourlyRate}
                  onChange={(v) => set("hourlyRate", v)}
                  min={0}
                  step={1}
                />
                <Select
                  label="Currency"
                  style={{ width: 120 }}
                  options={CURRENCIES}
                  value={values.currency}
                  onChange={(v) => set("currency", v)}
                />
              </div>
              <div className="text-secondary text-small">Hourly billing rate for this project</div>
            </Card>
          )}
          </div>
          <div className="stack grow">
            <ColorPalette
              fill
              kind={kind}
              value={values.color}
              onChange={(hex) => set("color", hex)}
            />
          </div>
        </div>
      ) : (
        <>
        <Card>
          <div className="stack stack--gap-1">
            <TextField label="Name" value={values.name} onChange={(v) => set("name", v)} />
            <div className="text-secondary text-small">Choose a name for your {kind}</div>
          </div>
          {kind === "project" && (
            <div className="stack stack--gap-1">
              <AutoComplete
                label="Client"
                placeholder="(no client)"
                options={clients.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
                value={values.clientId}
                onChange={(v) => set("clientId", v)}
              />
              <div className="text-secondary text-small">Link this project to a client (optional)</div>
            </div>
          )}
        </Card>
        {kind === "project" && (
          <Card>
            <div className="row row--gap-2 row--end">
              <NumberField
                className="grow"
                label="Rate"
                value={values.hourlyRate}
                onChange={(v) => set("hourlyRate", v)}
                min={0}
                step={1}
              />
              <Select
                label="Currency"
                style={{ width: 120 }}
                options={CURRENCIES}
                value={values.currency}
                onChange={(v) => set("currency", v)}
              />
            </div>
            <div className="text-secondary text-small">Hourly billing rate for this project</div>
          </Card>
        )}
        <ColorPalette kind={kind} value={values.color} onChange={(hex) => set("color", hex)} />
        </>
      )}
      {isMobile && item && (
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

type Column<T> = { header: string; width?: number; cell: (item: T) => ReactNode };

function CollectionScreen<T extends Item>({
  kind,
  items,
  loaded,
  columns,
  mobileSecondary,
  emptyImage,
  emptySubtitle,
  clients = [],
}: {
  kind: Kind;
  items: T[];
  loaded: boolean;
  columns: Column<T>[];
  /** Mobile rows: optional second line + trailing text. */
  mobileSecondary?: (item: T) => { below?: ReactNode; trailing?: ReactNode };
  emptyImage: IllustrationName;
  emptySubtitle: string;
  clients?: Client[];
}) {
  const isMobile = useIsMobile();
  const collection = kind === "project" ? "projects" : kind === "client" ? "clients" : "tags";
  const { save, remove } = useCollectionMutations<T>(collection);
  const [editing, setEditing] = useState<{ item: T | null } | null>(null);
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);

  const askDelete = (item: Item) =>
    setToDelete({ kind: "item", id: item.id, name: item.name, color: item.color });

  const doDelete = (id: string) =>
    remove.mutate(id, {
      onSuccess: () => toast.success(`${capitalize(kind)} deleted`),
      onError: () => toast.error("Delete failed"),
    });

  const empty = (
    <EmptyState
      compact={isMobile}
      image={emptyImage}
      alt={`No ${kind}s yet`}
      title={`Your first ${kind} is waiting`}
      subtitle={emptySubtitle}
    />
  );

  return (
    <div className="page page--narrow">
      {editing && (
        <ItemEditor
          kind={kind}
          item={editing.item}
          clients={clients}
          onClose={() => setEditing(null)}
          onDeleteRequested={askDelete}
          save={(id, body) => save.mutateAsync({ id, body })}
        />
      )}
      <DeleteConfirm
        target={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        title={`Delete ${kind}`}
        message={`Are you sure you want to delete this ${kind}? This action cannot be undone.`}
        confirmText={`Delete this ${kind}?`}
      />

      {isMobile ? (
        <>
          <Button block label={`New ${kind}`} icon="plus" onClick={() => setEditing({ item: null })} />
          {items.length > 0 && (
            <Card style={{ padding: 8, gap: 0 }}>
              {items.map((item, i) => {
                const extra = mobileSecondary?.(item) ?? {};
                return (
                  <div key={item.id}>
                    <div className="row row--gap-3" style={{ padding: "12px 8px" }}>
                      <div className="stack stack--gap-1 grow">
                        <div className="row row--gap-2">
                          <span
                            className="color-square"
                            style={{ background: item.color, width: 14, height: 14 }}
                          />
                          <span className="text-strong ellipsis">{item.name}</span>
                        </div>
                        {extra.below && (
                          <div className="text-secondary text-xs" style={{ paddingLeft: 22 }}>
                            {extra.below}
                          </div>
                        )}
                      </div>
                      {extra.trailing && (
                        <span className="text-secondary text-small">{extra.trailing}</span>
                      )}
                      <DropdownMenu
                        trigger={
                          <Button icon="dotmenu" variant="ghost" size="sm" themeColor="secondary" />
                        }
                        items={[
                          { label: "Edit", icon: "pencil", onSelect: () => setEditing({ item }) },
                          { separator: true },
                          { label: "Delete", icon: "trash", onSelect: () => askDelete(item) },
                        ]}
                      />
                    </div>
                    {i < items.length - 1 && <div className="separator" />}
                  </div>
                );
              })}
            </Card>
          )}
          {loaded && items.length === 0 && <Card style={{ padding: 8 }}>{empty}</Card>}
          {!loaded && <Spinner />}
        </>
      ) : (
        <>
          <div className="row">
            <span className="spacer" />
            <Button label={`New ${kind}`} icon="plus" onClick={() => setEditing({ item: null })} />
          </div>
          <Card>
            {items.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.header} style={{ width: c.width }}>
                        {c.header}
                      </th>
                    ))}
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {columns.map((c) => (
                        <td key={c.header}>{c.cell(item)}</td>
                      ))}
                      <td>
                        <div className="row row--gap-1">
                          <Button
                            icon="pencil"
                            size="xs"
                            variant="ghost"
                            themeColor="secondary"
                            onClick={() => setEditing({ item })}
                          />
                          <Button
                            icon="trash"
                            size="xs"
                            variant="ghost"
                            themeColor="attention"
                            onClick={() => askDelete(item)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {loaded && items.length === 0 && empty}
            {!loaded && <Spinner />}
          </Card>
        </>
      )}
    </div>
  );
}

function formatRate(p: Project): string {
  return p.hourlyRate && p.hourlyRate > 0 ? `${p.hourlyRate} ${p.currency || "EUR"}/h` : "—";
}

export function ProjectsScreen() {
  const projects = useProjects();
  const { data: clients = [] } = useClients();
  const clientName = (p: Project) => clients.find((c) => c.id === p.clientId)?.name || "—";
  return (
    <CollectionScreen<Project>
      kind="project"
      items={projects.data || []}
      loaded={!projects.isPending}
      clients={clients}
      emptyImage="projects-empty-list"
      emptySubtitle="Create a project to get started and keep everything organized."
      columns={[
        {
          header: "Color",
          width: 80,
          cell: (p) => <span className="color-square" style={{ background: p.color }} />,
        },
        { header: "Name", cell: (p) => p.name },
        { header: "Client", cell: clientName },
        { header: "Rate", width: 120, cell: formatRate },
      ]}
      mobileSecondary={(p) => ({ below: clientName(p), trailing: formatRate(p) })}
    />
  );
}

function colorCell(item: { color: string }) {
  return (
    <span className="row row--gap-2">
      <span className="color-square" style={{ background: item.color }} />
      <span className="text-secondary">{item.color}</span>
    </span>
  );
}

export function ClientsScreen() {
  const clients = useClients();
  return (
    <CollectionScreen<Client>
      kind="client"
      items={clients.data || []}
      loaded={!clients.isPending}
      emptyImage="clients-empty-list"
      emptySubtitle="Create a client to group projects and keep reports organized."
      columns={[
        { header: "Client", cell: (c) => c.name },
        { header: "Color", width: 160, cell: colorCell },
      ]}
    />
  );
}

export function TagsScreen() {
  const tags = useTags();
  return (
    <CollectionScreen<Tag>
      kind="tag"
      items={tags.data || []}
      loaded={!tags.isPending}
      emptyImage="tags-empty-list"
      emptySubtitle="Create a tag to organize and filter your time entries."
      columns={[
        { header: "Tag", cell: (t) => t.name },
        { header: "Color", width: 160, cell: colorCell },
      ]}
    />
  );
}
