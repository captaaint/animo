import type { StandaloneAppDescription } from "xmlui";
import { WebsiteTheme } from "./themes/website-theme";

const App: StandaloneAppDescription = {
  name: "Animo",
  version: "0.2.2",
  themes: [WebsiteTheme],
  defaultTheme: "animo-website",
  // Resource paths are root-absolute ("/resources/…"). Relative paths break
  // on routes Netlify serves with a trailing slash: /download redirects to
  // /download/, so a relative "resources/full-logo.svg" resolves against
  // /download/ → /download/resources/full-logo.svg → 404 (broken header &
  // footer logos plus favicon on the download page). The leading slash
  // anchors every reference to the site root regardless of the route.
  resources: {
    logo: "/resources/full-logo.svg",
    "logo-dark": "/resources/dark-full-logo.svg",
    favicon: "/resources/favicon.svg",
    "icon.clock": "/resources/clock.svg",
    "icon.filetext": "/resources/file-text.svg",
    "icon.trending_up": "/resources/trending-up.svg",
    "icon.shield": "/resources/shield.svg",
    "icon.external": "/resources/external.svg",
    "icon.settings": "/resources/settings.svg",
    "icon.app": "/resources/app.svg",
    "icon.cloud": "/resources/cloud.svg",
    "icon.github": "/resources/github.svg",
    "icon.file": "/resources/file.svg",
    "font.sora":
      "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap",
  },
  appGlobals: {
    xsVerbose: false,
    useHashBasedRouting: false,
  },
};

export default App;
