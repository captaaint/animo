import { createComponentRenderer, createMetadata } from "xmlui";
import { TonePersist } from "./TonePersist";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless component. Persists the active theme tone (light/dark) to " +
    "browser localStorage under the same key the time-tracker app uses, " +
    "so the prod /demo-app iframe inherits the website's tone.",
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
