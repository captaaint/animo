import { createComponentRenderer, createMetadata } from "xmlui";
import { DownloadGrid, ReleaseVersion } from "./DownloadGrid";

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

const releaseVersionMetadata = createMetadata({
  status: "experimental",
  description:
    "Renders the latest release version from the same downloads manifest used by DownloadGrid.",
  props: {
    manifestUrl: {
      description:
        "URL of the JSON manifest listing the current version. Defaults to `/downloads/manifest.json`.",
      valueType: "string",
    },
    prefix: {
      description: "Text prepended to the version. Defaults to `v`.",
      valueType: "string",
    },
    loadingLabel: {
      description: "Text shown while the release manifest is loading.",
      valueType: "string",
    },
    errorLabel: {
      description: "Text shown if the release manifest cannot be loaded.",
      valueType: "string",
    },
  },
});

export const releaseVersionRenderer = createComponentRenderer(
  "ReleaseVersion",
  releaseVersionMetadata,
  (rendererContext) => {
    const { node, extractValue, classes } = rendererContext;
    const manifestUrl = extractValue.asOptionalString(node.props?.manifestUrl);
    const prefix = extractValue.asOptionalString(node.props?.prefix);
    const loadingLabel = extractValue.asOptionalString(node.props?.loadingLabel);
    const errorLabel = extractValue.asOptionalString(node.props?.errorLabel);
    return (
      <ReleaseVersion
        className={classes?.["default-part"]}
        manifestUrl={manifestUrl || undefined}
        prefix={prefix || undefined}
        loadingLabel={loadingLabel || undefined}
        errorLabel={errorLabel || undefined}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [downloadGridRenderer, releaseVersionRenderer],
};
