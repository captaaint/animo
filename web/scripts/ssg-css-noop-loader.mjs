// Node ESM hook that bridges the gap between the published xmlui tarball
// and a Node-side SSR `import()`.
//
// Why this exists:
//   `xmlui ssg` boots the SSR bundle via `await import(...)`. The published
//   `xmlui@0.12.27` ships `dist/lib/xmlui.js` (and chunked siblings) with
//   browser-only artifacts that Vite normally transforms at consumer build
//   time, but which the SSR pipeline leaves intact when xmlui is externalized:
//
//     - top-level `import './xmlui.css'` → `ERR_UNKNOWN_FILE_EXTENSION`
//     - references to `import.meta.env.X` → `Cannot read properties of
//       undefined (reading 'X')` (Node's `import.meta` has no `.env`).
//
//   Two ESM hooks compensate:
//     1) `resolve()` swaps every `.css` specifier with an inline empty
//        module so the dynamic import succeeds. Styles still ship through
//        the client bundle pipeline; SSR doesn't need them.
//     2) `load()` for any file under `node_modules/xmlui/dist/lib/*.js`
//        rewrites raw `import.meta.env.X` accesses into
//        `(import.meta.env || {}).X` so the missing object doesn't blow up
//        the module body. Other Vite features (HMR, etc.) aren't touched.

import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const EMPTY_CSS_MODULE_URL = "data:text/javascript,export%20default%20%7B%7D%3B";
const IMPORT_META_ENV_RE = /import\.meta\.env(\??\.)/g;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".css")) {
    return {
      url: EMPTY_CSS_MODULE_URL,
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file://")) {
    return nextLoad(url, context);
  }
  const filePath = fileURLToPath(url);
  if (!/\/node_modules\/xmlui\/dist\/lib\/.+\.js$/.test(filePath)) {
    return nextLoad(url, context);
  }
  const source = await readFile(filePath, "utf8");
  if (!source.includes("import.meta.env")) {
    return nextLoad(url, context);
  }
  const patched = source.replace(IMPORT_META_ENV_RE, "(import.meta.env||{})$1");
  return {
    source: patched,
    format: "module",
    shortCircuit: true,
  };
}
