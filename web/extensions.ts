// Centralized extension list for the xmlui SSG pipeline.
// The runtime `index.ts` registers the same extensions for the browser bundle;
// `xmlui ssg` reads this file to discover which packages need source aliases
// during the SSR build.
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

export default [
  xmluiPdf,
  weekCalendarExt,
  authGateExt,
  barChartExt,
  pieChartExt,
  stopwatchExt,
  keyListenerExt,
  viewportExt,
  windowEventExt,
  pickerExt,
  tonePersistExt,
];
