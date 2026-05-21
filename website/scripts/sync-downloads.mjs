#!/usr/bin/env node
//
// sync-downloads.mjs
//
// Pulls the desktop release artifacts from the (private) GitHub repo and
// stages them under website/public/downloads/v<version>/ so the
// `/download` page on the public site can serve them directly.
//
// Why not link straight to GitHub from the site?
//   The repo is private — Releases on a private repo require an
//   authenticated download. By copying the binaries into the website's
//   own Netlify deploy, visitors get a clean, anonymous URL on the same
//   origin as the site.
//
// Auth:
//   Reads `GITHUB_TOKEN` (or `GH_TOKEN`) from the environment. The token
//   needs read access to the repo's releases (a fine-grained PAT scoped
//   to `Contents: Read` on the repo is sufficient).
//
// Inputs (env):
//   - REPO    (default: captaaint/animo)
//   - VERSION (default: "latest" — picks the most recent release tag.
//              Pass a specific tag like "0.1.1" or "v0.1.1" to pin.)
//
// Outputs:
//   - website/public/downloads/v<version>/*.{dmg,msi,deb,AppImage}
//   - website/public/downloads/manifest.json (regenerated)
//
// Behavior when GITHUB_TOKEN is missing:
//   No-op with a warning. Netlify builds without the token still
//   succeed; the /download page falls back to the manifest as committed
//   and serves whatever artifacts happen to be on disk.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const downloadsDir = resolve(websiteDir, "public/downloads");

const REPO = process.env.REPO ?? "captaaint/animo";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

const PLATFORM_BY_FILENAME = [
  { rx: /_aarch64\.dmg$/i,      key: "macos-arm64" },
  { rx: /_x64\.dmg$/i,          key: "macos-intel" },
  { rx: /_x64\.msi$/i,          key: "windows-amd64" },
  { rx: /_amd64\.deb$/i,        key: "linux-deb" },
  { rx: /_amd64\.AppImage$/i,   key: "linux-appimage" },
];

function log(msg) {
  console.log(`[sync-downloads] ${msg}`);
}

if (!TOKEN) {
  log(
    "GITHUB_TOKEN / GH_TOKEN not set — skipping artifact sync. The site " +
      "will serve whichever files are already on disk under public/downloads/.",
  );
  process.exit(0);
}

async function ghApi(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "animo-website-sync",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} → HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function downloadAsset(assetId, destPath) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${assetId}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/octet-stream",
      "User-Agent": "animo-website-sync",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download asset ${assetId} → HTTP ${res.status}: ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return buf.length;
}

function readPriorManifest() {
  const manifestPath = resolve(downloadsDir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
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
  const tag = await resolveTag();
  const version = tag.replace(/^v/, "");
  const targetDir = resolve(downloadsDir, `v${version}`);
  mkdirSync(targetDir, { recursive: true });

  log(`Fetching release ${tag} (${REPO})…`);
  const release = await ghApi(`/repos/${REPO}/releases/tags/${tag}`);

  const matchedAssets = release.assets
    .map((asset) => {
      const meta = PLATFORM_BY_FILENAME.find((p) => p.rx.test(asset.name));
      return meta ? { ...asset, _platform: meta.key } : null;
    })
    .filter(Boolean);

  if (matchedAssets.length === 0) {
    throw new Error(`No desktop artifacts matched the known filename patterns in ${tag}.`);
  }

  const manifest = { version, artifacts: {} };

  for (const asset of matchedAssets) {
    const dest = resolve(targetDir, asset.name);
    const relPath = `v${version}/${asset.name}`;
    manifest.artifacts[asset._platform] = relPath;

    if (existsSync(dest) && statSync(dest).size === asset.size) {
      log(`cached: ${asset.name} (${asset.size} bytes)`);
      continue;
    }
    log(`downloading: ${asset.name} (${asset.size} bytes)…`);
    const bytes = await downloadAsset(asset.id, dest);
    if (bytes !== asset.size) {
      throw new Error(`Size mismatch for ${asset.name}: got ${bytes}, expected ${asset.size}.`);
    }
  }

  const manifestPath = resolve(downloadsDir, "manifest.json");
  const prior = readPriorManifest();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(
    `manifest.json updated (${prior?.version ?? "fresh"} → ${manifest.version}, ` +
      `${Object.keys(manifest.artifacts).length} artifacts).`,
  );
}

main().catch((err) => {
  console.error(`[sync-downloads] failed: ${err.message}`);
  process.exit(1);
});
