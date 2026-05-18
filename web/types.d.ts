/// <reference types="vite/client" />

declare module "xmlui-pdf";

// Populated synchronously on boot (see index.ts → resolveApiBase). Main.xmlui
// reads it as `window.__TT_API_BASE__`; the value differs between the
// browser dev build (hard-coded http://127.0.0.1:8080/api), the Tauri
// desktop shell (random port supplied by the `api_base` invoke command),
// and the demo build (relative `/api`, served by the in-browser handler).
interface Window {
  __TT_API_BASE__?: string;
}

interface ImportMetaEnv {
  /** Set to "true" by the `build:demo` npm script (xmlui passes it to
   *  Vite as a define), tells index.ts to install the in-browser API
   *  handler instead of hitting the real backend. */
  readonly VITE_TT_DEMO?: string;
}
