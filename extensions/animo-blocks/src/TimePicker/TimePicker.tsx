import {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import cx from "classnames";

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

const normalizeToRange = (
  v: unknown,
  mode: TimePickerMode,
): TimeRangeValue | string | undefined => {
  if (v == null) return mode === "range" ? { from: "", to: "" } : "";
  if (mode === "single") {
    return padTime(v);
  }
  if (Array.isArray(v)) {
    return { from: padTime(v[0]), to: padTime(v[1]) };
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return { from: padTime(obj.from), to: padTime(obj.to) };
  }
  return { from: "", to: "" };
};

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
    const firstInputRef = useRef<HTMLInputElement>(null);

    const seed = useMemo(
      () => normalizeToRange(controlledValue ?? initialValue, mode),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const [internalValue, setInternalValue] = useState<TimeRangeValue | string | undefined>(seed);

    const current = useMemo(
      () => (isControlled ? normalizeToRange(controlledValue, mode) : internalValue),
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
      (raw: unknown) => {
        emit(normalizeToRange(raw, mode));
      },
      [emit, mode],
    );

    useEffect(() => {
      updateState?.({ value: latestRef.current }, { initial: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      registerComponentApi?.({
        focus: () => firstInputRef.current?.focus(),
        setValue,
        getValue: () => latestRef.current,
      });
    }, [registerComponentApi, setValue]);

    const handleSingleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        emit(e.target.value);
      },
      [emit],
    );

    const handleRangeChange = useCallback(
      (key: "from" | "to") => (e: ChangeEvent<HTMLInputElement>) => {
        const prev = (current as TimeRangeValue) ?? { from: "", to: "" };
        emit({ ...prev, [key]: e.target.value });
      },
      [current, emit],
    );

    const rangeValue = (current as TimeRangeValue) ?? { from: "", to: "" };
    const singleValue = typeof current === "string" ? current : "";
    const openPicker = () => {
      const el = firstInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
      if (!el) return;
      el.focus();
      el.showPicker?.();
    };
    const icon =
      iconAlign === "none" ? null : (
        <button
          type="button"
          className={styles.adornment}
          onClick={openPicker}
          disabled={!enabled || readOnly}
          aria-label="Open time picker"
          tabIndex={-1}
        >
          <ClockGlyph />
        </button>
      );

    return (
      <div
        ref={ref}
        className={cx(styles.root, className)}
        data-mode={mode}
        data-bordered={bordered ? "true" : "false"}
        data-validation-status={validationStatus}
        data-testid={testId}
        style={{ width, minWidth, maxWidth }}
        id={id}
      >
        {label && (
          <label className={styles.label} htmlFor={id ? `${id}-input` : undefined}>
            {label}
          </label>
        )}

        <div className={styles.control} data-disabled={!enabled ? "" : undefined}>
          {iconAlign === "start" && icon}
          {mode === "single" ? (
            <input
              ref={firstInputRef}
              id={id ? `${id}-input` : undefined}
              type="time"
              className={styles.input}
              value={singleValue}
              step={step}
              disabled={!enabled}
              readOnly={readOnly}
              required={required}
              autoFocus={autoFocus}
              onChange={handleSingleChange}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          ) : (
            <>
              <input
                ref={firstInputRef}
                id={id ? `${id}-input` : undefined}
                type="time"
                className={styles.input}
                value={rangeValue.from ?? ""}
                step={step}
                disabled={!enabled}
                readOnly={readOnly}
                required={required}
                autoFocus={autoFocus}
                onChange={handleRangeChange("from")}
                onFocus={onFocus}
                onBlur={onBlur}
                aria-label="Start time"
              />
              <span className={styles.separator}>-</span>
              <input
                type="time"
                className={styles.input}
                value={rangeValue.to ?? ""}
                step={step}
                disabled={!enabled}
                readOnly={readOnly}
                required={required}
                onChange={handleRangeChange("to")}
                onFocus={onFocus}
                onBlur={onBlur}
                aria-label="End time"
              />
            </>
          )}

          {iconAlign === "end" && icon}
        </div>
      </div>
    );
  },
);

function ClockGlyph() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}
