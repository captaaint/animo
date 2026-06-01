// Node ESM loader used by `xmlui ssg`:
//   1. Stubs `*.css` imports so the SSG render module can be loaded
//      without triggering `ERR_UNKNOWN_FILE_EXTENSION` from Node's
//      strict file-extension check.
//   2. Patches the externalized xmlui library (xmlui.js and every hashed
//      dist chunk it imports) on the fly so `import.meta.env.DEV` /
//      `.PROD` / `.SSR` evaluate to sensible boolean defaults — Vite
//      normally substitutes these at build time but the SSG SSR build
//      leaves xmlui external, so Node ends up executing the
//      un-substituted source.
//
// CSS isn't needed at SSR time; the static HTML output already references
// the built stylesheets emitted by the regular `dist/` build.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".css")) {
    return {
      url: "data:text/javascript,export%20default%20%7B%7D",
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // Patch `import.meta.env` in *every* xmlui dist/lib ES module, not just
  // dist/lib/xmlui.js. xmlui code-splits its SSR bundle into hashed chunks
  // (e.g. dist/lib/parser-CRixT5Rs.js) that xmlui.js imports at runtime;
  // those chunks also contain un-substituted `import.meta.env.DEV` reads.
  // Matching only xmlui.js left the chunks raw, so the SSG crashed with
  // "Cannot read properties of undefined (reading 'DEV')" once 0.12.29
  // moved the offending read into a parser chunk. The hashes change between
  // releases, so match the whole dist/lib/ tree rather than a specific file.
  //
  // Scope is deliberately limited to dist/lib/ (the SSR runtime chunks).
  // The CLI entry dist/nodejs/bin/index.mjs must NOT be patched: it carries
  // `import.meta.env` *inside a string literal* (a codegen template like
  // "import.meta.env.VITE_XMLUI_BUILD_MODE"), and a blind replace there
  // injects an object literal mid-string and breaks JS parsing.
  if (
    url.startsWith("file:") &&
    url.includes("/xmlui/dist/lib/") &&
    /\.(mjs|js)$/.test(url)
  ) {
    const path = fileURLToPath(url);
    const source = await readFile(path, "utf-8");
    // Replace bare `import.meta.env` with a Proxy-like default object so
    // unknown VITE_* keys evaluate to undefined instead of throwing.
    const envExpr = '({DEV:false,PROD:true,SSR:true,MODE:"production",BASE_URL:"/"})';
    const patched = source.replace(/import\.meta\.env/g, envExpr);
    return { source: patched, format: "module", shortCircuit: true };
  }
  return nextLoad(url, context);
}
