#!/usr/bin/env node
// Orchestrates the website's SSG build with the embedded demo app.
//
// Prerequisites (handled by turbo via `^build:extension` dependsOn in
// turbo.json — see `npm run build:website` at the repo root):
//   * `animo-blocks` is built (dist/animo-blocks.mjs exists), so xmlui
//     ssg's Node-side SSR loader can require the shared renderers.
//   * Workspace `node_modules` is populated (turbo only runs after the
//     install step in CI / dev workflows).
//
// This script then runs the parts that aren't worth turning into separate
// turbo tasks: sync the desktop release artifacts, build the web demo
// with website-specific flags (`--withRelativeRoot`, hash routing), run
// xmlui ssg, and finally copy the web demo output under
// website/dist-ssg/demo-app/ so /demo can iframe it.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const repoDir = resolve(websiteDir, "..");
const webDir = resolve(repoDir, "web");

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

run(
  "npm",
  ["run", "build:demo", "--", "--withRelativeRoot"],
  {
    cwd: webDir,
    env: {
      VITE_ANIMO_DEMO: "true",
      VITE_ANIMO_HASH_ROUTING: "true",
    },
  }
);

// Build the public site with XMLUI's static-site generator. The CSS-stub
// loader lets Node import the externalized xmlui library during SSR
// without choking on its `.css` import and un-substituted
// `import.meta.env` references.
const loaderPath = resolve(websiteDir, "scripts/css-stub-loader.mjs");
run("npx", ["xmlui", "ssg"], {
  cwd: websiteDir,
  env: { NODE_OPTIONS: `--loader ${loaderPath}` },
});

const ssgDir = resolve(websiteDir, "dist-ssg");
const demoOut = resolve(ssgDir, "demo-app");
rmSync(demoOut, { recursive: true, force: true });
mkdirSync(demoOut, { recursive: true });
cpSync(resolve(webDir, "dist"), demoOut, { recursive: true });

const demoIndexPath = resolve(demoOut, "index.html");
const demoIndex = readFileSync(demoIndexPath, "utf8")
  .replace("<base href=\"/\">", "<base href=\"./\">")
  .replace("window.__PUBLIC_PATH = '/'", "window.__PUBLIC_PATH = './'");
writeFileSync(demoIndexPath, demoIndex);
