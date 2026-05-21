// Extension registration for the fixed ColorPicker.
//
// Registered under the XMLUIExtensions namespace (default for extensions),
// and the core xmlui ColorPicker is opted out via
// `VITE_USED_COMPONENTS_ColorPicker=false` (see web/.env). With the core
// renderer absent, unqualified `<ColorPicker>` in *.xmlui resolves to this
// extension via the CORE → APP → EXTENSIONS lookup chain — so the modal
// markup does not need to change. See docs/xmlui-bugs/colorpicker.md.

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
import { ColorPicker, defaultProps } from "./ColorPicker";

const COMP = "ColorPicker";

const metadata = createMetadata({
  status: "stable",
  description:
    "Local override of xmlui's core ColorPicker that fixes a controlled-input " +
    "lag where the first user color selection did not visually update the swatch.",
  props: {
    initialValue: dInitialValue(),
    enabled: dEnabled(),
    autoFocus: dAutoFocus(),
    required: dRequired(),
    readOnly: dReadonly(),
    validationStatus: dValidationStatus(defaultProps.validationStatus),
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
    value: {
      description: `This method returns the current value of the ${COMP}.`,
      signature: "get value(): string",
    },
    setValue: {
      description: `This method sets the current value of the ${COMP}.`,
      signature: "set value(value: string): void",
      parameters: {
        value: "The new value to set for the color picker.",
      },
    },
  },
});

export const colorPickerRenderer = createComponentRenderer(
  COMP,
  metadata,
  ({
    node,
    extractValue,
    lookupEventHandler,
    updateState,
    registerComponentApi,
  }) => {
    return (
      <ColorPicker
        value={extractValue(node.props.value)}
        initialValue={extractValue(node.props.initialValue) ?? defaultProps.initialValue}
        enabled={extractValue.asOptionalBoolean(node.props.enabled) ?? defaultProps.enabled}
        autoFocus={extractValue.asOptionalBoolean(node.props.autoFocus)}
        required={extractValue.asOptionalBoolean(node.props.required)}
        readOnly={extractValue.asOptionalBoolean(node.props.readOnly)}
        validationStatus={
          extractValue.asOptionalString(node.props.validationStatus) as
            | "none"
            | "error"
            | "warning"
            | "valid"
            | undefined
        }
        onDidChange={lookupEventHandler("didChange")}
        onFocus={lookupEventHandler("gotFocus")}
        onBlur={lookupEventHandler("lostFocus")}
        updateState={updateState}
        registerComponentApi={registerComponentApi}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [colorPickerRenderer],
};
