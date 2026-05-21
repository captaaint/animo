#!/usr/bin/env node
import { existsSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Workspaces hoist shared deps (xmlui, xmlui-pdf, animo-blocks) to the repo
// root's node_modules. Check both per-package and hoisted locations; only
// fall back to `npm ci` (at the workspaces root, not per-package) if neither
// has xmlui. Per-package `npm ci` would fail under workspaces — no per-app
// lockfiles exist anymore.
function ensureDependencies(dir) {
  if (existsSync(resolve(dir, "node_modules", "xmlui"))) return;
  if (existsSync(resolve(repoDir, "node_modules", "xmlui"))) return;
  run(
    "npm",
    ["ci", "--prefer-offline", "--no-audit", "--no-fund", "--ignore-scripts"],
    { cwd: repoDir },
  );
}

ensureDependencies(webDir);
ensureDependencies(websiteDir);

// Pre-build animo-blocks. The package's `exports` field has a `node`
// condition pointing at ./dist/animo-blocks.mjs so xmlui ssg's Node-side
// SSR loader can require the renderers (raw .tsx wouldn't load in Node).
// Kliens Vite build uses the `default` condition (src/index.tsx) and
// transpiles on the fly, so this step is only strictly needed for the
// SSG path — but running it unconditionally keeps the two artifact sets
// in sync.
run("npm", ["run", "-w", "animo-blocks", "build:extension"], { cwd: repoDir });

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
