import type { StandaloneAppDescription } from "xmlui";
import { TrackerTheme } from "./themes/tracker-theme";

const App: StandaloneAppDescription = {
  name: "Animo",
  version: "0.1.0",
  themes: [TrackerTheme],
  defaultTheme: "tracker-theme",
  appGlobals: {
    xsVerbose: true,
  },
  resources: {
    // In-app brand mark (rendered by the AppHeader's <Logo> component).
    logo: "resources/full-logo.svg",
    // Favicon — the same square icon used for the Tauri desktop bundle so
    // browser tabs and the dock icon stay visually consistent.
    favicon: "resources/logo.svg",
    "font.inter":
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
};

export default App;
