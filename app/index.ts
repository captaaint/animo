import { startApp } from "xmlui";
import xmluiPdf from "xmlui-pdf";
import animoBlocks from "animo-blocks";
import weekCalendarExt from "./src/extensions/WeekCalendar";
import localUserGateExt from "./src/extensions/LocalUserGate";
import barChartExt from "./src/extensions/BarChart";
import pieChartExt from "./src/extensions/PieChart";
import stopwatchExt from "./src/extensions/Stopwatch";
import pickerExt from "./src/extensions/Picker";
import colorPickerExt from "./src/extensions/ColorPicker";

const extensions = [
  xmluiPdf,
  animoBlocks,
  weekCalendarExt,
  localUserGateExt,
  barChartExt,
  pieChartExt,
  stopwatchExt,
  pickerExt,
  colorPickerExt,
];

export const runtime = import.meta.glob(`/src/**`, { eager: true });

// Resolve the API base before mounting XMLUI. Three runtime modes:
//   • Demo build (Netlify): MSW intercepts `/api/*` in the browser, so we
//     just point at the relative `/api` prefix and let the mock handle it.
//     Selected at build time via `VITE_ANIMO_DEMO=true` (see `build:demo`).
//   • Tauri desktop: Tauri assigns a random port at boot and exposes it
//     via the `api_base` invoke command. We block on it so Main.xmlui's
//     `apiBase` global is correct on first render — otherwise DataSources
//     race the value swap.
//   • Browser dev/prod: API runs on its own origin (127.0.0.1:8080).
async function resolveApiBase(): Promise<string> {
  if (import.meta.env.VITE_ANIMO_DEMO === "true") {
    return "/api";
  }
  const w = window as Window & { __TAURI_INTERNALS__?: unknown };
  if (w.__TAURI_INTERNALS__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("api_base");
  }
  return "http://127.0.0.1:8080/api";
}

async function boot() {
  // Dev builds: install the local feedback sink BEFORE the demo API so the
  // feedback POST is captured locally instead of hitting the production
  // function (which blocks localhost origins via CORS) — no real GitHub
  // issues from local testing. No-op in production/preview builds.
  if (import.meta.env.DEV) {
    const { installFeedbackDevSink } = await import("./src/helpers/feedbackDevSink");
    installFeedbackDevSink();
  }
  // Demo build: install the in-browser /api/* fetch handler BEFORE startApp.
  if (import.meta.env.VITE_ANIMO_DEMO === "true") {
    const { installDemoApi } = await import("./src/demoApi");
    installDemoApi();
  }
  window.__ANIMO_API_BASE__ = await resolveApiBase();
  window.__ANIMO_VERSION__ = import.meta.env.VITE_ANIMO_VERSION || "0.2.2";
  window.__ANIMO_DEMO__ = import.meta.env.VITE_ANIMO_DEMO === "true";
  startApp(runtime, extensions);
}

void boot();

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    startApp(newModule?.runtime, extensions);
  });
}
