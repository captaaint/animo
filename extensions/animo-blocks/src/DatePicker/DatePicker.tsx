import {
  DatePicker as ArkDatePicker,
  parseDate,
  type DatePickerDateRangePreset,
  type DateValue,
} from "@ark-ui/react/date-picker";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";

import styles from "./DatePicker.module.scss";
import { useIsMobile } from "./useIsMobile";

type Mode = "single" | "range";
type ValidationStatus = "none" | "error" | "warning" | "valid";
type UpdateStateFn = (componentState: Record<string, unknown>, options?: any) => void;
type RegisterApiFn = (
  apis: Record<string, (...args: unknown[]) => unknown>,
) => void;
type RangePayload = { from?: string; to?: string };
type DatePickerPayload = string | RangePayload | undefined;
type PresetValue = DatePickerDateRangePreset;

type PresetItem = {
  value: PresetValue;
  label: string;
};

type RawPreset =
  | PresetValue
  | string
  | {
      value?: string;
      label?: string;
    };

export type DatePickerProps = {
  id?: string;
  value?: unknown;
  initialValue?: unknown;
  mode?: Mode | string;
  label?: string;
  placeholder?: string;
  dateFormat?: string;
  enabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  inline?: boolean;
  validationStatus?: ValidationStatus;
  weekStartsOn?: number | string;
  showWeekNumber?: boolean;
  showWeekNumbers?: boolean;
  startDate?: unknown;
  endDate?: unknown;
  startIcon?: string;
  endIcon?: string;
  startText?: string;
  endText?: string;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  locale?: string;
  timeZone?: string;
  numOfMonths?: number | string;
  presets?: RawPreset[] | string | boolean;
  showPresets?: boolean;
  testId?: string;
  className?: string;
  onDidChange?: (newValue: DatePickerPayload) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterApiFn;
};

const DEFAULT_DATE_FORMAT = "MM/dd/yyyy";
const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIME_ZONE = "UTC";

// On mobile the calendar is a scrollable stack of months around the focused
// month, navigated by scrolling instead of prev/next buttons. Presets cover
// longer spans, so a half-year window each way is plenty for manual scrolling.
const MOBILE_MONTHS_BEFORE = 6;
const MOBILE_MONTHS_AFTER = 6;

const PRESET_LABELS: Record<PresetValue, string> = {
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisQuarter: "This quarter",
  lastQuarter: "Last quarter",
  thisYear: "This year",
  lastYear: "Last year",
  last3Days: "Last 3 days",
  last7Days: "Last 7 days",
  last14Days: "Last 14 days",
  last30Days: "Last 30 days",
  last90Days: "Last 90 days",
};

const DEFAULT_PRESETS: PresetItem[] = [
  { value: "last7Days", label: PRESET_LABELS.last7Days },
  { value: "last30Days", label: PRESET_LABELS.last30Days },
  { value: "thisMonth", label: PRESET_LABELS.thisMonth },
  { value: "lastMonth", label: PRESET_LABELS.lastMonth },
];

const PRESET_ALIASES: Record<string, PresetValue> = {
  "this week": "thisWeek",
  thisweek: "thisWeek",
  "last week": "lastWeek",
  lastweek: "lastWeek",
  "this month": "thisMonth",
  thismonth: "thisMonth",
  "last month": "lastMonth",
  lastmonth: "lastMonth",
  "this quarter": "thisQuarter",
  thisquarter: "thisQuarter",
  "last quarter": "lastQuarter",
  lastquarter: "lastQuarter",
  "this year": "thisYear",
  thisyear: "thisYear",
  "last year": "lastYear",
  lastyear: "lastYear",
  "last 3 days": "last3Days",
  last3days: "last3Days",
  "last 7 days": "last7Days",
  last7days: "last7Days",
  "last 14 days": "last14Days",
  last14days: "last14Days",
  "last 30 days": "last30Days",
  last30days: "last30Days",
  "last 90 days": "last90Days",
  last90days: "last90Days",
};

