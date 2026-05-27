#!/usr/bin/env node
// scripts/generate-update-manifest.mjs — write the Tauri update manifest
// served at https://getanimo.app/updates/latest.json.
//
// Invoked by the release workflow after platform artifacts are built and
// signed. Reads version + per-platform (URL, signature) pairs from CLI
// flags or stdin, writes the JSON manifest to the requested path, and
// prints it to stdout for the workflow log.
//
// Manifest shape (Tauri v2 updater):
//   {
//     "version": "X.Y.Z",
//     "notes": "...",
//     "pub_date": "ISO-8601 UTC",
//     "platforms": {
//       "<target>": { "signature": "<base64>", "url": "<https url>" },
//       ...
//     }
//   }
//
// Supported targets (match Tauri target triples):
//   darwin-aarch64, darwin-aarch64-app, darwin-x86_64,
//   darwin-x86_64-app, linux-x86_64, windows-x86_64
//
// Usage:
//   node scripts/generate-update-manifest.mjs \
//     --version 0.3.0 \
//     --notes "See CHANGELOG.md" \
//     --out website/public/updates/latest.json \
//     --platform darwin-aarch64=URL,SIG \
//     --platform windows-x86_64=URL,SIG
//
// Each --platform value is `target=url,signature`. The signature is the
// base64 string produced by `tauri signer sign` for the corresponding
// installer artifact.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SUPPORTED_TARGETS = new Set([
  "darwin-aarch64",
  "darwin-aarch64-app",
  "darwin-x86_64",
  "darwin-x86_64-app",
  "linux-x86_64",
  "windows-x86_64",
]);

function parseArgs(argv) {
  const args = {
    version: "",
    notes: "See CHANGELOG.md",
    pubDate: new Date().toISOString(),
    out: "website/public/updates/latest.json",
    platforms: {},
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--version") args.version = argv[++i];
    else if (arg === "--notes") args.notes = argv[++i];
    else if (arg === "--pub-date") args.pubDate = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--platform") {
      const [target, rest] = argv[++i].split("=");
      if (!target || !rest) {
        throw new Error(`--platform expects target=url,signature (got "${argv[i]}")`);
      }
      const [url, signature] = rest.split(",");
      if (!url || !signature) {
        throw new Error(`--platform ${target} expects url,signature (got "${rest}")`);
      }
      if (!SUPPORTED_TARGETS.has(target)) {
        throw new Error(
          `unsupported target "${target}"; expected one of ${[...SUPPORTED_TARGETS].join(", ")}`,
        );
      }
      args.platforms[target] = { signature, url };
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.version) throw new Error("--version is required");
  return args;
}

export function generateManifest({ version, notes, pubDate, platforms }) {
  return {
    version,
    notes: notes || "See CHANGELOG.md",
    pub_date: pubDate || new Date().toISOString(),
    platforms: platforms || {},
  };
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = generateManifest(args);
  const outPath = resolve(process.cwd(), args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
  console.error(`wrote ${outPath}`);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("generate-update-manifest.mjs");

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(`generate-update-manifest: ${error.message}`);
    process.exit(1);
  }
}
