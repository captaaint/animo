#!/usr/bin/env node
//
// sync-update-manifest.mjs
//
// Regenerates the Tauri updater manifest served at
// https://getanimo.app/updates/latest.json from the signed updater
// bundles attached to a GitHub release.
//
// Why this runs inside the website build:
//   The updater channel was breaking because the manifest was only ever
//   rewritten by the release workflow's `publish-manifest` job, while the
//   site that actually served production was produced by a *separate*
//   build (Netlify) that never touched the manifest — so it shipped the
//   committed `public/updates/latest.json` placeholder, leaving installed
//   apps stuck on an old version ("up-to-date"). Regenerating here makes
//   the manifest correct regardless of which build wins the deploy race:
//   every build derives it from the release assets, so the committed
//   placeholder can never reach production.
//
// This mirrors sync-downloads.mjs (which regenerates the /download page's
// manifest); the two scripts run side by side from build-website.mjs.
//
// Auth:
//   Reads `GITHUB_TOKEN` (or `GH_TOKEN`). The token raises the API rate
//   limit and lets the release workflow read the still-draft release it
//   is publishing. The repo is public, so asset downloads themselves work
//   anonymously — but without a token we no-op rather than risk hammering
//   the unauthenticated rate limit during local dev builds.
//
// Inputs (env):
//   - REPO    (default: captaaint/animo)
//   - VERSION (default: "latest" — picks the most recent published
//              release. The release workflow pins this to the tag being
//              released so it resolves the right (possibly draft) release.)
//
// Output:
//   - website/public/updates/latest.json (regenerated, Tauri v2 shape)
//
// Safety:
//   The existing manifest is left untouched whenever regeneration cannot
//   produce at least one signed platform (no token, network/API failure,
//   or a release with no updater bundles). A build never *downgrades* the
//   manifest to an empty/placeholder state.

import { existsSync, readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateManifest } from "../../scripts/generate-update-manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const manifestPath = resolve(websiteDir, "public/updates/latest.json");

const REPO = process.env.REPO ?? "captaaint/animo";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

// Maps an updater archive's filename suffix to the Tauri target triples it
// satisfies. The macOS `.app.tar.gz` covers both the bare target and the
// `-app` variant Tauri emits, matching the release workflow's manifest.
const UPDATER_ARCHIVES = [
  { suffix: "_aarch64.app.tar.gz", targets: ["darwin-aarch64", "darwin-aarch64-app"] },
  { suffix: "_x64.app.tar.gz", targets: ["darwin-x86_64", "darwin-x86_64-app"] },
  { suffix: "_amd64.AppImage.tar.gz", targets: ["linux-x86_64"] },
  { suffix: "_x64.msi.zip", targets: ["windows-x86_64"] },
];

function log(msg) {
  console.log(`[sync-update-manifest] ${msg}`);
}

function keepExisting(reason) {
  const current = existsSync(manifestPath)
    ? (() => {
        try {
          return JSON.parse(readFileSync(manifestPath, "utf8")).version ?? "?";
        } catch {
          return "?";
        }
      })()
    : "none";
  log(`${reason} — leaving existing manifest untouched (version: ${current}).`);
}

async function ghApi(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "animo-website-sync",
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} → HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAssetText(asset) {
  const headers = {
    Accept: "application/octet-stream",
    "User-Agent": "animo-website-sync",
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/assets/${asset.id}`,
    { headers, redirect: "follow" },
  );
  if (!res.ok) {
    throw new Error(`Download ${asset.name} → HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.text()).trim();
}

async function resolveTag() {
  const envVersion = process.env.VERSION;
  if (envVersion && envVersion !== "latest") {
    return envVersion.startsWith("v") ? envVersion : `v${envVersion}`;
  }
  log(`Looking up latest release for ${REPO}…`);
  const latest = await ghApi(`/repos/${REPO}/releases/latest`);
  return latest.tag_name;
}

async function main() {
  if (!TOKEN) {
    keepExisting("GITHUB_TOKEN / GH_TOKEN not set");
    return;
  }

  const tag = await resolveTag();
  const version = tag.replace(/^v/, "");
  log(`Building updater manifest for ${tag} (${REPO})…`);

  const release = await ghApi(`/repos/${REPO}/releases/tags/${tag}`);
  const assetsByName = new Map(release.assets.map((asset) => [asset.name, asset]));
  const base = `https://github.com/${REPO}/releases/download/${tag}`;

  const platforms = {};
  for (const { suffix, targets } of UPDATER_ARCHIVES) {
    const archive = release.assets.find((asset) => asset.name.endsWith(suffix));
    if (!archive) continue;
    const sig = assetsByName.get(`${archive.name}.sig`);
    if (!sig) {
      log(`found ${archive.name} but no ${archive.name}.sig — skipping ${targets.join(", ")}.`);
      continue;
    }
    const signature = await fetchAssetText(sig);
    const url = `${base}/${archive.name}`;
    for (const target of targets) {
      platforms[target] = { signature, url };
    }
  }

  if (Object.keys(platforms).length === 0) {
    keepExisting(`release ${tag} has no signed updater bundles`);
    return;
  }

  const manifest = generateManifest({
    version,
    notes: "See CHANGELOG.md",
    pubDate: release.published_at || release.created_at || new Date().toISOString(),
    platforms,
  });

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(
    `manifest.json updated → ${version} (${Object.keys(platforms).length} platform(s): ` +
      `${Object.keys(platforms).join(", ")}).`,
  );
}

main().catch((err) => {
  // Never fail the website build over a manifest refresh: a broken refresh
  // should leave the previous (good) manifest in place, not abort deploy.
  keepExisting(`refresh failed: ${err.message}`);
});
