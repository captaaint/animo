import {
  createComponentRenderer,
  createMetadata,
  dAutoFocus,
  dDidChange,
  dEnabled,
  dGotFocus,
  dInitialValue,
  dLostFocus,
  dReadonly,
  dRequired,
  dValidationStatus,
} from "xmlui";
import { TimePicker } from "./TimePicker";

const COMP = "TimePicker";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Native HTML5 time input wrapped to match the animo input styling. Supports a single " +
    "`HH:mm` value or a `{ from, to }` range.",
  props: {
    initialValue: dInitialValue(),
    value: {
      description:
        "Controlled value. Single mode accepts an `HH:mm` string. Range mode accepts " +
        "`{ from, to }` or `[from, to]`.",
    },
    mode: {
      description: "Selection mode: `single` or `range`.",
      valueType: "string",
      defaultValue: "single",
      availableValues: ["single", "range"],
    },
    label: {
      description: "Optional label rendered above the input.",
      valueType: "string",
    },
    step: {
      description:
        "Granularity of the time input in seconds. 60 = minute resolution, 1 = seconds.",
      valueType: "number",
      defaultValue: 60,
    },
    enabled: dEnabled(),
    readOnly: dReadonly(),
    required: dRequired(),
    autoFocus: dAutoFocus(),
    validationStatus: dValidationStatus("none"),
    bordered: {
      description: "Render the picker with its own border. Set to false when the parent provides one.",
      valueType: "boolean",
      defaultValue: true,
    },
    iconAlign: {
      description: "Position of the clock icon: `start`, `end`, or `none`.",
      valueType: "string",
      defaultValue: "start",
      availableValues: ["start", "end", "none"],
    },
    placeholder: {
      description: "Placeholder text shown when no value is set.",
      valueType: "string",
      defaultValue: "--:--",
    },
    hoursLabel: {
      description: "Label of the hours column in the dropdown.",
      valueType: "string",
      defaultValue: "Hours",
    },
    minutesLabel: {
      description: "Label of the minutes column in the dropdown.",
      valueType: "string",
      defaultValue: "Minutes",
    },
    secondsLabel: {
      description: "Label of the seconds column (used when `step` < 60).",
      valueType: "string",
      defaultValue: "Seconds",
    },
    hourCycle: {
      description: "Hour cycle: 24 (00-23) or 12 (00-11).",
      valueType: "number",
      defaultValue: 24,
      availableValues: [24, 12],
    },
    width: {
      description: "CSS width for the picker root.",
      valueType: "string",
    },
    minWidth: {
      description: "CSS min-width for the picker root.",
      valueType: "string",
    },
    maxWidth: {
      description: "CSS max-width for the picker root.",
      valueType: "string",
    },
    testId: {
      description: "Optional test id rendered on the picker root.",
      valueType: "string",
    },
  },
  events: {
    didChange: dDidChange(COMP),
    gotFocus: dGotFocus(COMP),
    lostFocus: dLostFocus(COMP),
  },
  apis: {
    focus: {
      description: `Focus the ${COMP} component.`,
      signature: "focus(): void",
    },
    setValue: {
      description: `Set the current value of the ${COMP}.`,
      signature: "setValue(value: string | { from?: string; to?: string }): void",
    },
    getValue: {
      description: `Return the current value of the ${COMP}.`,
      signature: "getValue(): string | { from?: string; to?: string } | undefined",
    },
  },
  contextVars: {
    value: {
      description:
        "Current value. Single mode returns an `HH:mm` string; range mode returns " +
        "`{ from, to }`.",
    },
  },
});

export const timePickerRenderer = createComponentRenderer(
  COMP,
  metadata,
  ({
    node,
    extractValue,
    lookupEventHandler,
    updateState,
    registerComponentApi,
    classes,
  }) => {
    const props = (node.props ?? {}) as Record<string, any>;

    return (
      <TimePicker
        id={extractValue.asOptionalString(props.id)}
        value={extractValue(props.value)}
        initialValue={extractValue(props.initialValue)}
        mode={
          extractValue.asOptionalString(props.mode) as "single" | "range" | undefined
        }
        label={extractValue.asOptionalString(props.label)}
        step={extractValue.asOptionalNumber(props.step)}
        enabled={extractValue.asOptionalBoolean(props.enabled, true)}
        readOnly={extractValue.asOptionalBoolean(props.readOnly)}
        required={extractValue.asOptionalBoolean(props.required)}
        autoFocus={extractValue.asOptionalBoolean(props.autoFocus)}
        bordered={extractValue.asOptionalBoolean(props.bordered, true)}
        iconAlign={
          extractValue.asOptionalString(props.iconAlign) as
            | "start"
            | "end"
            | "none"
            | undefined
        }
        placeholder={extractValue.asOptionalString(props.placeholder)}
        hoursLabel={extractValue.asOptionalString(props.hoursLabel)}
        minutesLabel={extractValue.asOptionalString(props.minutesLabel)}
        secondsLabel={extractValue.asOptionalString(props.secondsLabel)}
        hourCycle={extractValue.asOptionalNumber(props.hourCycle) as 12 | 24 | undefined}
        validationStatus={
          extractValue.asOptionalString(props.validationStatus) as
            | "none"
            | "error"
            | "warning"
            | "valid"
            | undefined
        }
        width={extractValue.asSize(props.width) || undefined}
        minWidth={extractValue.asSize(props.minWidth) || undefined}
        maxWidth={extractValue.asSize(props.maxWidth) || undefined}
        testId={extractValue.asOptionalString(props.testId)}
        className={classes?.["default-part"]}
        onDidChange={lookupEventHandler("didChange") as never}
        onFocus={lookupEventHandler("gotFocus") as never}
        onBlur={lookupEventHandler("lostFocus") as never}
        updateState={updateState}
        registerComponentApi={registerComponentApi}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [timePickerRenderer],
};
