import { createComponentRenderer, createMetadata } from "xmlui";
import { Picker } from "./Picker";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Compact icon-button + searchable dropdown picker, single or " +
    "multi-select. The trigger renders differently when a value is " +
    "selected (active border + count badge). Items can be grouped via the " +
    "`groupField` prop.",
  props: {
    data: {
      description: "The raw item list (array of objects).",
    },
    value: {
      description:
        "Selected id, or array of ids when `multiSelect` is true.",
    },
    initialValue: {
      description: "Initial value when `value` is not controlled.",
    },
    valueField: {
      description: "Key on each item that holds the unique value.",
      valueType: "string",
      defaultValue: "id",
    },
    labelField: {
      description: "Key on each item that holds the display label.",
      valueType: "string",
      defaultValue: "name",
    },
    groupField: {
      description:
        "Optional key on each item that holds the group name. When set, " +
        "items are grouped under headers in the dropdown.",
      valueType: "string",
    },
    colorField: {
      description:
        "Optional key on each item that holds a CSS color string used as " +
        "a small swatch next to the label.",
      valueType: "string",
    },
    multiSelect: {
      description: "When true, allow multiple selections.",
      valueType: "boolean",
      defaultValue: false,
    },
    searchable: {
      description: "Show the search input above the list.",
      valueType: "boolean",
      defaultValue: true,
    },
    searchPlaceholder: {
      description: "Placeholder for the search input.",
      valueType: "string",
      defaultValue: "Search",
    },
    icon: {
      description: "Icon name rendered inside the trigger button.",
      valueType: "string",
      defaultValue: "filter",
    },
    iconActiveColor: {
      description: "CSS color used for the trigger when a value is selected.",
      valueType: "string",
      defaultValue: "rgb(37, 99, 235)",
    },
  },
  events: {
    didChange: {
      description:
        "Fired when the selection changes. Payload: the new value " +
        "(string in single mode, array in multi mode).",
    },
  },
  apis: {
    setValue: {
      signature: "setValue(value: string | string[] | null): void",
      description: "Programmatically set the picker's value.",
    },
  },
  contextVars: {
    value: {
      description:
        "Currently selected value (string in single mode, array in multi).",
    },
  },
});

export const pickerRenderer = createComponentRenderer(
  "Picker",
  metadata,
  ({ node, extractValue, lookupEventHandler, updateState, registerComponentApi }) => {
    return (
      <Picker
        data={extractValue(node.props.data)}
        value={extractValue(node.props.value)}
        initialValue={extractValue(node.props.initialValue)}
        valueField={extractValue.asOptionalString(node.props.valueField)}
        labelField={extractValue.asOptionalString(node.props.labelField)}
        groupField={extractValue.asOptionalString(node.props.groupField)}
        colorField={extractValue.asOptionalString(node.props.colorField)}
        multiSelect={extractValue.asOptionalBoolean(node.props.multiSelect)}
        searchable={extractValue.asOptionalBoolean(node.props.searchable)}
        searchPlaceholder={extractValue.asOptionalString(
          node.props.searchPlaceholder,
        )}
        icon={extractValue.asOptionalString(node.props.icon)}
        iconActiveColor={extractValue.asOptionalString(
          node.props.iconActiveColor,
        )}
        onDidChange={lookupEventHandler("didChange")}
        updateState={updateState}
        registerComponentApi={registerComponentApi}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [pickerRenderer],
};
