import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import cx from "classnames";
import { Popover as ArkPopover } from "@ark-ui/react/popover";

import styles from "./TimePicker.module.scss";

type UpdateStateFn = (
  state: Record<string, unknown>,
  options?: Record<string, unknown>,
) => void;

type RegisterApiFn = (api: Record<string, unknown>) => void;

type TimeRangeValue = { from?: string; to?: string };

type TimePickerMode = "single" | "range";

type IconAlign = "start" | "end" | "none";

type TimePickerProps = {
  id?: string;
  className?: string;
  mode?: TimePickerMode;
  value?: string | TimeRangeValue | null;
  initialValue?: string | TimeRangeValue | null;
  label?: string;
  enabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  step?: number;
  bordered?: boolean;
  iconAlign?: IconAlign;
  iconName?: "clock" | "timer";
  hoursLabel?: string;
  minutesLabel?: string;
  secondsLabel?: string;
  hourCycle?: 24 | 12;
  placeholder?: string;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  validationStatus?: "none" | "error" | "warning" | "valid";
  testId?: string;
  onDidChange?: (value: string | TimeRangeValue | undefined) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterApiFn;
};

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const padTime = (v: unknown): string => {
  if (typeof v !== "string") return "";
  const m = v.match(TIME_RE);
  if (!m) return "";
  const [, h, mm, ss] = m;
  const hh = h.padStart(2, "0");
  return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
};

const parseParts = (v: string | undefined): [number, number, number] => {
  if (!v) return [0, 0, 0];
  const m = v.match(TIME_RE);
  if (!m) return [0, 0, 0];
  return [
    parseInt(m[1], 10) || 0,
    parseInt(m[2], 10) || 0,
    parseInt(m[3] ?? "0", 10) || 0,
  ];
};

const formatParts = (
  h: number,
  m: number,
  s: number,
  withSeconds: boolean,
): string => {
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  if (withSeconds) {
    const ss = String(s).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
};

// Parses a user-typed time string into a normalized "HH:mm" (or "HH:mm:ss"
// when seconds are shown), enforcing hours 0-23 and minutes/seconds 0-59.
// Accepts colon forms ("9:30", "09:30:05") and bare digit runs ("0930",
// "093005"). Returns null when the text can't be read as an in-range time.
// `requireComplete` (used for live keystroke commits) only accepts a fully
// specified colon form so partial typing doesn't prematurely change the value.
const parseTypedTime = (
  raw: string,
  withSeconds: boolean,
  requireComplete: boolean,
): string | null => {
  const t = raw.trim();
  if (!t) return null;
  let h: number;
  let m: number;
  let s = 0;
  const colon = t.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    // While live-typing, wait until the minutes are fully entered so "9:3"
    // doesn't jump to 09:03 mid-keystroke.
    if (requireComplete && colon[2].length < 2) return null;
    h = parseInt(colon[1], 10);
    m = parseInt(colon[2], 10);
    s = colon[3] != null ? parseInt(colon[3], 10) : 0;
  } else if (/^\d+$/.test(t)) {
    // Bare digits are only resolved on blur/Enter, never live.
    if (requireComplete) return null;
    if (t.length <= 2) {
      h = parseInt(t, 10);
      m = 0;
    } else if (t.length === 3) {
      h = parseInt(t.slice(0, 1), 10);
      m = parseInt(t.slice(1), 10);
    } else if (t.length === 4) {
      h = parseInt(t.slice(0, 2), 10);
      m = parseInt(t.slice(2), 10);
    } else if (t.length === 5) {
      h = parseInt(t.slice(0, 1), 10);
      m = parseInt(t.slice(1, 3), 10);
      s = parseInt(t.slice(3), 10);
    } else {
      h = parseInt(t.slice(0, 2), 10);
      m = parseInt(t.slice(2, 4), 10);
      s = parseInt(t.slice(4, 6), 10);
    }
  } else {
    return null;
  }
  if (h > 23 || m > 59 || s > 59) return null;
  return formatParts(h, m, withSeconds ? s : 0, withSeconds);
};

