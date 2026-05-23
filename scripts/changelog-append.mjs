#!/usr/bin/env node
// scripts/changelog-append.mjs — append new commits to ## [Unreleased].
//
// Invoked by .github/workflows/changelog-on-dev.yml on every push to dev.
// Reads the push event's commit array from COMMITS_JSON (set via
// toJSON(github.event.commits)).
//
// The CHANGELOG records only commits that affect the releasable products
// (app, api, desktop) — everything else (infra, tooling, CI, docs, the
// marketing website, scope-less work) is filtered out so the changelog
// stays a user-facing release-notes document, not a commit dump.
//
// Filter pipeline (in order):
//   1. Skip bot commits, merge commits, "Release vX" tags, and previous
//      auto-changelog commits (loop prevention + signal-to-noise).
//   2. Require a conventional prefix whose *type* is in APP_TYPES
//      (feat / fix / perf). Anything else (chore, ci, build, docs, style,
//      test, refactor, wip, ad-hoc messages) is skipped.
//   3. Require a conventional *scope* that's in APP_SCOPES (app / api /
//      desktop). Bare `feat:` / `fix:` (no scope) and feat with any other
//      scope (download, website, auth, …) are skipped — every release
//      note has to be attributable to one of the three shipped products.
//
// Categorisation of what survives:
//   feat(...)  → ### Added
//   fix(...)   → ### Fixed
//   perf(...)  → ### Changed   (Keep-a-Changelog has no Performance section)

import fs from 'node:fs';

const CHANGELOG_PATH = process.env.CHANGELOG_PATH || 'CHANGELOG.md';

const raw = process.env.COMMITS_JSON;
if (!raw) {
  console.error('error: COMMITS_JSON env var is required');
  process.exit(1);
}

let commits;
try {
  commits = JSON.parse(raw);
} catch (e) {
  console.error('error: failed to parse COMMITS_JSON:', e.message);
  process.exit(1);
}
if (!Array.isArray(commits)) {
  console.error('error: COMMITS_JSON must be an array');
  process.exit(1);
}

// Canonical Keep-a-Changelog subsection order.
const SUBSECTION_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

// Conventional-commit types that describe user-visible product changes.
// Everything else (chore, ci, build, docs, style, test, refactor, …) is
// considered infrastructure noise and stays out of the changelog.
const APP_TYPES = new Set(['feat', 'fix', 'perf']);

// Conventional-commit scopes that map to the three shipped products. A
// commit must declare one of these as its scope to land in the changelog.
// Anything outside this set (including a missing scope) is infrastructure
// or non-product work and is filtered out.
const APP_SCOPES = new Set(['app', 'api', 'desktop']);

// Parse a conventional-commit subject into { type, scope }. Returns null
// when the subject doesn't match the format (those commits are filtered).
function parseConventional(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]*)\))?!?:\s*/);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),
    scope: (m[2] || '').toLowerCase().trim(),
  };
}

function categorize(subject) {
  if (/^feat(\(|!|:)/i.test(subject)) return 'Added';
  if (/^fix(\(|!|:)/i.test(subject)) return 'Fixed';
  return 'Changed';
}

function shouldSkip(commit) {
  if (!commit || typeof commit.message !== 'string') return true;
  const subject = commit.message.split('\n')[0].trim();
  if (!subject) return true;
  const author = commit.author || {};
  if (author.username === 'github-actions[bot]' || author.name === 'github-actions[bot]') {
    return true;
  }
  if (/^Release v?\d/i.test(subject)) return true;
  if (/^Merge /i.test(subject)) return true;
  if (/^chore\(changelog\)/i.test(subject)) return true;

  const parsed = parseConventional(subject);
  if (!parsed) return true;
  if (!APP_TYPES.has(parsed.type)) return true;
  if (!parsed.scope || !APP_SCOPES.has(parsed.scope)) return true;
  return false;
}

function bulletFor(commit) {
  const subject = commit.message.split('\n')[0].trim();
  const sha = (commit.id || commit.sha || '').slice(0, 7);
  return sha ? `- ${subject} (${sha})` : `- ${subject}`;
}

const grouped = { Added: [], Changed: [], Fixed: [] };
for (const c of commits) {
  if (shouldSkip(c)) continue;
  const subject = c.message.split('\n')[0].trim();
  grouped[categorize(subject)].push(bulletFor(c));
}

const total = grouped.Added.length + grouped.Changed.length + grouped.Fixed.length;
if (total === 0) {
  console.log('No new commits to record in CHANGELOG.');
  process.exit(0);
}

const text = fs.readFileSync(CHANGELOG_PATH, 'utf8');

// Match only the header line — using [ \t]*$ instead of \s*$ so we don't
// inadvertently swallow the trailing \n characters into the match.
const unreleasedHeader = text.match(/^## \[Unreleased\][ \t]*$/m);
if (!unreleasedHeader) {
  console.error('error: could not find ## [Unreleased] section in CHANGELOG.md');
  process.exit(1);
}

const headerEnd = unreleasedHeader.index + unreleasedHeader[0].length;
const restRel = text.slice(headerEnd).search(/^## \[/m);
const sectionEnd = restRel === -1 ? text.length : headerEnd + restRel;

const before = text.slice(0, headerEnd);
let sectionBody = text.slice(headerEnd, sectionEnd);
const after = text.slice(sectionEnd);

// Drop the "_No changes yet._" placeholder if present (horizontal whitespace
// only on the line — leave surrounding newlines for the normaliser below).
sectionBody = sectionBody.replace(/^[ \t]*_No changes yet\._[ \t]*$/im, '');

// Parse existing subsections inside Unreleased so we merge instead of overwrite.
const subSplit = sectionBody.split(/^### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*$/m);
const preamble = (subSplit[0] || '').trim();
const subs = {};
for (let i = 1; i < subSplit.length; i += 2) {
  subs[subSplit[i]] = (subSplit[i + 1] || '').trim();
}

// Merge new bullets into the appropriate subsection.
for (const cat of Object.keys(grouped)) {
  if (grouped[cat].length === 0) continue;
  const existing = subs[cat] ? subs[cat] + '\n' : '';
  subs[cat] = (existing + grouped[cat].join('\n')).trim();
}

// Rebuild the Unreleased body in canonical order.
let newBody = '\n\n';
if (preamble) newBody += preamble + '\n\n';
for (const name of SUBSECTION_ORDER) {
  if (subs[name]) {
    newBody += `### ${name}\n\n${subs[name]}\n\n`;
  }
}

// Collapse any run of 3+ newlines (which can appear after stripping the
// placeholder) down to a single blank line so the output stays canonical.
const out = (before + newBody + after).replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(CHANGELOG_PATH, out);
console.log(`Appended ${total} commit(s) to ## [Unreleased].`);
