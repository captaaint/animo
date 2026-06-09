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

import styles from "./DescriptionAutocomplete.module.scss";

type UpdateStateFn = (
  state: Record<string, unknown>,
  options?: Record<string, unknown>,
) => void;

type RegisterApiFn = (api: Record<string, unknown>) => void;

type DescriptionAutocompleteProps = {
  id?: string;
  className?: string;
  value?: string | null;
  initialValue?: string | null;
  suggestions?: string[];
  placeholder?: string;
  enabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  rows?: number;
  maxLength?: number;
  resize?: "none" | "both" | "horizontal" | "vertical";
  width?: string;
  testId?: string;
  onDidChange?: (value: string) => void;
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterApiFn;
};

const noop = () => {};

const cx = (...classes: Array<string | undefined | false>) => {
  return classes.filter(Boolean).join(" ");
};

const toText = (value: unknown) => String(value ?? "");
const normalizeSuggestion = (value: unknown) => String(value ?? "").trim();

const uniqueSuggestions = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  items.forEach((item) => {
    const value = normalizeSuggestion(item);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
};

export const DescriptionAutocomplete = forwardRef<
  HTMLTextAreaElement,
  DescriptionAutocompleteProps
>(function DescriptionAutocomplete(
  {
    id,
    className,
    value,
    initialValue,
    suggestions,
    placeholder,
    enabled = true,
    readOnly = false,
    required = false,
    autoFocus = false,
    rows = 5,
    maxLength,
    resize = "vertical",
    width,
    testId,
    onDidChange = noop,
    onFocus = noop,
    onBlur = noop,
    updateState = noop,
    registerComponentApi,
  },
  forwardedRef,
) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = (forwardedRef || ownRef) as React.RefObject<HTMLTextAreaElement>;
  const [text, setText] = useState(() => toText(initialValue ?? value));
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const controlled = value !== undefined;

  useEffect(() => {
    if (initialValue !== undefined) {
      const next = toText(initialValue);
      setText(next);
      updateState({ value: next }, { initial: true });
    }
  }, [initialValue, updateState]);

  useEffect(() => {
    if (controlled) {
      setText(toText(value));
    }
  }, [controlled, value]);

  const options = useMemo(() => uniqueSuggestions(suggestions), [suggestions]);
  const matches = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return [];
    return options
      .filter((item) => {
        const lower = item.toLowerCase();
        return lower.startsWith(query) && lower !== query;
      })
      .slice(0, 8);
  }, [options, text]);
  const open = focused && !readOnly && enabled && matches.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [text, matches.length]);

  const publish = useCallback(
    (next: string) => {
      if (!controlled) setText(next);
      updateState({ value: next });
      onDidChange(next);
    },
    [controlled, onDidChange, updateState],
  );

  const select = useCallback(
    (next: string) => {
      setText(next);
      updateState({ value: next });
      onDidChange(next);
      setFocused(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [inputRef, onDidChange, updateState],
  );

  useEffect(() => {
    registerComponentApi?.({
      focus: () => inputRef.current?.focus(),
      setValue: (next: unknown) => {
        const normalized = toText(next);
        setText(normalized);
        updateState({ value: normalized });
      },
      getValue: () => text,
    });
  }, [inputRef, registerComponentApi, text, updateState]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    publish(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      select(matches[activeIndex] || matches[0]);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  };

  const style = {
    width,
  } as React.CSSProperties;

  return (
    <div
      className={cx(styles.root, width === "100%" && styles.fullWidth, className)}
      style={style}
      data-testid={testId}
    >
      <textarea
        id={id}
        ref={inputRef}
        className={styles.textarea}
        value={text}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={!enabled}
        readOnly={readOnly}
        required={required}
        autoFocus={autoFocus}
        style={{ resize }}
        aria-autocomplete="list"
        aria-expanded={open}
        onChange={handleChange}
        onFocus={(event) => {
          setFocused(true);
          onFocus(event);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setFocused(false), 120);
          onBlur(event);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className={styles.menu} role="listbox">
          {matches.map((item, index) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cx(styles.item, index === activeIndex && styles.itemActive)}
              onMouseDown={(event) => {
                event.preventDefault();
                select(item);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
