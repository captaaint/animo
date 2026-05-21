import { createComponentRenderer, createMetadata } from "xmlui";
import { CenterRow } from "./CenterRow";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Horizontal flex container that centers wrapped items via " +
    "`justify-content: center`. A simple alternative to `HStack wrapContent` " +
    "when wrapped flex children must stay centered.",
  props: {
    gap: {
      description: "Row + column gap between items. Accepts theme tokens like $space-4.",
      valueType: "string",
    },
    rowGap: {
      description: "Override the row gap independently of `gap`.",
      valueType: "string",
    },
    columnGap: {
      description: "Override the column gap independently of `gap`.",
      valueType: "string",
    },
    verticalAlignment: {
      description: "Cross-axis (vertical) alignment of items in a row.",
      valueType: "string",
      defaultValue: "start",
    },
  },
});

export const centerRowRenderer = createComponentRenderer(
  "CenterRow",
  metadata,
  (rendererContext) => {
    const { node, renderChild, extractValue, classes } = rendererContext;
    const gap = extractValue.asSize(node.props?.gap);
    const rowGap = extractValue.asSize(node.props?.rowGap);
    const columnGap = extractValue.asSize(node.props?.columnGap);
    const verticalAlignment = extractValue.asOptionalString(
      node.props?.verticalAlignment,
      "start",
    );
    return (
      <CenterRow
        className={classes?.["default-part"]}
        gap={gap || undefined}
        rowGap={rowGap || undefined}
        columnGap={columnGap || undefined}
        verticalAlignment={verticalAlignment as never}
      >
        {renderChild(node.children)}
      </CenterRow>
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [centerRowRenderer],
};
