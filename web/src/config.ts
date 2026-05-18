import type { StandaloneAppDescription } from "xmlui";
import { TrackerTheme } from "./themes/tracker-theme";

const App: StandaloneAppDescription = {
  name: "Time Tracker",
  version: "0.1.0",
  themes: [TrackerTheme],
  defaultTheme: "tracker-theme",
  appGlobals: {
    xsVerbose: true,
  },
  resources: {
    logo: "resources/xmlui-logo.svg",
    favicon: "resources/favicon.ico",
    "font.inter":
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
};

export default App;
