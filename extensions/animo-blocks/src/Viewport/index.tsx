import { createComponentRenderer, createMetadata } from "xmlui";
import { Viewport } from "./Viewport";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless viewport probe. Exposes `value.{isMobile, isDesktop, width, height}` " +
    "so XMLUI markup can adapt layout with `when` expressions. `isMobile` is " +
    "true when the viewport width is ≤ 640px.",
  props: {},
  events: {},
  apis: {},
  nonVisual: true,
});

export const viewportRenderer = createComponentRenderer(
  "Viewport",
  metadata,
  ({ updateState }) => {
    return <Viewport updateState={updateState} />;
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [viewportRenderer],
};
