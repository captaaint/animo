import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect } from "@ark-ui/react/select";
import cx from "classnames";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Icon } from "./Icon";

// ---------------------------------------------------------------------------------------------------------------------
// Select — single choice from a short, fixed list.
// ---------------------------------------------------------------------------------------------------------------------

export type SelectOption = { value: string; label: string };

export function Select({
  label,
  options,
  value,
  onChange,
  testId,
  style,
  className,
}: {
  label?: ReactNode;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const collection = useMemo(() => createListCollection({ items: options }), [options]);
  return (
    <ArkSelect.Root
      collection={collection}
      value={[value]}
      onValueChange={(d) => {
        if (d.value[0] !== undefined && d.value[0] !== value) onChange(d.value[0]);
      }}
      positioning={{ sameWidth: true }}
      className={cx("field", className)}
      style={style}
    >
      {label && <ArkSelect.Label className="field__label">{label}</ArkSelect.Label>}
      <ArkSelect.Control>
        <ArkSelect.Trigger className="input select__trigger" data-testid={testId}>
          <ArkSelect.ValueText />
          <Icon name="chevrondown" className="select__indicator" />
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner className="menu-positioner">
          <ArkSelect.Content className="menu">
            {options.map((o) => (
              <ArkSelect.Item key={o.value} item={o} className="menu__item">
                <ArkSelect.ItemText>{o.label}</ArkSelect.ItemText>
                <ArkSelect.ItemIndicator className="menu__indicator">
                  <Icon name="check" size={14} />
                </ArkSelect.ItemIndicator>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// AutoComplete — searchable combobox, single or multi, optionally grouped
// and "creatable" (typing an unknown name offers to create it).
// ---------------------------------------------------------------------------------------------------------------------

export type AutoCompleteOption = {
  value: string;
  label: string;
  color?: string;
  group?: string;
  /** Extra strings the search matches (e.g. the client name of a project). */
  keywords?: string[];
};

const CREATE_PREFIX = "\u0000create:";

type AutoCompleteBaseProps = {
  label?: ReactNode;
  placeholder?: string;
  options: AutoCompleteOption[];
  testId?: string;
  style?: CSSProperties;
  className?: string;
  /** Render group headers (options need a `group`). */
  grouped?: boolean;
  /** Offer to create a new option from the typed text. */
  onCreate?: (name: string) => void;
};

type AutoCompleteProps = AutoCompleteBaseProps &
  (
    | { multiple?: false; value: string | null; onChange: (value: string | null) => void }
    | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  );

function matches(option: AutoCompleteOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (option.label.toLowerCase().includes(q)) return true;
  return (option.keywords || []).some((k) => k.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------------------------------------------------
// ChipRow — the selected values of a multi AutoComplete, kept on a single line. Chips that don't fit collapse into a
// "+N" badge so the field never grows taller (and never resizes the modal it sits in).
// ---------------------------------------------------------------------------------------------------------------------

// Room kept for the search input next to the chips.
const CHIP_INPUT_MIN = 64;
const CHIP_GAP = 4;

function Chip({ option, onRemove }: { option: AutoCompleteOption; onRemove: () => void }) {
  return (
    <span
      className="chip"
      style={option.color ? ({ "--chip-color": option.color } as CSSProperties) : undefined}
    >
      <span className="chip__dot" />
      <span className="chip__label">{option.label}</span>
      <button
        type="button"
        className="chip__remove"
        aria-label={`Remove ${option.label}`}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </button>
    </span>
  );
}

function ChipRow({
  chips,
  onRemove,
}: {
  chips: AutoCompleteOption[];
  onRemove: (value: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(chips.length);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    const control = rowRef.current?.parentElement;
    if (!measure || !control) return;

    const fit = () => {
      const cs = getComputedStyle(control);
      const gap = parseFloat(cs.columnGap) || 0;
      const trigger = control.querySelector<HTMLElement>(".combobox__trigger");
      const available =
        control.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight) -
        (trigger?.offsetWidth ?? 0) -
        CHIP_INPUT_MIN -
        gap * 2;
      const widths = [...measure.querySelectorAll<HTMLElement>("[data-chip]")].map(
        (el) => el.offsetWidth,
      );
      const badge = measure.querySelector<HTMLElement>("[data-badge]")?.offsetWidth ?? 0;

      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const next = used + (i ? CHIP_GAP : 0) + widths[i];
        const rest = i < widths.length - 1 ? CHIP_GAP + badge : 0;
        if (next + rest > available) break;
        used = next;
        count++;
      }
      // Always show at least one chip; its label truncates if even that is too wide.
      setVisible(Math.max(1, count));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(control);
    return () => ro.disconnect();
  }, [chips]);

  const shown = chips.slice(0, visible);
  const hidden = chips.slice(visible);

  return (
    <div ref={rowRef} className="chip-row">
      {shown.map((o) => (
        <Chip key={o.value} option={o} onRemove={() => onRemove(o.value)} />
      ))}
      {hidden.length > 0 && (
        <span className="chip chip--more" title={hidden.map((o) => o.label).join(", ")}>
          +{hidden.length}
        </span>
      )}
      {/* Invisible copy at natural widths, used to decide how many chips fit. */}
      <div ref={measureRef} className="chip-row__measure" aria-hidden="true">
        {chips.map((o) => (
          <span key={o.value} data-chip>
            <Chip option={o} onRemove={() => {}} />
          </span>
        ))}
        <span data-badge className="chip chip--more">
          +{chips.length}
        </span>
      </div>
    </div>
  );
}

export function AutoComplete(props: AutoCompleteProps) {
  const { label, placeholder, options, testId, style, className, grouped, onCreate } = props;
  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedLabel = props.multiple
    ? ""
    : (options.find((o) => o.value === props.value)?.label ?? "");

  // `query` drives filtering (only what the user typed); `inputValue` is what
  // the input shows — for single selects that is the selected label while
  // the popup is closed.
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open && !props.multiple) setInputValue(selectedLabel);
  }, [open, selectedLabel, props.multiple]);

  const items = useMemo(() => {
    const filtered = options.filter((o) => matches(o, query));
    const typed = query.trim();
    if (
      onCreate &&
      typed &&
      !options.some((o) => o.label.toLowerCase() === typed.toLowerCase())
    ) {
      filtered.push({ value: CREATE_PREFIX + typed, label: `Create "${typed}"` });
    }
    return filtered;
  }, [options, query, onCreate]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        groupBy: grouped ? (o: AutoCompleteOption) => o.group ?? "" : undefined,
      }),
    [items, grouped],
  );

  const handleValueChange = (next: string[]) => {
    const create = next.find((v) => v.startsWith(CREATE_PREFIX));
    const clean = next.filter((v) => !v.startsWith(CREATE_PREFIX));
    if (create) {
      onCreate?.(create.slice(CREATE_PREFIX.length));
      setQuery("");
      if (!props.multiple) return;
    }
    if (props.multiple) props.onChange(clean);
    else props.onChange(clean[clean.length - 1] ?? null);
  };

  const renderItem = (o: AutoCompleteOption) => (
    <Combobox.Item key={o.value} item={o} className="menu__item">
      {o.color && <span className="swatch" style={{ background: o.color }} />}
      <Combobox.ItemText>{o.label}</Combobox.ItemText>
      <Combobox.ItemIndicator className="menu__indicator">
        <Icon name="check" size={14} />
      </Combobox.ItemIndicator>
    </Combobox.Item>
  );

  const chips = props.multiple
    ? selected
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is AutoCompleteOption => !!o)
    : [];

  return (
    <Combobox.Root
      collection={collection}
      multiple={props.multiple}
      value={selected}
      onValueChange={(d) => handleValueChange(d.value)}
      inputValue={inputValue}
      onInputValueChange={(d) => {
        setInputValue(d.inputValue);
        if (d.reason === "input-change") {
          setQuery(d.inputValue);
          if (!props.multiple && d.inputValue === "" && props.value) props.onChange(null);
        }
      }}
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (!d.open) setQuery("");
      }}
      openOnClick
      inputBehavior="autohighlight"
      selectionBehavior={props.multiple ? "clear" : "replace"}
      placeholder={chips.length ? undefined : placeholder}
      positioning={{ sameWidth: true }}
      className={cx("field", className)}
      style={style}
    >
      {label && <Combobox.Label className="field__label">{label}</Combobox.Label>}
      <Combobox.Control className="input combobox__control" data-testid={testId}>
        {props.multiple && chips.length > 0 && (
          <ChipRow
            chips={chips}
            onRemove={(v) => props.onChange(selected.filter((x) => x !== v))}
          />
        )}
        <Combobox.Input className="combobox__input" />
        <Combobox.Trigger className="combobox__trigger" aria-label="Toggle options">
          <Icon name="chevrondown" size={16} />
        </Combobox.Trigger>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner className="menu-positioner">
          <Combobox.Content className="menu">
            {items.length === 0 && <div className="menu__empty">No matches</div>}
            {grouped
              ? collection.group().map(([group, groupItems]) => (
                  <Combobox.ItemGroup key={group}>
                    <Combobox.ItemGroupLabel className="menu__group">
                      {group.toUpperCase()}
                    </Combobox.ItemGroupLabel>
                    {groupItems.map(renderItem)}
                  </Combobox.ItemGroup>
                ))
              : items.map(renderItem)}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
