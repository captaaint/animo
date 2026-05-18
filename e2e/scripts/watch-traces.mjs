#!/usr/bin/env node
// Watch a directory for `xs-trace-*.json` files exported from the XMLUI
// Inspector and turn each one into a Playwright spec under e2e/tests/.
//
// Usage:
//   node scripts/watch-traces.mjs                          (watches ~/Downloads)
//   E2E_TRACE_WATCH_DIR=/some/path node scripts/watch-traces.mjs
//
// Each new trace becomes tests/recorded-<slug>.spec.ts and is archived to
// .trace-tools/recordings/.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { postProcess } from './post-process.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const E2E_DIR = path.resolve(HERE, '..');
const TESTS_DIR = path.join(E2E_DIR, 'tests');
const TRACE_TOOLS = path.join(E2E_DIR, '.trace-tools');
const ARCHIVE_DIR = path.join(TRACE_TOOLS, 'recordings');
const GENERATOR = path.join(TRACE_TOOLS, 'generate-playwright.js');

const WATCH_DIR =
  process.env.E2E_TRACE_WATCH_DIR ?? path.join(os.homedir(), 'Downloads');
const POLL_MS = 1000;
const PATTERN = /^xs-trace-.*\.json$/;

if (!fs.existsSync(GENERATOR)) {
  console.error(`[watch-traces] generator not found: ${GENERATOR}`);
  console.error('Run from time-tracking-app root after cloning .trace-tools.');
  process.exit(1);
}
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// Only act on files that appear after we start — pre-existing traces stay put.
const startedAt = Date.now();
const handled = new Set();

function deriveSlug(filename, json) {
  // Prefer the first interaction's component/aria label for a readable slug.
  try {
    const entries = JSON.parse(json);
    const first = entries.find(
      (e) => e?.kind === 'interaction' && (e.ariaName || e.componentLabel),
    );
    const raw = first?.ariaName || first?.componentLabel;
    if (raw) {
      return raw
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    }
  } catch {
    /* fall through */
  }
  // Fallback: the timestamp from the filename (xs-trace-YYYYMMDDTHHMMSS.json).
  const m = filename.match(/xs-trace-(\d{8}T\d{6})/);
  return m ? m[1].toLowerCase() : Date.now().toString(36);
}


function generateFor(filePath) {
  const filename = path.basename(filePath);
  const json = fs.readFileSync(filePath, 'utf8');
  const slug = deriveSlug(filename, json);
  const testName = `recorded-${slug}`;
  const specPath = path.join(TESTS_DIR, `${testName}.spec.ts`);

  // Avoid clobbering a hand-edited spec with the same name.
  let finalSpecPath = specPath;
  if (fs.existsSync(specPath)) {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    finalSpecPath = path.join(TESTS_DIR, `${testName}-${stamp}.spec.ts`);
  }

  const out = execFileSync('node', [GENERATOR, filePath, testName], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const cleaned = postProcess(out);
  fs.writeFileSync(finalSpecPath, cleaned);

  // Archive the source trace so it survives Downloads cleanup.
  fs.copyFileSync(filePath, path.join(ARCHIVE_DIR, filename));

  const rel = path.relative(E2E_DIR, finalSpecPath);
  console.log(
    `[watch-traces] ${filename} → ${rel} (${cleaned.split('\n').length} lines)`,
  );
}

function poll() {
  let entries;
  try {
    entries = fs.readdirSync(WATCH_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`[watch-traces] cannot read ${WATCH_DIR}: ${err.message}`);
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!PATTERN.test(entry.name)) continue;
    const full = path.join(WATCH_DIR, entry.name);
    if (handled.has(full)) continue;
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.mtimeMs < startedAt) {
      // Don't replay traces that existed before we started watching.
      handled.add(full);
      continue;
    }
    handled.add(full);
    try {
      generateFor(full);
    } catch (err) {
      console.error(`[watch-traces] ${entry.name} failed: ${err.message}`);
    }
  }
}

console.log(`[watch-traces] watching ${WATCH_DIR} for xs-trace-*.json`);
console.log(`[watch-traces] new specs land in ${path.relative(E2E_DIR, TESTS_DIR)}/`);
setInterval(poll, POLL_MS);
poll();
