import * as Popover from "@radix-ui/react-popover";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = Record<string, unknown>;

export type PickerProps = {
  data?: Item[];
  valueField?: string;
  labelField?: string;
  groupField?: string;
  colorField?: string;
  value?: string | string[];
  initialValue?: string | string[];
  multiSelect?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  icon?: string;
  iconActiveColor?: string;
  onDidChange?: (value: string | string[] | null) => void;
  updateState?: (state: Record<string, unknown>) => void;
  registerComponentApi?: (
    apis: Record<string, (...args: unknown[]) => unknown>,
  ) => void;
};

const stringValue = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v);
};

const normaliseValue = (v: string | string[] | undefined): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  return v === "" ? [] : [String(v)];
};

export function Picker(props: PickerProps) {
  const {
    data,
    valueField = "id",
    labelField = "name",
    groupField,
    colorField,
    value: controlledValue,
    initialValue,
    multiSelect = false,
    searchable = true,
    searchPlaceholder = "Search",
    icon = "filter",
    iconActiveColor = "var(--xmlui-color-primary, rgb(37, 99, 235))",
    onDidChange,
    updateState,
    registerComponentApi,
  } = props;

  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string[]>(() =>
    normaliseValue(controlledValue ?? initialValue),
  );
  const value = isControlled ? normaliseValue(controlledValue) : internalValue;

  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Reset search when the popover closes.
  useEffect(() => {
    if (!open) setSearchTerm("");
  }, [open]);

  // Normalise items so the rest of the component is field-name agnostic.
  const items = useMemo(() => {
    return (data || []).map((raw) => ({
      raw,
      value: stringValue(raw[valueField]),
      label: stringValue(raw[labelField] ?? raw[valueField]),
      group: groupField ? stringValue(raw[groupField]) : "",
      color: colorField ? stringValue(raw[colorField]) : "",
    }));
  }, [data, valueField, labelField, groupField, colorField]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q),
    );
  }, [items, searchTerm]);

  // Group filtered items by groupField if configured.
  const grouped = useMemo(() => {
    if (!groupField) return null;
    const map = new Map<string, typeof filteredItems>();
    for (const it of filteredItems) {
      const key = it.group || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()].map(([key, list]) => ({ key, list }));
  }, [filteredItems, groupField]);

  const setValue = (next: string[]) => {
    if (!isControlled) setInternalValue(next);
    const payload = multiSelect ? next : next[0] || null;
    updateState?.({ value: payload });
    onDidChange?.(payload);
  };

  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;
  useEffect(() => {
    if (!registerComponentApi) return;
    registerComponentApi({
      setValue: ((v: unknown) => {
        const arr = normaliseValue(v as string | string[]);
        setValueRef.current(arr);
      }) as unknown as (...args: unknown[]) => unknown,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerComponentApi]);

  // Initial state mirror.
  useEffect(() => {
    updateState?.({ value: multiSelect ? value : value[0] || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => {
    if (multiSelect) {
      setValue(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    } else {
      setValue([id]);
      setOpen(false);
    }
  };

  const hasValue = value.length > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={icon}
          style={triggerStyle(hasValue, iconActiveColor)}
        >
          <PickerIcon
            name={icon}
            color={hasValue ? iconActiveColor : "currentColor"}
          />
          {multiSelect && hasValue && (
            <span style={badgeStyle(iconActiveColor)}>{value.length}</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          style={contentStyle}
          onOpenAutoFocus={(e) => {
            // Focus the search input first when popover opens.
            if (searchable) {
              e.preventDefault();
              const input = (e.currentTarget as HTMLElement)?.querySelector(
                "input",
              ) as HTMLInputElement | null;
              input?.focus();
            }
          }}
        >
          {searchable && (
            <div
              style={{
                padding: 8,
                borderBottom: "1px solid var(--xmlui-borderColor, rgb(229, 231, 235))",
              }}
            >
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
          <div style={listStyle}>
            {grouped
              ? grouped.map(({ key, list }) => (
                  <div key={key}>
                    <div style={groupLabelStyle}>{key}</div>
                    {list.map((it) => (
                      <ItemRow
                        key={it.value}
                        item={it}
                        selected={value.includes(it.value)}
                        onClick={() => toggle(it.value)}
                      />
                    ))}
                  </div>
                ))
              : filteredItems.map((it) => (
                  <ItemRow
                    key={it.value}
                    item={it}
                    selected={value.includes(it.value)}
                    onClick={() => toggle(it.value)}
                  />
                ))}
            {filteredItems.length === 0 && (
              <div style={emptyStyle}>No results</div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ItemRow({
  item,
  selected,
  onClick,
}: {
  item: { value: string; label: string; color: string };
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...itemStyle,
        background: selected
          ? "var(--xmlui-color-surface-200, rgb(241, 245, 249))"
          : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.background =
            "var(--xmlui-color-surface-100, rgb(248, 250, 252))";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      {item.color && (
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 3,
            backgroundColor: item.color,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
    </button>
  );
}

function PickerIcon({ name, color }: { name: string; color?: string }) {
  const path = ICON_PATHS[name];
  if (!path) {
    return (
      <span
        data-icon-name={name}
        style={{ width: 16, height: 16, display: "inline-block" }}
      />
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon-name={name}
      style={{ flexShrink: 0 }}
    >
      {path}
    </svg>
  );
}

const ICON_PATHS: Record<string, JSX.Element> = {
  filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
  hash: (
    <>
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </>
  ),
  folder: (
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  ),
  checkmark: <polyline points="20 6 9 17 4 12" />,
  square: <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />,
};

// --- Styles ----------------------------------------------------------------

const triggerStyle = (
  hasValue: boolean,
  activeColor: string,
): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: hasValue ? `1px solid ${activeColor}` : "1px solid transparent",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  color: hasValue
    ? activeColor
    : "var(--xmlui-textColor-secondary, rgb(71, 85, 105))",
  fontWeight: hasValue ? 600 : 400,
  fontSize: 14,
});

const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 18,
  height: 18,
  padding: "0 6px",
  borderRadius: 999,
  background: color,
  color: "white",
  fontSize: 11,
  fontWeight: 600,
});

const contentStyle: React.CSSProperties = {
  // Tone-aware popover surface. The theme defines
  // `backgroundColor-popover-Picker` per tone:
  //   light → `$color-primary-50` (Mist) — soft branded panel
  //   dark  → `$backgroundColor-primary` (matches ModalDialog)
  // Fallback chain keeps a sensible default if the theme isn't loaded.
  background:
    "var(--xmlui-backgroundColor-popover-Picker, var(--xmlui-backgroundColor-primary, white))",
  color: "var(--xmlui-textColor-primary, inherit)",
  boxShadow:
    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  border: "1px solid var(--xmlui-borderColor, rgb(229, 231, 235))",
  borderRadius: 8,
  minWidth: 240,
  maxWidth: 360,
  overflow: "hidden",
  zIndex: 1000,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--xmlui-color-surface-50, transparent)",
  color: "var(--xmlui-textColor-primary, inherit)",
  border: "1px solid var(--xmlui-borderColor, rgb(229, 231, 235))",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const listStyle: React.CSSProperties = {
  maxHeight: 320,
  overflowY: "auto",
  padding: 4,
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  color: "inherit",
  textAlign: "left" as const,
};

const groupLabelStyle: React.CSSProperties = {
  padding: "8px 10px 4px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--xmlui-textColor-secondary, rgb(100, 116, 139))",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const emptyStyle: React.CSSProperties = {
  padding: "12px 10px",
  fontSize: 14,
  color: "var(--xmlui-textColor-secondary, rgb(100, 116, 139))",
  textAlign: "center",
};

export default Picker;
