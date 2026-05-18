// =====================================================================================================================
// PieChart — thin wrapper around react-chartjs-2's Pie
// =====================================================================================================================
//
// XMLUI-style API mirrors BarChart:
//   <PieChart data="..." dataKey="hours" nameKey="label" cutout="60%" />
//
// `data` is an array of objects. `dataKey` picks the numeric value per row.
// `nameKey` picks the slice label. `cutout` controls the inner hole: 0 (or
// "0%") renders a full pie, anything larger renders a donut.

import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { useMemo } from "react";
import { Pie } from "react-chartjs-2";

ChartJS.register(ArcElement, Title, Tooltip, Legend);

// =====================================================================================================================
// Component contract
// =====================================================================================================================

export type PieChartProps = {
  data?: Array<Record<string, unknown>>;
  dataKey?: string;
  nameKey?: string;
  showLegend?: boolean;
  /**
   * Inner radius for the donut. Accepts a number (pixels) or a percentage
   * string like "60%". Default is "0%" — a full pie.
   */
  cutout?: number | string;
  /**
   * Optional palette. When omitted, falls back to the same accent colors as
   * BarChart so multi-chart screens look consistent.
   */
  colors?: string[];
  height?: number | string;
  width?: number | string;
};

// Animo palette — see web/src/themes/tracker-theme.ts. Same order as
// BarChart so slice colors stay consistent when the two charts sit
// side-by-side on the Reports page.
const DEFAULT_PALETTE = [
  "#3F8F8C", // Sage Teal
  "#F2A82F", // Warm Amber
  "#FF6F61", // Soft Coral
  "#A7D0C9", // Soft Mint
  "#1E2328", // Deep Charcoal
];

export function PieChart(props: PieChartProps) {
  const {
    data = [],
    dataKey,
    nameKey,
    showLegend = false,
    cutout = "0%",
    colors = DEFAULT_PALETTE,
  } = props;

  const chartData: ChartData<"pie"> = useMemo(() => {
    const labels = data.map((row, i) => {
      if (!nameKey) return String(i);
      const v = row[nameKey];
      return v == null ? String(i) : String(v);
    });

    const values = data.map((row) => {
      if (!dataKey) return 0;
      const v = row[dataKey];
      return typeof v === "number" ? v : Number(v) || 0;
    });

    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: values.map((_, i) => colors[i % colors.length]),
          borderColor: "transparent",
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    };
  }, [data, dataKey, nameKey, colors]);

  const options: ChartOptions<"pie"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      plugins: {
        legend: { display: showLegend, position: "bottom" },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          borderColor: "rgba(148, 163, 184, 0.3)",
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const label = ctx.label ?? "";
              const raw = typeof ctx.raw === "number" ? ctx.raw : Number(ctx.raw) || 0;
              const total = (ctx.dataset.data as number[]).reduce(
                (s, v) => s + (typeof v === "number" ? v : Number(v) || 0),
                0,
              );
              const pct = total > 0 ? Math.round((raw / total) * 100) : 0;
              return `${label}: ${raw} (${pct}%)`;
            },
          },
        },
      },
    }),
    [cutout, showLegend],
  );

  return <Pie data={chartData} options={options} />;
}

export default PieChart;
