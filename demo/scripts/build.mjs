#!/usr/bin/env node
// Builds the Animo demo deploy (demo.getanimo.app).
//
// The actual app code lives in animo/app/ (workspace `animo-app`). This
// thin package wraps that build in demo mode (VITE_ANIMO_DEMO=true, which
// turns on the MSW in-browser API mock) and re-publishes the artifact
// under animo/demo/dist so Netlify can use animo/demo as its base.
import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const demoDir = resolve(here, "..");
const repoRoot = resolve(demoDir, "..");
const appDir = resolve(repoRoot, "app");

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

// Build animo-app in demo mode via turbo so animo-blocks (extension dep)
// is built first.
run("npx", ["turbo", "run", "build:demo", "--filter=animo-app"], {
  cwd: repoRoot,
  env: { VITE_ANIMO_DEMO: "true" },
});

// Republish app/dist as demo/dist so Netlify (base=animo/demo,
// publish=dist) finds it.
const destDir = resolve(demoDir, "dist");
rmSync(destDir, { recursive: true, force: true });
cpSync(resolve(appDir, "dist"), destDir, { recursive: true });
