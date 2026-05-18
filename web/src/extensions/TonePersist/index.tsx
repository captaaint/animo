import { createComponentRenderer, createMetadata } from "xmlui";
import { TonePersist } from "./TonePersist";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless component. Persists the active theme tone (light/dark) to " +
    "browser localStorage and restores it on the next load via " +
    "useLayoutEffect — synchronous, no flash of the default tone.",
  props: {},
  events: {},
  apis: {},
  nonVisual: true,
});

export const tonePersistRenderer = createComponentRenderer(
  "TonePersist",
  metadata,
  () => <TonePersist />,
);

export default {
  namespace: "XMLUIExtensions",
  components: [tonePersistRenderer],
};
