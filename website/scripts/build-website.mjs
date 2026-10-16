#!/usr/bin/env node
// Orchestrates the website's SSG build.
//
// The demo app (web/) is deployed independently on its own Netlify site at
// demo.getanimo.app, so it is no longer bundled into the website output.
// The "View Demo" CTA links directly to that external URL.
//
// Prerequisite: workspace `node_modules` is populated (turbo only runs
// after the install step in CI / dev workflows).
//
// This script runs sync-downloads (pulls release artifacts for the
// /download page), regenerates the updater manifest, then builds the site
// and prerenders every route to static HTML in dist-ssg/.
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

// Regenerate the Tauri updater manifest (public/updates/latest.json) from
// the release's signed bundles. Running it here — in every website build,
// not just the release workflow — keeps the manifest correct no matter
// which build wins the production deploy, so the committed placeholder can
// never strand installed apps on an old version. No-ops without a token.
run("node", ["scripts/sync-update-manifest.mjs"], { cwd: websiteDir });

// Client bundle → dist-ssg/, server bundle → .ssr/, then render each route
// into its own index.html so crawlers and first paint get real markup.
run("npx", ["vite", "build", "--outDir", "dist-ssg"], { cwd: websiteDir });
run("npx", ["vite", "build", "--ssr", "src/entry-server.tsx", "--outDir", ".ssr"], {
  cwd: websiteDir,
});
run("node", ["scripts/prerender.mjs"], { cwd: websiteDir });