const normalizeToRange = (
  v: unknown,
  mode: TimePickerMode,
): TimeRangeValue | string | undefined => {
  if (v == null) return mode === "range" ? { from: "", to: "" } : "";
  if (mode === "single") return padTime(v);
  if (Array.isArray(v)) {
    return { from: padTime(v[0]), to: padTime(v[1]) };
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return { from: padTime(obj.from), to: padTime(obj.to) };
  }
  return { from: "", to: "" };
};

type WheelProps = {
  value: string;
  onChange: (next: string) => void;
  step: number;
  hoursLabel: string;
  minutesLabel: string;
  secondsLabel: string;
  hourCycle: 24 | 12;
};

function TimeWheel({
  value,
  onChange,
  step,
  hoursLabel,
  minutesLabel,
  secondsLabel,
  hourCycle,
}: WheelProps) {
  const [h, m, s] = parseParts(value);
  const withSeconds = step > 0 && step < 60;
  const hourMax = hourCycle === 12 ? 12 : 24;
  const hours = useMemo(
    () => Array.from({ length: hourMax }, (_, i) => i),
    [hourMax],
  );
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const seconds = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const update = (nh: number, nm: number, ns: number) => {
    onChange(formatParts(nh, nm, ns, withSeconds));
  };

  return (
    <div className={styles.wheel}>
      <Column
        label={hoursLabel}
        items={hours}
        selected={h}
        onSelect={(v) => update(v, m, s)}
      />
      <Column
        label={minutesLabel}
        items={minutes}
        selected={m}
        onSelect={(v) => update(h, v, s)}
      />
      {withSeconds && (
        <Column
          label={secondsLabel}
          items={seconds}
          selected={s}
          onSelect={(v) => update(h, m, v)}
        />
      )}
    </div>
  );
}

function Column({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const target = list.querySelector<HTMLElement>(
      `[data-value="${selected}"]`,
    );
    if (target) {
      list.scrollTo({
        top:
          target.offsetTop - list.clientHeight / 2 + target.clientHeight / 2,
        behavior: "auto",
      });
    }
  }, [selected]);

  return (
    <div className={styles.wheelColumn}>
      <div className={styles.wheelColumnHeader}>{label}</div>
      <div className={styles.wheelColumnList} ref={listRef}>
        {items.map((v) => (
          <button
            key={v}
            type="button"
            data-value={v}
            data-selected={v === selected ? "true" : "false"}
            className={styles.wheelCell}
            onClick={() => onSelect(v)}
          >
            {String(v).padStart(2, "0")}
          </button>
        ))}
      </div>
    </div>
  );
}

type SlotProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  enabled: boolean;
  readOnly: boolean;
  iconAlign: IconAlign;
  iconName?: "clock" | "timer";
  ariaLabel?: string;
  placeholder: string;
  step: number;
  hoursLabel: string;
  minutesLabel: string;
  secondsLabel: string;
  hourCycle: 24 | 12;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

