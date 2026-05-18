// =====================================================================================================================
// BarChart — XMLUI extension registration
// =====================================================================================================================
//
// Replaces the BarChart that used to ship from `xmlui-charts`. We wrap
// react-chartjs-2's `<Bar>` (which sits on top of Chart.js v4) and expose the
// same API surface the previous component had: `data`, `dataKeys`, `nameKey`,
// `orientation`. See web/src/extensions/BarChart/BarChart.tsx.

import { createMetadata, wrapComponent } from "xmlui";
import BarChart from "./BarChart";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Bar chart powered by react-chartjs-2 / Chart.js. Renders one or more " +
    "datasets read from `data` objects, keyed by `dataKeys`, with `nameKey` " +
    "providing the category axis labels.",
  props: {
    data: {
      description:
        "Array of plain objects. Each `dataKeys` entry pulls its numeric " +
        "value from `data[i][key]`.",
      valueType: "any",
    },
    dataKeys: {
      description:
        "Keys to plot — one bar series per entry. Pass an array, e.g. " +
        "`['hours']` or `['planned', 'actual']`.",
      valueType: "any",
    },
    nameKey: {
      description: "Field on each row that supplies the category axis label.",
      valueType: "string",
    },
    orientation: {
      description: "Axis orientation. `vertical` is the default.",
      valueType: "string",
      availableValues: ["vertical", "horizontal"],
      defaultValue: "vertical",
    },
    showLegend: {
      description: "Whether to display the dataset legend above the chart.",
      valueType: "boolean",
      defaultValue: false,
    },
    colors: {
      description:
        "Optional palette (array of CSS color strings). Index `i` colors the " +
        "i-th dataset; the palette wraps if there are more datasets than colors.",
      valueType: "any",
    },
  },
});

export const barChartRenderer = wrapComponent("BarChart", BarChart, metadata, {
  booleans: ["showLegend"],
  strings: ["nameKey", "orientation"],
});

export default {
  namespace: "XMLUIExtensions",
  components: [barChartRenderer],
};
