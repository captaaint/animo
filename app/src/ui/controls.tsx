import cx from "classnames";
import {
  forwardRef,
  useId,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { useTheme } from "../lib/theme";
import { userInitials } from "../lib/format";
import { Icon, type IconName } from "./Icon";

// ---------------------------------------------------------------------------------------------------------------------
// Layout surfaces
// ---------------------------------------------------------------------------------------------------------------------

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { flat?: boolean }>(
  function Card({ className, flat, ...rest }, ref) {
    return <div ref={ref} className={cx("card", flat && "card--flat", className)} {...rest} />;
  },
);

export function Separator({ style }: { style?: CSSProperties }) {
  return <div className="separator" role="separator" style={style} />;
}

// ---------------------------------------------------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------------------------------------------------

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label className="field__label" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  startIcon?: IconName;
  variant?: "default" | "ghost";
  testId?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, value, onChange, startIcon, variant = "default", testId, id, className, style, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cx("field", className)} style={style}>
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <div className={cx("input", variant === "ghost" && "input--ghost")}>
        {startIcon && <Icon name={startIcon} className="input__adornment" />}
        <input
          ref={ref}
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          {...rest}
        />
      </div>
    </div>
  );
});

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  label?: ReactNode;
  value: string;
  onChange?: (value: string) => void;
  monospace?: boolean;
};

export function TextAreaField({
  label,
  value,
  onChange,
  monospace,
  id,
  className,
  style,
  ...rest
}: TextAreaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cx("field", className)} style={style}>
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <textarea
        id={inputId}
        className={cx("textarea", monospace && "textarea--mono")}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
    </div>
  );
}

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label?: ReactNode;
  value: number | "";
  onChange: (value: number | "") => void;
};

export function NumberField({ label, value, onChange, id, className, style, ...rest }: NumberFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cx("field", className)} style={style}>
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <div className="input">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          {...rest}
        />
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx("switch", checked && "switch--on")}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------------------------------------------------

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
    />
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {userInitials(name)}
    </span>
  );
}

// Illustrations with separate light/dark artwork.
const ILLUSTRATIONS = {
  "clients-empty-list": { light: "clients-empty-list-light.svg", dark: "clients-empty-list.svg" },
  "projects-empty-list": { light: "projects-empty-list-light.svg", dark: "projects-empty-list-dark.svg" },
  "tags-empty-list": { light: "tags-empty-list-light.svg", dark: "tags-empty-list.svg" },
  "time-entries-empty-list": {
    light: "time-entries-empty-list-light.svg",
    dark: "time-entries-empty-list.svg",
  },
  "feedback-success": { light: "feedback-success-light.svg", dark: "feedback-success-dark.svg" },
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export function Illustration({
  name,
  alt,
  width,
  height,
}: {
  name: IllustrationName;
  alt: string;
  width: number;
  height: number;
}) {
  const { tone } = useTheme();
  return (
    <img
      src={`/resources/${ILLUSTRATIONS[name][tone]}`}
      alt={alt}
      width={width}
      height={height}
      style={{ objectFit: "contain" }}
    />
  );
}

export function EmptyState({
  image,
  alt,
  title,
  subtitle,
  compact,
}: {
  image: IllustrationName;
  alt: string;
  title: string;
  subtitle: string;
  /** Mobile sizing: smaller artwork and type. */
  compact?: boolean;
}) {
  return (
    <div className={cx("empty-state", compact && "empty-state--compact")}>
      <Illustration
        name={image}
        alt={alt}
        width={compact ? 200 : 220}
        height={compact ? 138 : 151}
      />
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__subtitle">{subtitle}</div>
    </div>
  );
}
