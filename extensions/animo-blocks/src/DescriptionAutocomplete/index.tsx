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
} from "xmlui";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";

const COMP = "DescriptionAutocomplete";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Textarea with type-ahead suggestions for previously used time entry descriptions.",
  props: {
    initialValue: dInitialValue(),
    value: {
      description: "Controlled text value.",
      valueType: "string",
    },
    suggestions: {
      description: "String array used as autocomplete suggestions.",
      valueType: "any",
    },
    label: {
      description: "Optional label rendered above the textarea.",
      valueType: "string",
    },
    placeholder: {
      description: "Placeholder text shown when the field is empty.",
      valueType: "string",
    },
    rows: {
      description: "Visible textarea row count.",
      valueType: "number",
      defaultValue: 5,
    },
    maxLength: {
      description: "Maximum accepted character count.",
      valueType: "number",
    },
    resize: {
      description: "CSS resize behavior.",
      valueType: "string",
      defaultValue: "vertical",
      availableValues: ["none", "both", "horizontal", "vertical"],
    },
    width: {
      description: "CSS width for the field root.",
      valueType: "string",
    },
    testId: {
      description: "Optional test id rendered on the field root.",
      valueType: "string",
    },
    enabled: dEnabled(),
    readOnly: dReadonly(),
    required: dRequired(),
    autoFocus: dAutoFocus(),
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
      signature: "setValue(value: string): void",
    },
    getValue: {
      description: `Return the current value of the ${COMP}.`,
      signature: "getValue(): string",
    },
  },
  contextVars: {
    value: {
      description: "Current text value.",
    },
  },
});

export const descriptionAutocompleteRenderer = createComponentRenderer(
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
      <DescriptionAutocomplete
        id={extractValue.asOptionalString(props.id)}
        value={extractValue.asOptionalString(props.value)}
        initialValue={extractValue.asOptionalString(props.initialValue)}
        suggestions={extractValue(props.suggestions) as string[] | undefined}
        label={extractValue.asOptionalString(props.label)}
        placeholder={extractValue.asOptionalString(props.placeholder)}
        rows={extractValue.asOptionalNumber(props.rows)}
        maxLength={extractValue.asOptionalNumber(props.maxLength)}
        resize={
          extractValue.asOptionalString(props.resize) as
            | "none"
            | "both"
            | "horizontal"
            | "vertical"
            | undefined
        }
        width={extractValue.asSize(props.width) || undefined}
        testId={extractValue.asOptionalString(props.testId)}
        enabled={extractValue.asOptionalBoolean(props.enabled, true)}
        readOnly={extractValue.asOptionalBoolean(props.readOnly)}
        required={extractValue.asOptionalBoolean(props.required)}
        autoFocus={extractValue.asOptionalBoolean(props.autoFocus)}
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
  components: [descriptionAutocompleteRenderer],
};
