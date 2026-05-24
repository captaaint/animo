// Centralized extension list for the xmlui SSG pipeline.
// The runtime `index.ts` registers the same extensions for the browser bundle;
// `xmlui ssg` reads this file to discover which packages need source aliases
// during the SSR build.
import xmluiPdf from "xmlui-pdf";
import animoBlocks from "animo-blocks";
import weekCalendarExt from "./src/extensions/WeekCalendar";
import localUserGateExt from "./src/extensions/LocalUserGate";
import barChartExt from "./src/extensions/BarChart";
import pieChartExt from "./src/extensions/PieChart";
import stopwatchExt from "./src/extensions/Stopwatch";
import pickerExt from "./src/extensions/Picker";
import colorPickerExt from "./src/extensions/ColorPicker";

export default [
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
