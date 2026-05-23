import type { StandaloneAppDescription } from "xmlui";
import { WebsiteTheme } from "./themes/website-theme";

const App: StandaloneAppDescription = {
  name: "Animo",
  version: "0.1.0",
  themes: [WebsiteTheme],
  defaultTheme: "animo-website",
  resources: {
    logo: "resources/full-logo.svg",
    "logo-dark": "resources/dark-full-logo.svg",
    favicon: "resources/favicon.svg",
    "icon.clock": "resources/clock.svg",
    "icon.filetext": "resources/file-text.svg",
    "icon.trending_up": "resources/trending-up.svg",
    "icon.shield": "resources/shield.svg",
    "icon.external": "resources/external.svg",
    "icon.settings": "resources/settings.svg",
    "icon.app": "resources/app.svg",
    "icon.cloud": "resources/cloud.svg",
    "icon.github": "resources/github.svg",
    "icon.file": "resources/file.svg",
    "font.sora":
      "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap",
  },
  appGlobals: {
    xsVerbose: false,
    useHashBasedRouting: false,
  },
};

export default App;
