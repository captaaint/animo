import type { StandaloneAppDescription } from "xmlui";
import { WebsiteTheme } from "./themes/website-theme";

const viteEnv = (import.meta as any).env ?? {};
const demoIframeUrl = viteEnv.DEV
  ? (viteEnv.VITE_ANIMO_DEMO_URL ?? "http://localhost:5173/")
  : "/demo-app/#/";

const App: StandaloneAppDescription = {
  name: "Animo",
  version: "0.1.0",
  themes: [WebsiteTheme],
  defaultTheme: "animo-website",
  resources: {
    logo: "resources/full-logo.svg",
    "logo-dark": "resources/dark-full-logo.svg",
    favicon: "resources/favicon.ico",
    "icon.clock": "resources/clock.svg",
    "icon.filetext": "resources/file-text.svg",
    "icon.trending_up": "resources/trending-up.svg",
    "font.sora":
      "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap",
  },
  appGlobals: {
    xsVerbose: false,
    useHashBasedRouting: false,
    demoIframeUrl,
  },
};

export default App;
