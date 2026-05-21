// Centralized extension list for the xmlui SSG pipeline.
// The runtime `index.ts` registers the same extensions for the browser bundle;
// `xmlui ssg` reads this file to discover which packages need source aliases
// during the SSR build.
import xmluiPdf from "xmlui-pdf";
import { tonePersist, keyListener, windowEvent, viewport } from "animo-blocks";
import weekCalendarExt from "./src/extensions/WeekCalendar";
import authGateExt from "./src/extensions/AuthGate";
import barChartExt from "./src/extensions/BarChart";
import pieChartExt from "./src/extensions/PieChart";
import stopwatchExt from "./src/extensions/Stopwatch";
import pickerExt from "./src/extensions/Picker";
import colorPickerExt from "./src/extensions/ColorPicker";

export default [
  xmluiPdf,
  weekCalendarExt,
  authGateExt,
  barChartExt,
  pieChartExt,
  stopwatchExt,
  keyListener,
  viewport,
  windowEvent,
  pickerExt,
  tonePersist,
  colorPickerExt,
];
