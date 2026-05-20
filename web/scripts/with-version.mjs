#!/usr/bin/env node
// Inject VITE_ANIMO_VERSION (read from web/package.json) into the env of a
// child build command, then exec it. Cross-platform replacement for the
// `VITE_ANIMO_VERSION=$(node -p ...) <cmd>` shell trick.
//
// Usage:
//   node scripts/with-version.mjs <command> [args...]
//
// The release CI sets VITE_ANIMO_VERSION explicitly (so the workflow value
// wins); local and Netlify demo builds fall back to the package.json
// version. The browser reads window.__ANIMO_VERSION__ — see index.ts.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, "..", "package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));

const env = { ...process.env };
if (!env.VITE_ANIMO_VERSION) env.VITE_ANIMO_VERSION = version;

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-version.mjs <command> [args...]");
  process.exit(2);
}

const child = spawn(cmd, args, { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
