declare module "xmlui-pdf";

// Populated synchronously on boot (see index.ts → resolveApiBase). Main.xmlui
// reads it as `window.__TT_API_BASE__`; the value differs between the
// browser dev build (hard-coded http://127.0.0.1:8080/api) and the Tauri
// desktop shell (random port supplied by the `api_base` invoke command).
interface Window {
  __TT_API_BASE__?: string;
}
