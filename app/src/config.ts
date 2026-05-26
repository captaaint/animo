import type { StandaloneAppDescription } from "xmlui";
import { TrackerTheme } from "./themes/tracker-theme";

export const FEEDBACK_ENDPOINT =
  import.meta.env.VITE_FEEDBACK_ENDPOINT || "https://getanimo.app/api/feedback";

export const UPDATE_MANIFEST_URL =
  import.meta.env.VITE_ANIMO_UPDATES_URL || "https://getanimo.app/updates/latest.json";

export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

const App: StandaloneAppDescription = {
  name: "Animo",
  version: "0.1.0",
  themes: [TrackerTheme],
  defaultTheme: "tracker-theme",
  appGlobals: {
    xsVerbose: false,
    useHashBasedRouting: import.meta.env.VITE_ANIMO_HASH_ROUTING === "true",
  },
  resources: {
    logo: "resources/full-logo.svg",
    "logo-dark": "resources/dark-full-logo.svg",
    favicon: "resources/logo.svg",
    "font.sora":
      "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap",
    "icon.clock": "resources/clock.svg",
    "icon.credit-card": "resources/credit-card.svg",
    "icon.file-text": "resources/file-text.svg",
    "icon.timer": "resources/timer.svg",
    "icon.trending-up": "resources/trending-up.svg",
  },
};

export default App;
