#!/usr/bin/env node
// scripts/changelog-promote.mjs — promote ## [Unreleased] → ## [VERSION].
//
// Invoked from scripts/bump.sh during the release flow. Reads VERSION from
// the env. Idempotent: if ## [VERSION] already exists, exits 0 with no
// changes. If ## [Unreleased] is empty / only carries the placeholder, exits
// non-zero so the release operator can decide.
//
// Side-effects:
//   1. Renames "## [Unreleased]" → "## [VERSION] - YYYY-MM-DD".
//   2. Inserts a fresh "## [Unreleased]\n\n_No changes yet._" above it.
//   3. Updates link footnotes:
//        [Unreleased]: <repo>/compare/v<VERSION>...HEAD
//        [VERSION]:    <repo>/compare/v<prev>...v<VERSION>

import fs from 'node:fs';

const CHANGELOG_PATH = process.env.CHANGELOG_PATH || 'CHANGELOG.md';
const VERSION = process.env.VERSION;

if (!VERSION || !/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error('error: VERSION env var must be N.N.N');
  process.exit(1);
}

const versionRe = new RegExp(`^## \\[${VERSION.replace(/\./g, '\\.')}\\]`, 'm');

let text = fs.readFileSync(CHANGELOG_PATH, 'utf8');

if (versionRe.test(text)) {
  console.log(`## [${VERSION}] already exists in ${CHANGELOG_PATH}; nothing to promote.`);
  process.exit(0);
}

// Same [ \t]*$ trick as in changelog-append.mjs — never consume the trailing
// newline into the match, so slice boundaries stay predictable.
const unreleasedHeader = text.match(/^## \[Unreleased\][ \t]*$/m);
if (!unreleasedHeader) {
  console.error(`error: could not find ## [Unreleased] section in ${CHANGELOG_PATH}`);
  process.exit(1);
}

const headerStart = unreleasedHeader.index;
const headerEnd = headerStart + unreleasedHeader[0].length;
const restRel = text.slice(headerEnd).search(/^## \[/m);
const sectionEnd = restRel === -1 ? text.length : headerEnd + restRel;

const rawBody = text.slice(headerEnd, sectionEnd);
const bodyTrimmed = rawBody.trim();
const isEmpty =
  !bodyTrimmed || /^_No changes yet\._?$/i.test(bodyTrimmed);
if (isEmpty) {
  console.error(
    `error: ## [Unreleased] in ${CHANGELOG_PATH} is empty — add entries before releasing ${VERSION}`,
  );
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const newUnreleased = `## [Unreleased]\n\n_No changes yet._\n\n`;
const promotedHeader = `## [${VERSION}] - ${today}`;

const before = text.slice(0, headerStart);
const after = text.slice(sectionEnd);

// Strip leading newlines from the body so the promoted header always sits
// next to a single blank line, regardless of how many newlines were between
// the old `## [Unreleased]` heading and its first content.
const body = rawBody.replace(/^\n+/, '');

let out = before + newUnreleased + promotedHeader + '\n\n' + body + after;
// Belt: collapse any 3+ consecutive newlines anywhere we may have introduced.
out = out.replace(/\n{3,}/g, '\n\n');

// --- Update link footnotes ------------------------------------------------
const unreleasedLink = out.match(/^\[Unreleased\]:\s*(\S+)\s*$/m);
if (unreleasedLink) {
  const linkUrl = unreleasedLink[1];
  const m = linkUrl.match(
    /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/compare\/v?([\d.]+)\.\.\.HEAD$/,
  );
  let baseRepo = null;
  let prevVersion = null;
  if (m) {
    baseRepo = m[1];
    prevVersion = m[2];
  } else {
    const m2 = linkUrl.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)/);
    if (m2) baseRepo = m2[1];
  }

  if (baseRepo) {
    out = out.replace(
      /^\[Unreleased\]:.*$/m,
      `[Unreleased]: ${baseRepo}/compare/v${VERSION}...HEAD`,
    );
    const newLink = prevVersion
      ? `[${VERSION}]: ${baseRepo}/compare/v${prevVersion}...v${VERSION}`
      : `[${VERSION}]: ${baseRepo}/releases/tag/v${VERSION}`;
    out = out.replace(
      /^\[Unreleased\]:.*$/m,
      (match) => `${match}\n${newLink}`,
    );
  }
}

fs.writeFileSync(CHANGELOG_PATH, out);
console.log(`Promoted ## [Unreleased] → ## [${VERSION}] - ${today}.`);