const isDateValue = (value: unknown): value is DateValue => {
  return (
    typeof value === "object" &&
    value !== null &&
    "year" in value &&
    "month" in value &&
    "day" in value
  );
};

const toMode = (mode: unknown): Mode => {
  return String(mode || "single").toLowerCase() === "range" ? "range" : "single";
};

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
};

const toNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const cx = (...classes: Array<string | undefined | false>) => {
  return classes.filter(Boolean).join(" ");
};

const widthClass = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "100%" || normalized === "*" || normalized === "full") {
    return styles.fullWidth;
  }
  if (normalized === "auto") return styles.autoWidth;
  return undefined;
};

const pad = (value: number) => String(value).padStart(2, "0");

const dateValueToIso = (value: DateValue): string => {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
};

const formatDateValue = (value: DateValue, dateFormat: string): string => {
  const yyyy = String(value.year).padStart(4, "0");
  const MM = pad(value.month);
  const dd = pad(value.day);

  switch (dateFormat) {
    case "MM/dd/yyyy":
      return `${MM}/${dd}/${yyyy}`;
    case "MM-dd-yyyy":
      return `${MM}-${dd}-${yyyy}`;
    case "yyyy/MM/dd":
      return `${yyyy}/${MM}/${dd}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${MM}-${dd}`;
    case "dd/MM/yyyy":
      return `${dd}/${MM}/${yyyy}`;
    case "dd-MM-yyyy":
      return `${dd}-${MM}-${yyyy}`;
    case "yyyyMMdd":
      return `${yyyy}${MM}${dd}`;
    case "MMddyyyy":
      return `${MM}${dd}${yyyy}`;
    default:
      return dateValueToIso(value);
  }
};

