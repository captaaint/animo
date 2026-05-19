import type { StandaloneAppDescription } from "xmlui";
import { TrackerTheme } from "./themes/tracker-theme";

const App: StandaloneAppDescription = {
  name: "Animo",
  version: "0.1.0",
  themes: [TrackerTheme],
  defaultTheme: "tracker-theme",
  appGlobals: {
    xsVerbose: false,
    useHashBasedRouting: false,
  },
  resources: {
    logo: "resources/full-logo.svg",
    "logo-dark": "resources/dark-full-logo.svg",
    favicon: "resources/logo.svg",
    "font.inter":
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    "icon.clock": "resources/clock.svg",
    "icon.credit-card": "resources/credit-card.svg",
    "icon.file-text": "resources/file-text.svg",
    "icon.trending-up": "resources/trending-up.svg",
  },
};

export default App;
