import { createComponentRenderer, createMetadata } from "xmlui";
import { WindowEvent } from "./WindowEvent";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Non-visual window-level CustomEvent listener for cross-component bus " +
    "patterns. Fires onMessage with the event's `detail` payload.",
  props: {
    eventName: {
      description: "Window CustomEvent name to listen for.",
      valueType: "string",
      defaultValue: "tt:message",
    },
    enabled: {
      description: "Disable to detach the listener.",
      valueType: "boolean",
      defaultValue: true,
    },
  },
  events: {
    message: { description: "Fired with the CustomEvent's `detail` payload." },
  },
  nonVisual: true,
});

export const windowEventRenderer = createComponentRenderer(
  "WindowEvent",
  metadata,
  ({ node, extractValue, lookupEventHandler }) => {
    return (
      <WindowEvent
        eventName={extractValue.asOptionalString(node.props.eventName)}
        enabled={extractValue.asOptionalBoolean(node.props.enabled)}
        onMessage={lookupEventHandler("message")}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [windowEventRenderer],
};
