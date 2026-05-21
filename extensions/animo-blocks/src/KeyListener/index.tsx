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
