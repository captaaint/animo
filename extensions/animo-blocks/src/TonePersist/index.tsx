import { createComponentRenderer, createMetadata } from "xmlui";
import { TonePersist } from "./TonePersist";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless component. Persists the active theme tone (light/dark) to " +
    "browser localStorage and restores it on the next load via " +
    "useLayoutEffect — synchronous, no flash of the default tone. Exposes " +
    "a `setTone(value)` API ('system' | 'light' | 'dark') so markup can " +
    "drive the live theme.",
  props: {},
  events: {},
  apis: {
    setTone: {
      description:
        "Apply a theme tone immediately and persist the preference. " +
        "Accepts 'system' (re-resolves against prefers-color-scheme), " +
        "'light', or 'dark'.",
    },
  },
  nonVisual: true,
});

export const tonePersistRenderer = createComponentRenderer(
  "TonePersist",
  metadata,
  ({ registerComponentApi }) => (
    <TonePersist registerComponentApi={registerComponentApi} />
  ),
);

export default {
  namespace: "XMLUIExtensions",
  components: [tonePersistRenderer],
};
