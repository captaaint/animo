// Local override of xmlui's core ColorPicker.
//
// Verbatim copy of `xmlui/src/components/ColorPicker/ColorPickerReact.tsx`
// from xmlui@0.12.27, with one targeted fix: the user-driven `onChange`
// path no longer routes through `React.startTransition`, so the controlled
// `<input type="color">` reflects the picked color on the first selection
// instead of lagging by one interaction.
//
// See docs/xmlui-bugs/colorpicker.md for the full bug report submitted
// upstream. Once xmlui ships the fix, delete this whole extension and
// remove the `VITE_USED_COMPONENTS_ColorPicker=false` flag in web/.env.

import type { ChangeEvent, CSSProperties, ForwardedRef } from "react";
import { memo, useEffect, useTransition } from "react";
import { forwardRef, useCallback, useRef } from "react";
import {
  COMPONENT_PART_KEY,
  Part,
  useEvent,
  type RegisterComponentApiFn,
} from "xmlui";
import classnames from "classnames";
import { useComposedRefs } from "@radix-ui/react-compose-refs";

// Side-effect import: ships the pseudo-element rules we cannot express
// inline (::-webkit-color-swatch[-wrapper], ::-moz-color-swatch) so the
// rendered control matches the rest of the xmlui input family.
import "./ColorPicker.css";

// `PART_INPUT` and `UpdateStateFn` are not part of xmlui's public surface;
// they are tiny constants/types, so we inline them rather than rely on a
// deep import that the package's export map would reject.
const PART_INPUT = "input";
type UpdateStateFn = (componentState: any, options?: any) => void;
type ValidationStatus = "none" | "error" | "warning" | "valid";

const noop = () => {};

type Props = {
  id?: string;
  value?: string;
  initialValue?: string;
  style?: CSSProperties;
  className?: string;
  classes?: Record<string, string>;
  onDidChange?: (newValue: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterComponentApiFn;
  autoFocus?: boolean;
  tabIndex?: number;
  required?: boolean;
  readOnly?: boolean;
  enabled?: boolean;
  validationStatus?: ValidationStatus;
  invalidMessages?: string[];
};

export const defaultProps: Pick<
  Props,
  "initialValue" | "value" | "enabled" | "validationStatus"
> = {
  initialValue: "#000000",
  value: "#000000",
  enabled: true,
  validationStatus: "none",
};

export const ColorPicker = memo(
  forwardRef(
    (
      {
        id,
        style,
        className,
        classes,
        updateState,
        onDidChange = noop,
        onFocus = noop,
        onBlur = noop,
        registerComponentApi,
        enabled = defaultProps.enabled,
        readOnly,
        value = defaultProps.value,
        autoFocus,
        tabIndex = 0,
        required,
        validationStatus = defaultProps.validationStatus,
        invalidMessages: _invalidMessages,
        initialValue = defaultProps.initialValue,
        ...rest
      }: Props,
      forwardedRef: ForwardedRef<HTMLInputElement>,
    ) => {
      const [, startTransition] = useTransition();
      const inputRef = useRef<HTMLInputElement>(null);
      const composedRef = useComposedRefs(forwardedRef, inputRef);

      const updateValue = useCallback(
        (next: string) => {
          updateState?.({ value: next });
          onDidChange(next);
        },
        [onDidChange, updateState],
      );

      // FIX: user-driven changes must update synchronously. The original
      // wrapped `updateValue` in `startTransition`, which defers the parent
      // re-render — but the `<input type="color">` is controlled, so React
      // reconciles it with the *previous* `value` prop on the synchronous
      // commit, snapping the swatch back to the old color. The next user
      // pick then "catches up" by one selection, so the swatch is
      // perpetually one step behind. Running `updateValue` directly here
      // makes the new color land on the very next paint.
      const onInputChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
          updateValue(event.target.value);
        },
        [updateValue],
      );

      useEffect(() => {
        updateState?.({ value: initialValue }, { initial: true });
      }, [initialValue, updateState]);

      const handleOnFocus = useCallback(() => {
        onFocus?.();
      }, [onFocus]);

      const handleOnBlur = useCallback(() => {
        onBlur?.();
      }, [onBlur]);

      const focus = useCallback(() => {
        inputRef.current?.focus();
      }, []);

      // Programmatic `setValue` keeps the transition wrapper for parity
      // with the upstream API contract — non-urgent batched update is fine
      // when the user isn't watching the picker UI react.
      const setValue = useEvent((newValue) => {
        startTransition(() => {
          updateValue(newValue);
        });
      });

      useEffect(() => {
        registerComponentApi?.({
          focus,
          setValue,
        });
      }, [focus, registerComponentApi, setValue]);

      return (
        <Part partId={PART_INPUT}>
          <input
            {...rest}
            id={id}
            className={classnames(
              "xmlui-ext-color-picker",
              className,
              classes?.[COMPONENT_PART_KEY],
              {
                "xmlui-ext-color-picker--error": validationStatus === "error",
                "xmlui-ext-color-picker--warning":
                  validationStatus === "warning",
                "xmlui-ext-color-picker--valid": validationStatus === "valid",
              },
            )}
            style={style}
            disabled={!enabled || readOnly}
            onFocus={handleOnFocus}
            onChange={onInputChange}
            readOnly={readOnly}
            autoFocus={autoFocus}
            tabIndex={tabIndex}
            onBlur={handleOnBlur}
            required={required}
            type="color"
            inputMode="text"
            ref={composedRef}
            value={value}
          />
        </Part>
      );
    },
  ),
);

ColorPicker.displayName = "ColorPickerFixed";

export default ColorPicker;
