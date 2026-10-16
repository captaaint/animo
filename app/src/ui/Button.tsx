import cx from "classnames";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  variant?: "solid" | "outlined" | "ghost";
  themeColor?: "primary" | "secondary" | "attention";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: IconName;
  label?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  /** Round icon-only button (drawer headers). */
  round?: boolean;
};

/**
 * Icon-only buttons get the icon name as their accessible name ("close",
 * "checkmark", …) unless an explicit `aria-label` is passed.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "solid",
    themeColor = "primary",
    size = "md",
    icon,
    label,
    block,
    round,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const content = label ?? children;
  const iconOnly = !!icon && (content === undefined || content === null || content === "");
  return (
    <button
      ref={ref}
      type={type}
      aria-label={iconOnly && !rest["aria-label"] ? icon : undefined}
      className={cx(
        "btn",
        `btn--${variant}`,
        `btn--${themeColor}`,
        `btn--${size}`,
        iconOnly && "btn--icon",
        block && "btn--block",
        round && "btn--round",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "xs" ? 14 : size === "lg" ? 20 : 16} />}
      {!iconOnly && content}
    </button>
  );
});
