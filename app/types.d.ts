/// <reference types="vite/client" />

declare module "xmlui-pdf";

// Vite handles `import "./foo.css"` as a side-effect at build time; the
// triple-slash reference above should already cover this, but the xmlui
// CLI does not ship a tsconfig that picks vite/client up for every editor
// check — declare it explicitly so the IDE stops flagging the import.
declare module "*.css";

// Populated synchronously on boot (see index.ts → resolveApiBase). Main.xmlui
// reads it as `window.__ANIMO_API_BASE__`; the value differs between the
// browser dev build (hard-coded http://127.0.0.1:8080/api), the Tauri
// desktop shell (random port supplied by the `api_base` invoke command),
// and the demo build (relative `/api`, served by the in-browser handler).
interface Window {
  __ANIMO_API_BASE__?: string;
  __ANIMO_VERSION__?: string;
  __ANIMO_DEMO__?: boolean;
}

interface ImportMetaEnv {
  /** Set to "true" by the `build:demo` npm script (xmlui passes it to
   *  Vite as a define), tells index.ts to install the in-browser API
   *  handler instead of hitting the real backend. */
  readonly VITE_ANIMO_DEMO?: string;
  /** Build-time release version (e.g. "0.1.0"). Injected by
   *  .github/workflows/release.yml; falls back to a literal in
   *  index.ts so local dev builds still render something sensible. */
  readonly VITE_ANIMO_VERSION?: string;
}