function TimeSlot({
  id,
  value,
  onChange,
  enabled,
  readOnly,
  iconAlign,
  iconName,
  ariaLabel,
  placeholder,
  step,
  hoursLabel,
  minutesLabel,
  secondsLabel,
  hourCycle,
  onFocus,
  onBlur,
  inputRef,
}: SlotProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const withSeconds = step > 0 && step < 60;

  // The normalized text for the current value; the input mirrors this whenever
  // the user isn't actively editing (e.g. after a wheel pick or setValue call).
  const formatted = value ? formatParts(...parseParts(value), withSeconds) : "";
  const [text, setText] = useState(formatted);
  useEffect(() => {
    if (!focused) setText(formatted);
  }, [formatted, focused]);

  // Commit the typed text. `lenient` (blur/Enter) also accepts bare-digit and
  // single-digit-minute forms; otherwise only a full HH:MM[:SS] is accepted.
  // Returns true when a valid time was committed.
  const commit = useCallback(
    (lenient: boolean): boolean => {
      const parsed = parseTypedTime(text, withSeconds, !lenient);
      if (parsed === null) return false;
      if (parsed !== formatted) onChange(parsed);
      setText(parsed);
      return true;
    },
    [text, withSeconds, formatted, onChange],
  );

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Restrict to digits and colons and cap to the active format's length.
    const cleaned = e.target.value
      .replace(/[^\d:]/g, "")
      .slice(0, withSeconds ? 8 : 5);
    setText(cleaned);
    // Live-commit only once a full, valid HH:MM[:SS] is present so the wheel
    // stays in sync; partial typing waits until blur/Enter.
    const parsed = parseTypedTime(cleaned, withSeconds, true);
    if (parsed !== null && parsed !== formatted) onChange(parsed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!commit(true)) setText(formatted); // revert invalid input
      setOpen(false);
    } else if (e.key === "Escape") {
      setText(formatted); // discard edits
      setOpen(false);
    } else if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true); // open the wheel from the keyboard
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    if (!commit(true)) setText(formatted); // revert partial/invalid on blur
    onBlur?.(e);
  };

  const icon =
    iconAlign === "none" ? null : iconName === "timer" ? (
      <TimerGlyph className={styles.triggerIcon} />
    ) : (
      <ClockGlyph className={styles.triggerIcon} />
    );

  const iconButton = icon && (
    <ArkPopover.Trigger asChild>
      <button
        type="button"
        className={styles.iconButton}
        tabIndex={-1}
        disabled={!enabled || readOnly}
        aria-label={ariaLabel ? `Open ${ariaLabel} picker` : "Open time picker"}
      >
        {icon}
      </button>
    </ArkPopover.Trigger>
  );

  return (
    <ArkPopover.Root
      open={open}
      onOpenChange={(d) => setOpen(d.open)}
      // Keep focus on the input when the wheel opens so typing isn't interrupted.
      autoFocus={false}
      positioning={{ placement: "bottom-start", gutter: 6 }}
    >
      <ArkPopover.Anchor asChild>
        <div
          className={styles.trigger}
          data-open={open ? "true" : "false"}
          data-empty={!value ? "true" : "false"}
          data-disabled={!enabled ? "" : undefined}
        >
          {iconAlign === "start" && iconButton}
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="numeric"
            className={styles.input}
            value={text}
            placeholder={placeholder}
            disabled={!enabled}
            readOnly={readOnly}
            aria-label={ariaLabel}
            size={withSeconds ? 8 : 5}
            autoComplete="off"
            spellCheck={false}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          {iconAlign === "end" && iconButton}
        </div>
      </ArkPopover.Anchor>
      <ArkPopover.Positioner className={styles.positioner}>
        <ArkPopover.Content className={styles.popoverContent}>
          <TimeWheel
            value={value}
            onChange={onChange}
            step={step}
            hoursLabel={hoursLabel}
            minutesLabel={minutesLabel}
            secondsLabel={secondsLabel}
            hourCycle={hourCycle}
          />
        </ArkPopover.Content>
      </ArkPopover.Positioner>
    </ArkPopover.Root>
  );
}

