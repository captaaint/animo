import { createComponentRenderer, createMetadata } from "xmlui";
import { DownloadGrid } from "./DownloadGrid";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Renders the latest-release download options as a responsive grid. " +
    "Detects the visitor's OS/arch (Windows, macOS Apple Silicon, macOS " +
    "Intel, Linux DEB, Linux AppImage) and highlights the recommended " +
    "platform. Pulls artifact filenames from a `/downloads/manifest.json` " +
    "endpoint so adding a release only requires updating the manifest.",
  props: {
    manifestUrl: {
      description:
        "URL of the JSON manifest listing the current version and platform " +
        "artifact paths. Defaults to `/downloads/manifest.json`.",
      valueType: "string",
    },
  },
});

export const downloadGridRenderer = createComponentRenderer(
  "DownloadGrid",
  metadata,
  (rendererContext) => {
    const { node, extractValue, classes } = rendererContext;
    const manifestUrl = extractValue.asOptionalString(node.props?.manifestUrl);
    return (
      <DownloadGrid
        className={classes?.["default-part"]}
        manifestUrl={manifestUrl || undefined}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [downloadGridRenderer],
};