const toIsoFromDate = (value: Date): string => {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

// Human-friendly label for the mobile sheet header, e.g. "May 25, 2026".
const friendlyDate = (value: DateValue, locale: string): string => {
  try {
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
    return new Intl.DateTimeFormat(locale || DEFAULT_LOCALE, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return dateValueToIso(value);
  }
};

// Inclusive day count between two dates (e.g. Mon–Sun = 7).
const daysInclusive = (a: DateValue, b: DateValue): number => {
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round(Math.abs(end - start) / 86_400_000) + 1;
};

const datePartsFromString = (
  raw: string,
  dateFormat: string,
): { year: number; month: number; day: number } | undefined => {
  const value = raw.trim();
  if (!value) return undefined;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const readSplit = (separator: string, order: Array<"year" | "month" | "day">) => {
    const pieces = value.split(separator);
    if (pieces.length !== 3) return undefined;
    const result = { year: 0, month: 0, day: 0 };
    order.forEach((part, index) => {
      result[part] = Number(pieces[index]);
    });
    return result;
  };

  switch (dateFormat) {
    case "MM/dd/yyyy":
      return readSplit("/", ["month", "day", "year"]);
    case "MM-dd-yyyy":
      return readSplit("-", ["month", "day", "year"]);
    case "yyyy/MM/dd":
      return readSplit("/", ["year", "month", "day"]);
    case "yyyy-MM-dd":
      return readSplit("-", ["year", "month", "day"]);
    case "dd/MM/yyyy":
      return readSplit("/", ["day", "month", "year"]);
    case "dd-MM-yyyy":
      return readSplit("-", ["day", "month", "year"]);
    case "yyyyMMdd":
      if (!/^\d{8}$/.test(value)) return undefined;
      return {
        year: Number(value.slice(0, 4)),
        month: Number(value.slice(4, 6)),
        day: Number(value.slice(6, 8)),
      };
    case "MMddyyyy":
      if (!/^\d{8}$/.test(value)) return undefined;
      return {
        month: Number(value.slice(0, 2)),
        day: Number(value.slice(2, 4)),
        year: Number(value.slice(4, 8)),
      };
    default:
      return undefined;
  }
};

const parseDateValue = (
  raw: unknown,
  dateFormat: string,
): DateValue | undefined => {
  if (isDateValue(raw)) return raw;
  if (raw instanceof Date) {
    try {
      return parseDate(toIsoFromDate(raw));
    } catch {
      return undefined;
    }
  }
  if (typeof raw !== "string") return undefined;

  const parts = datePartsFromString(raw, dateFormat);
  if (!parts) return undefined;
  if (!parts.year || !parts.month || !parts.day) return undefined;

  try {
    return parseDate(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`);
  } catch {
    return undefined;
  }
};

const toDateValues = (
  raw: unknown,
  mode: Mode,
  dateFormat: string,
): DateValue[] => {
  if (raw === undefined || raw === null || raw === "") return [];

  if (mode === "range") {
    if (Array.isArray(raw)) {
      return raw
        .slice(0, 2)
        .map((item) => parseDateValue(item, dateFormat))
        .filter((item): item is DateValue => !!item);
    }

    if (typeof raw === "object") {
      const candidate = raw as Record<string, unknown>;
      return [candidate.from ?? candidate.start, candidate.to ?? candidate.end]
        .map((item) => parseDateValue(item, dateFormat))
        .filter((item): item is DateValue => !!item);
    }
  }

  if (Array.isArray(raw)) {
    const first = parseDateValue(raw[0], dateFormat);
    return first ? [first] : [];
  }

  const single = parseDateValue(raw, dateFormat);
  return single ? [single] : [];
};

const toPayload = (
  values: DateValue[],
  mode: Mode,
  dateFormat: string,
): DatePickerPayload => {
  if (mode === "range") {
    const from = values[0] ? formatDateValue(values[0], dateFormat) : undefined;
    const to = values[1] ? formatDateValue(values[1], dateFormat) : undefined;
    if (!from && !to) return undefined;
    return { from, to };
  }

  return values[0] ? formatDateValue(values[0], dateFormat) : undefined;
};

const resolvePresetValue = (raw: string): PresetValue | undefined => {
  const compact = raw.trim().replace(/[-_]+/g, " ");
  const key = compact.replace(/\s+/g, "").toLowerCase();
  const spacedKey = compact.replace(/\s+/g, " ").toLowerCase();
  if (compact in PRESET_LABELS) return compact as PresetValue;
  return PRESET_ALIASES[spacedKey] ?? PRESET_ALIASES[key];
};

const resolvePresets = (
  rawPresets: DatePickerProps["presets"],
  showPresets: boolean | undefined,
  mode: Mode,
): PresetItem[] => {
  if (mode !== "range") return [];
  if (showPresets === false || rawPresets === false) return [];

  const source =
    rawPresets === undefined || rawPresets === true
      ? DEFAULT_PRESETS
      : Array.isArray(rawPresets)
        ? rawPresets
        : String(rawPresets)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

  const resolved = source
    .map((preset): PresetItem | undefined => {
      if (typeof preset === "object" && "value" in preset) {
        const value = preset.value ? resolvePresetValue(preset.value) : undefined;
        return value ? { value, label: preset.label || PRESET_LABELS[value] } : undefined;
      }
      const value = resolvePresetValue(String(preset));
      return value ? { value, label: PRESET_LABELS[value] } : undefined;
    })
    .filter((item): item is PresetItem => !!item);

  return resolved.length ? resolved : DEFAULT_PRESETS;
};

export function DatePicker(props: DatePickerProps) {
  const {
    id,
    value: controlledValue,
    initialValue,
    mode: rawMode,
    label,
    placeholder,
    dateFormat = DEFAULT_DATE_FORMAT,
    enabled = true,
    readOnly = false,
    required = false,
    autoFocus = false,
    inline = false,
    validationStatus = "none",
    weekStartsOn,
    showWeekNumber,
    showWeekNumbers,
    startDate,
    endDate,
    startIcon,
    endIcon,
    startText,
    endText,
    width,
    locale = DEFAULT_LOCALE,
    timeZone = DEFAULT_TIME_ZONE,
    numOfMonths,
    presets,
    showPresets,
    testId,
    className,
    onDidChange,
    onFocus,
    onBlur,
    updateState,
    registerComponentApi,
  } = props;

  const mode = toMode(rawMode);
  const isControlled = controlledValue !== undefined;
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const monthZeroRef = useRef<HTMLDivElement>(null);
  const focusedWithinRef = useRef(false);

  const [internalValue, setInternalValue] = useState<DateValue[]>(() =>
    toDateValues(controlledValue ?? initialValue, mode, dateFormat),
  );

  const controlledDateValues = useMemo(
    () => toDateValues(controlledValue, mode, dateFormat),
    [controlledValue, dateFormat, mode],
  );

  const values = isControlled ? controlledDateValues : internalValue;
  const latestPayloadRef = useRef<DatePickerPayload>(
    toPayload(values, mode, dateFormat),
  );
  latestPayloadRef.current = toPayload(values, mode, dateFormat);

  const presetItems = useMemo(
    () => resolvePresets(presets, showPresets, mode),
    [mode, presets, showPresets],
  );

  const minDate = useMemo(
    () => parseDateValue(startDate, dateFormat),
    [dateFormat, startDate],
  );
  const maxDate = useMemo(
    () => parseDateValue(endDate, dateFormat),
    [dateFormat, endDate],
  );

  const emitValue = useCallback(
    (next: DateValue[], options?: { initial?: boolean }) => {
      if (!isControlled) setInternalValue(next);
      const payload = toPayload(next, mode, dateFormat);
      latestPayloadRef.current = payload;
      updateState?.({ value: payload }, options?.initial ? { initial: true } : undefined);
      if (!options?.initial) onDidChange?.(payload);
    },
    [dateFormat, isControlled, mode, onDidChange, updateState],
  );

  const setValue = useCallback(
    (next: unknown) => {
      emitValue(toDateValues(next, mode, dateFormat));
    },
    [dateFormat, emitValue, mode],
  );

  useEffect(() => {
    updateState?.({ value: latestPayloadRef.current }, { initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registerComponentApi?.({
      focus: () => {
        inputRef.current?.focus();
      },
      setValue,
      getValue: () => latestPayloadRef.current,
    });
  }, [registerComponentApi, setValue]);

  const handleFocusCapture = useCallback(() => {
    if (focusedWithinRef.current) return;
    focusedWithinRef.current = true;
    onFocus?.();
  }, [onFocus]);

  const handleBlurCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && rootRef.current?.contains(next)) return;
      focusedWithinRef.current = false;
      onBlur?.();
    },
    [onBlur],
  );

  const hasAdornment = !!startText || !!endText || !!startIcon || !!endIcon;
  const visibleMonthCount = toNumber(numOfMonths, mode === "range" ? 2 : 1);

  // Day-view month offsets: a single side-by-side desktop row, or a vertical
  // scrollable window centered on the focused month on mobile.
  const dayMonthOffsets = isMobile
    ? Array.from(
        { length: MOBILE_MONTHS_BEFORE + MOBILE_MONTHS_AFTER + 1 },
        (_, i) => i - MOBILE_MONTHS_BEFORE,
      )
    : Array.from({ length: visibleMonthCount }, (_, i) => i);

  // When the mobile sheet opens, bring the focused month to the top of the
  // scroll area so past months are reachable by scrolling up.
  useEffect(() => {
    if (!isMobile || !isOpen) return;
    const frame = requestAnimationFrame(() => {
      monthZeroRef.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isMobile, isOpen]);

  // Mobile drawer header: live title, selection summary, and day count.
  const sheetTitle = mode === "range" ? "Select date range" : "Select date";
  const sheetSummaryEmpty = !values[0];
  const sheetSummary = (() => {
    if (mode === "range") {
      const from = values[0] ? friendlyDate(values[0], locale) : undefined;
      const to = values[1] ? friendlyDate(values[1], locale) : undefined;
      if (from && to) return `${from} – ${to}`;
      if (from) return `${from} – …`;
      return placeholder || "Select dates";
    }
    return values[0] ? friendlyDate(values[0], locale) : placeholder || "Select a date";
  })();
  const rangeDays =
    mode === "range" && values[0] && values[1]
      ? daysInclusive(values[0], values[1])
      : undefined;

  return (
    <ArkDatePicker.Root
      id={id}
      value={values}
      onValueChange={(details) => emitValue(details.value)}
      onOpenChange={(details) => setIsOpen(details.open)}
      selectionMode={mode}
      disabled={!enabled}
      readOnly={readOnly}
      required={required}
      invalid={validationStatus === "error"}
      inline={inline}
      locale={locale}
      timeZone={timeZone}
      startOfWeek={toNumber(weekStartsOn, 0)}
      showWeekNumbers={showWeekNumber ?? showWeekNumbers ?? false}
      min={minDate}
      max={maxDate}
      numOfMonths={isMobile ? 1 : visibleMonthCount}
      openOnClick
      closeOnSelect={mode !== "range"}
      placeholder={placeholder}
      format={(date) => formatDateValue(date, dateFormat)}
      parse={(value) => parseDateValue(value, dateFormat)}
      positioning={{ placement: "bottom-start", sameWidth: false }}
    >
      <div
        ref={rootRef}
        className={cx(styles.root, widthClass(width), className)}
        data-mode={mode}
        data-validation-status={validationStatus}
        data-inline={inline ? "" : undefined}
        data-mobile={isMobile ? "" : undefined}
        data-open={isOpen ? "" : undefined}
        data-testid={testId}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
      >
        {label && (
          <ArkDatePicker.Label className={styles.label}>
            {label}
          </ArkDatePicker.Label>
        )}

        <div className={styles.pickerRow}>
          <ArkDatePicker.Control
            className={styles.control}
            data-has-adornment={hasAdornment ? "" : undefined}
          >
            {!endIcon && (
              <ArkDatePicker.Trigger
                className={styles.adornmentTrigger}
                aria-label="Open calendar"
              >
                <CalendarGlyph />
                {startText}
              </ArkDatePicker.Trigger>
            )}
            {endIcon && startText && (
              <span className={styles.adornment}>{startText}</span>
            )}

            <ArkDatePicker.Input
              ref={inputRef}
              index={0}
              autoFocus={autoFocus}
              className={styles.input}
            />

            {mode === "range" && (
              <>
                <span className={styles.rangeSeparator}>-</span>
                <ArkDatePicker.Input
                  index={1}
                  className={styles.input}
                />
              </>
            )}

            {endText && !endIcon && (
              <span className={styles.adornment}>{endText}</span>
            )}

            <ArkDatePicker.ClearTrigger
              className={styles.clear}
              aria-label="Clear date"
            >
              <CloseGlyph />
            </ArkDatePicker.ClearTrigger>
            {endIcon && (
              <ArkDatePicker.Trigger
                className={styles.trigger}
                aria-label="Open calendar"
              >
                <CalendarGlyph />
                {endText}
              </ArkDatePicker.Trigger>
            )}
          </ArkDatePicker.Control>
        </div>

        <ArkDatePicker.Positioner className={styles.positioner}>
          <ArkDatePicker.Content className={styles.content}>
            {isMobile && <div className={styles.grabHandle} aria-hidden="true" />}

            {isMobile && (
              <div className={styles.sheetHeader}>
                <div className={styles.sheetHeaderText}>
                  <span className={styles.sheetTitle}>{sheetTitle}</span>
                  <span
                    className={styles.sheetSummary}
                    data-empty={sheetSummaryEmpty ? "" : undefined}
                  >
                    {sheetSummary}
                  </span>
                  {rangeDays != null && (
                    <span className={styles.sheetCount}>
                      {rangeDays} {rangeDays === 1 ? "day" : "days"}
                    </span>
                  )}
                </div>
                <ArkDatePicker.Context>
                  {(api) => (
                    <button
                      type="button"
                      className={styles.sheetClose}
                      aria-label="close"
                      onClick={() => api.setOpen(false)}
                    >
                      <CloseGlyph />
                    </button>
                  )}
                </ArkDatePicker.Context>
              </div>
            )}

            {presetItems.length > 0 && (
              <div className={styles.quickPresets}>
                {presetItems.map((preset) => (
                  <ArkDatePicker.PresetTrigger
                    key={preset.value}
                    value={preset.value}
                    className={styles.preset}
                  >
                    {preset.label}
                  </ArkDatePicker.PresetTrigger>
                ))}
              </div>
            )}

            <ArkDatePicker.View view="day" className={styles.view}>
              <ArkDatePicker.Context>
                {(api) => (
                  <div className={styles.calendarMonths}>
                    {dayMonthOffsets.map((offset, monthIndex) => {
                      const month =
                        offset === 0
                          ? {
                              weeks: api.weeks,
                              visibleRange: api.visibleRange,
                              visibleRangeText: api.visibleRangeText,
                            }
                          : api.getOffset({ months: offset });

                      return (
                        <div
                          className={styles.calendarMonth}
                          key={offset}
                          ref={offset === 0 ? monthZeroRef : undefined}
                        >
                          <ArkDatePicker.ViewControl className={styles.viewControl}>
                            {!isMobile &&
                              (monthIndex === 0 ? (
                                <ArkDatePicker.PrevTrigger className={styles.nav}>
                                  <ChevronLeftGlyph />
                                </ArkDatePicker.PrevTrigger>
                              ) : (
                                <span className={styles.navSpacer} />
                              ))}
                            <ArkDatePicker.ViewTrigger className={styles.viewTrigger}>
                              {month.visibleRangeText.start}
                            </ArkDatePicker.ViewTrigger>
                            {!isMobile &&
                              (monthIndex === dayMonthOffsets.length - 1 ? (
                                <ArkDatePicker.NextTrigger className={styles.nav}>
                                  <ChevronRightGlyph />
                                </ArkDatePicker.NextTrigger>
                              ) : (
                                <span className={styles.navSpacer} />
                              ))}
                          </ArkDatePicker.ViewControl>

                          <ArkDatePicker.Table
                            className={styles.table}
                            id={`month-${monthIndex}`}
                          >
                            <ArkDatePicker.TableHead>
                              <ArkDatePicker.TableRow>
                                {api.showWeekNumbers && (
                                  <ArkDatePicker.WeekNumberHeaderCell
                                    className={cx(styles.weekday, styles.weekNumber)}
                                  />
                                )}
                                {api.weekDays.map((day) => (
                                  <ArkDatePicker.TableHeader
                                    key={day.value.toString()}
                                    className={styles.weekday}
                                  >
                                    {day.short}
                                  </ArkDatePicker.TableHeader>
                                ))}
                              </ArkDatePicker.TableRow>
                            </ArkDatePicker.TableHead>
                            <ArkDatePicker.TableBody>
                              {month.weeks.map((week, weekIndex) => (
                                <ArkDatePicker.TableRow key={weekIndex}>
                                  {api.showWeekNumbers && (
                                    <ArkDatePicker.WeekNumberCell
                                      week={week}
                                      weekIndex={weekIndex}
                                      className={styles.weekNumber}
                                    >
                                      {api.getWeekNumber(week)}
                                    </ArkDatePicker.WeekNumberCell>
                                  )}
                                  {week.map((day) => (
                                    <ArkDatePicker.TableCell
                                      key={day.toString()}
                                      value={day}
                                      visibleRange={month.visibleRange}
                                      className={styles.cell}
                                    >
                                      <ArkDatePicker.TableCellTrigger
                                        className={styles.cellTrigger}
                                      >
                                        {day.day}
                                      </ArkDatePicker.TableCellTrigger>
                                    </ArkDatePicker.TableCell>
                                  ))}
                                </ArkDatePicker.TableRow>
                              ))}
                            </ArkDatePicker.TableBody>
                          </ArkDatePicker.Table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ArkDatePicker.Context>
            </ArkDatePicker.View>

            <ArkDatePicker.View view="month" className={styles.view}>
              <ArkDatePicker.ViewControl className={styles.viewControl}>
                <ArkDatePicker.PrevTrigger className={styles.nav}>
                  <ChevronLeftGlyph />
                </ArkDatePicker.PrevTrigger>
                <ArkDatePicker.ViewTrigger className={styles.viewTrigger}>
                  <ArkDatePicker.RangeText />
                </ArkDatePicker.ViewTrigger>
                <ArkDatePicker.NextTrigger className={styles.nav}>
                  <ChevronRightGlyph />
                </ArkDatePicker.NextTrigger>
              </ArkDatePicker.ViewControl>

              <ArkDatePicker.Context>
                {(api) => (
                  <ArkDatePicker.Table columns={4} className={styles.table}>
                    <ArkDatePicker.TableBody>
                      {api.getMonthsGrid({ columns: 4, format: "short" }).map((months, rowIndex) => (
                        <ArkDatePicker.TableRow key={rowIndex}>
                          {months.map((month) => (
                            <ArkDatePicker.TableCell
                              key={month.value}
                              value={month.value}
                              className={styles.cell}
                            >
                              <ArkDatePicker.TableCellTrigger className={styles.cellTrigger}>
                                {month.label}
                              </ArkDatePicker.TableCellTrigger>
                            </ArkDatePicker.TableCell>
                          ))}
                        </ArkDatePicker.TableRow>
                      ))}
                    </ArkDatePicker.TableBody>
                  </ArkDatePicker.Table>
                )}
              </ArkDatePicker.Context>
            </ArkDatePicker.View>

            <ArkDatePicker.View view="year" className={styles.view}>
              <ArkDatePicker.ViewControl className={styles.viewControl}>
                <ArkDatePicker.PrevTrigger className={styles.nav}>
                  <ChevronLeftGlyph />
                </ArkDatePicker.PrevTrigger>
                <ArkDatePicker.ViewTrigger className={styles.viewTrigger}>
                  <ArkDatePicker.RangeText />
                </ArkDatePicker.ViewTrigger>
                <ArkDatePicker.NextTrigger className={styles.nav}>
                  <ChevronRightGlyph />
                </ArkDatePicker.NextTrigger>
              </ArkDatePicker.ViewControl>

              <ArkDatePicker.Context>
                {(api) => (
                  <ArkDatePicker.Table columns={4} className={styles.table}>
                    <ArkDatePicker.TableBody>
                      {api.getYearsGrid({ columns: 4 }).map((years, rowIndex) => (
                        <ArkDatePicker.TableRow key={rowIndex}>
                          {years.map((year) => (
                            <ArkDatePicker.TableCell
                              key={year.value}
                              value={year.value}
                              className={styles.cell}
                            >
                              <ArkDatePicker.TableCellTrigger className={styles.cellTrigger}>
                                {year.label}
                              </ArkDatePicker.TableCellTrigger>
                            </ArkDatePicker.TableCell>
                          ))}
                        </ArkDatePicker.TableRow>
                      ))}
                    </ArkDatePicker.TableBody>
                  </ArkDatePicker.Table>
                )}
              </ArkDatePicker.Context>
            </ArkDatePicker.View>
          </ArkDatePicker.Content>
        </ArkDatePicker.Positioner>
      </div>
    </ArkDatePicker.Root>
  );
}

function CalendarGlyph() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronLeftGlyph() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightGlyph() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default DatePicker;