export const TimePicker = forwardRef<HTMLDivElement, TimePickerProps>(
  function TimePicker(
    {
      id,
      className,
      mode = "single",
      value: controlledValue,
      initialValue,
      label,
      enabled = true,
      readOnly = false,
      required = false,
      autoFocus = false,
      step = 60,
      bordered = true,
      iconAlign = "start",
      iconName,
      hoursLabel = "Hours",
      minutesLabel = "Minutes",
      secondsLabel = "Seconds",
      hourCycle = 24,
      placeholder = "--:--",
      width,
      minWidth,
      maxWidth,
      validationStatus = "none",
      testId,
      onDidChange,
      onFocus,
      onBlur,
      updateState,
      registerComponentApi,
    },
    ref,
  ) {
    const isControlled = controlledValue !== undefined;
    const firstTriggerRef = useRef<HTMLInputElement>(null);

    const seed = useMemo(
      () => normalizeToRange(controlledValue ?? initialValue, mode),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const [internalValue, setInternalValue] = useState<
      TimeRangeValue | string | undefined
    >(seed);

    const current = useMemo(
      () =>
        isControlled ? normalizeToRange(controlledValue, mode) : internalValue,
      [isControlled, controlledValue, mode, internalValue],
    );

    const latestRef = useRef(current);
    latestRef.current = current;

    const emit = useCallback(
      (next: TimeRangeValue | string | undefined) => {
        if (!isControlled) setInternalValue(next);
        latestRef.current = next;
        updateState?.({ value: next });
        onDidChange?.(next);
      },
      [isControlled, onDidChange, updateState],
    );

    const setValue = useCallback(
      (raw: unknown) => emit(normalizeToRange(raw, mode)),
      [emit, mode],
    );

    useEffect(() => {
      updateState?.({ value: latestRef.current }, { initial: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      registerComponentApi?.({
        focus: () => firstTriggerRef.current?.focus(),
        setValue,
        getValue: () => latestRef.current,
      });
    }, [registerComponentApi, setValue]);

    useEffect(() => {
      if (autoFocus) firstTriggerRef.current?.focus();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rangeValue = (current as TimeRangeValue) ?? { from: "", to: "" };
    const singleValue = typeof current === "string" ? current : "";

    const handleSingleChange = useCallback(
      (next: string) => emit(padTime(next)),
      [emit],
    );

    const handleRangeChange = useCallback(
      (key: "from" | "to") => (next: string) => {
        const prev = (latestRef.current as TimeRangeValue) ?? {
          from: "",
          to: "",
        };
        emit({ ...prev, [key]: padTime(next) });
      },
      [emit],
    );

    const slotCommon = {
      enabled,
      readOnly,
      iconAlign,
      iconName,
      placeholder,
      step,
      hoursLabel,
      minutesLabel,
      secondsLabel,
      hourCycle,
    };

    return (
      <div
        ref={ref}
        className={cx(styles.root, className)}
        data-mode={mode}
        data-bordered={bordered ? "true" : "false"}
        data-validation-status={validationStatus}
        data-stretch={
          (() => {
            const w = String(width ?? "").trim().toLowerCase();
            return w === "100%" || w === "*" || w === "full" ? "true" : undefined;
          })()
        }
        data-testid={testId}
        style={{ width, minWidth, maxWidth }}
        id={id}
      >
        {label && (
          <label
            className={styles.label}
            htmlFor={id ? `${id}-input` : undefined}
          >
            {label}
            {required && <span aria-hidden="true"> *</span>}
          </label>
        )}

        <div
          className={styles.control}
          data-disabled={!enabled ? "" : undefined}
        >
          {mode === "single" ? (
            <TimeSlot
              {...slotCommon}
              id={id ? `${id}-input` : undefined}
              value={singleValue}
              onChange={handleSingleChange}
              ariaLabel={label}
              inputRef={firstTriggerRef}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          ) : (
            <>
              <TimeSlot
                {...slotCommon}
                id={id ? `${id}-input` : undefined}
                value={rangeValue.from ?? ""}
                onChange={handleRangeChange("from")}
                ariaLabel="Start time"
                inputRef={firstTriggerRef}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <span className={styles.separator}>-</span>
              <TimeSlot
                {...slotCommon}
                value={rangeValue.to ?? ""}
                onChange={handleRangeChange("to")}
                ariaLabel="End time"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </>
          )}
        </div>
      </div>
    );
  },
);

function ClockGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function TimerGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}
