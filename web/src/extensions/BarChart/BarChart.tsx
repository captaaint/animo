// =====================================================================================================================
// BarChart — thin wrapper around react-chartjs-2's Bar
// =====================================================================================================================
//
// The XMLUI-style API matches the previous xmlui-charts BarChart:
//   <BarChart data="..." dataKeys="['hours']" nameKey="day" orientation="vertical" />
//
// `data` is an array of objects. Each `dataKeys` entry becomes one dataset,
// reading its values from `data[i][key]`. `nameKey` is the field used for the
// category axis labels. `orientation` flips the bars: "horizontal" means the
// bars grow left → right (Chart.js indexAxis "y").

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { useMemo } from "react";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// =====================================================================================================================
// Component contract
// =====================================================================================================================

export type BarChartProps = {
  data?: Array<Record<string, unknown>>;
  dataKeys?: string[];
  nameKey?: string;
  orientation?: "vertical" | "horizontal";
  showLegend?: boolean;
  /**
   * Optional palette. When omitted, falls back to a small built-in set that
   * matches the rest of the app's blue/teal/violet accent colors.
   */
  colors?: string[];
  height?: number | string;
  width?: number | string;
};

const DEFAULT_PALETTE = [
  "#4188c9", // primary blue (matches the Tracker theme)
  "#10b981", // teal
  "#7c3aed", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#3b82f6", // indigo
];

const GRID_COLOR = "rgba(148, 163, 184, 0.18)";
const TICK_COLOR = "#64748b";

export function BarChart(props: BarChartProps) {
  const {
    data = [],
    dataKeys = [],
    nameKey,
    orientation = "vertical",
    showLegend = false,
    colors = DEFAULT_PALETTE,
  } = props;

  const chartData: ChartData<"bar"> = useMemo(() => {
    const labels = data.map((row, i) => {
      if (!nameKey) return String(i);
      const v = row[nameKey];
      return v == null ? String(i) : String(v);
    });

    const datasets = dataKeys.map((key, i) => ({
      label: key,
      data: data.map((row) => {
        const v = row[key];
        return typeof v === "number" ? v : Number(v) || 0;
      }),
      backgroundColor: colors[i % colors.length],
      borderRadius: 4,
      borderSkipped: false as const,
      maxBarThickness: 36,
    }));

    return { labels, datasets };
  }, [data, dataKeys, nameKey, colors]);

  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      indexAxis: orientation === "horizontal" ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: showLegend, position: "top" },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          borderColor: "rgba(148, 163, 184, 0.3)",
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          displayColors: dataKeys.length > 1,
        },
      },
      scales: {
        x: {
          grid: {
            color: orientation === "horizontal" ? GRID_COLOR : "transparent",
            drawTicks: false,
          },
          border: { display: false },
          ticks: { color: TICK_COLOR, font: { size: 11 } },
        },
        y: {
          grid: {
            color: orientation === "vertical" ? GRID_COLOR : "transparent",
            drawTicks: false,
          },
          border: { display: false },
          ticks: { color: TICK_COLOR, font: { size: 11 }, padding: 6 },
          beginAtZero: true,
        },
      },
    }),
    [orientation, showLegend, dataKeys.length],
  );

  return <Bar data={chartData} options={options} />;
}

export default BarChart;
