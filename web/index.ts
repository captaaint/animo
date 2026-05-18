import { startApp } from "xmlui";
import xmluiPdf from "xmlui-pdf";
import weekCalendarExt from "./src/extensions/WeekCalendar";
import authGateExt from "./src/extensions/AuthGate";
import barChartExt from "./src/extensions/BarChart";
import pieChartExt from "./src/extensions/PieChart";
import stopwatchExt from "./src/extensions/Stopwatch";
import keyListenerExt from "./src/extensions/KeyListener";
import viewportExt from "./src/extensions/Viewport";
import windowEventExt from "./src/extensions/WindowEvent";
import pickerExt from "./src/extensions/Picker";
import tonePersistExt from "./src/extensions/TonePersist";

const extensions = [xmluiPdf, weekCalendarExt, authGateExt, barChartExt, pieChartExt, stopwatchExt, keyListenerExt, viewportExt, windowEventExt, pickerExt, tonePersistExt];

export const runtime = import.meta.glob(`/src/**`, { eager: true });

// Resolve the API base before mounting XMLUI. Two runtime modes:
//   • Browser dev/prod: API runs on its own origin (127.0.0.1:8080).
//   • Tauri desktop:    Tauri assigns a random port at boot and exposes it
//                       via the `api_base` invoke command. We block on it
//                       so Main.xmlui's `apiBase` global is correct on first
//                       render — otherwise DataSources race the value swap.
async function resolveApiBase(): Promise<string> {
  const w = window as Window & { __TAURI_INTERNALS__?: unknown };
  if (w.__TAURI_INTERNALS__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("api_base");
  }
  return "http://127.0.0.1:8080/api";
}

async function boot() {
  window.__TT_API_BASE__ = await resolveApiBase();
  startApp(runtime, extensions);
}

void boot();

if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        startApp(newModule?.runtime, extensions);
    });
}
