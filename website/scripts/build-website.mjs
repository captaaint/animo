#!/usr/bin/env node
// Orchestrates the website's SSG build.
//
// The demo app (web/) is deployed independently on its own Netlify site at
// demo.getanimo.app, so it is no longer bundled into the website output.
// The "View Demo" CTA in Main.xmlui links directly to that external URL.
//
// Prerequisites (handled by turbo via `^build:extension` dependsOn in
// turbo.json — see `npm run build:website` at the repo root):
//   * `animo-blocks` is built (dist/animo-blocks.mjs exists), so xmlui
//     ssg's Node-side SSR loader can require the shared renderers.
//   * Workspace `node_modules` is populated (turbo only runs after the
//     install step in CI / dev workflows).
//
// This script then runs sync-downloads (pulls release artifacts for the
// /download page) and the xmlui SSG build.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Pull desktop release artifacts into public/downloads/ so the /download
// page can serve them from the same origin as the site. The script no-ops
// when GITHUB_TOKEN / GH_TOKEN is absent (e.g. local dev), so the build
// still succeeds.
run("node", ["scripts/sync-downloads.mjs"], { cwd: websiteDir });

// Build the public site with XMLUI's static-site generator. The CSS-stub
// loader lets Node import the externalized xmlui library during SSR
// without choking on its `.css` import and un-substituted
// `import.meta.env` references.
const loaderPath = resolve(websiteDir, "scripts/css-stub-loader.mjs");
run("npx", ["xmlui", "ssg"], {
  cwd: websiteDir,
  env: { NODE_OPTIONS: `--loader ${loaderPath}` },
});
