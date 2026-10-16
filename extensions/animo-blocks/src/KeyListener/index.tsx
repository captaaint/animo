import { createComponentRenderer, createMetadata } from "xmlui";
import { KeyListener } from "./KeyListener";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Non-visual window-level key listener. Mount inside a container whose " +
    "lifecycle reflects when you want shortcuts to be active (e.g. inside a " +
    "modal, or gate with `enabled`). Fires `onKey` for any watched key plus " +
    "the convenience `onEnter` / `onEscape` events.",
  props: {
    keys: {
      description: "Comma-separated key names to listen for.",
      valueType: "string",
      defaultValue: "Enter",
    },
    enabled: {
      description: "Disable to detach the listener.",
      valueType: "boolean",
      defaultValue: true,
    },
    ignoreWithModifiers: {
      description: "Ignore the key if Shift/Ctrl/Meta/Alt is held.",
      valueType: "boolean",
      defaultValue: true,
    },
    chord: {
      description:
        "A modifier chord such as \"Alt+T\" or \"Ctrl+Shift+K\". Fires `onKey` " +
        "only when exactly these modifiers are held with the key (letters and " +
        "digits match by physical key), and suppresses the browser default. " +
        "Overrides `keys` and `ignoreWithModifiers`.",
      valueType: "string",
    },
    ignoreInInputs: {
      description:
        "Ignore the key when focus is in an editable element (input, textarea, " +
        "select, contenteditable). Use for app-wide single-key shortcuts so they " +
        "never hijack normal typing.",
      valueType: "boolean",
      defaultValue: false,
    },
  },
  events: {
    key: { description: "Fired for any watched key. Payload: { key }." },
    enter: { description: "Convenience for Enter. Payload: { key }." },
    escape: { description: "Convenience for Escape. Payload: { key }." },
  },
  nonVisual: true,
});

export const keyListenerRenderer = createComponentRenderer(
  "KeyListener",
  metadata,
  ({ node, extractValue, lookupEventHandler }) => {
    return (
      <KeyListener
        keys={extractValue.asOptionalString(node.props.keys)}
        enabled={extractValue.asOptionalBoolean(node.props.enabled)}
        ignoreWithModifiers={extractValue.asOptionalBoolean(node.props.ignoreWithModifiers)}
        ignoreInInputs={extractValue.asOptionalBoolean(node.props.ignoreInInputs)}
        chord={extractValue.asOptionalString(node.props.chord)}
        onKey={lookupEventHandler("key")}
        onEnter={lookupEventHandler("enter")}
        onEscape={lookupEventHandler("escape")}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [keyListenerRenderer],
};
