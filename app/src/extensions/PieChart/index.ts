// =====================================================================================================================
// PieChart — XMLUI extension registration
// =====================================================================================================================
//
// Wraps react-chartjs-2's `<Pie>` (Chart.js v4 ArcElement). One dataset, read
// from `data[i][dataKey]`, sliced and labelled by `nameKey`. Pass `cutout` to
// render a donut. See app/src/extensions/PieChart/PieChart.tsx.

import { createMetadata, wrapComponent } from "xmlui";
import PieChart from "./PieChart";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Pie / donut chart powered by react-chartjs-2 / Chart.js. Renders one " +
    "dataset read from `data[i][dataKey]`, with `nameKey` providing slice " +
    "labels. Set `cutout` (e.g. \"60%\") for a donut.",
  props: {
    data: {
      description:
        "Array of plain objects. The slice value comes from `data[i][dataKey]`.",
      valueType: "any",
    },
    dataKey: {
      description: "Field on each row that supplies the numeric slice value.",
      valueType: "string",
    },
    nameKey: {
      description: "Field on each row that supplies the slice label.",
      valueType: "string",
    },
    showLegend: {
      description: "Whether to display the slice legend below the chart.",
      valueType: "boolean",
      defaultValue: false,
    },
    cutout: {
      description:
        "Inner radius. Number (pixels) or percentage string like `60%`. " +
        "`0%` (default) renders a full pie; larger values render a donut.",
      valueType: "any",
      defaultValue: "0%",
    },
    colors: {
      description:
        "Optional palette (array of CSS color strings). Index `i` colors the " +
        "i-th slice; the palette wraps if there are more slices than colors.",
      valueType: "any",
    },
  },
});

export const pieChartRenderer = wrapComponent("PieChart", PieChart, metadata, {
  booleans: ["showLegend"],
  strings: ["dataKey", "nameKey"],
});

export default {
  namespace: "XMLUIExtensions",
  components: [pieChartRenderer],
};
