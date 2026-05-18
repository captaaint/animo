#!/usr/bin/env node
// Generate a Playwright spec from a single xs-trace JSON file (one-shot,
// no watching). Mirrors what watch-traces.mjs does on each new file.
//
// Usage:
//   node scripts/generate-spec.mjs <trace.json> [test-name]

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { postProcess } from './post-process.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const E2E_DIR = path.resolve(HERE, '..');
const TESTS_DIR = path.join(E2E_DIR, 'tests');
const GENERATOR = path.join(E2E_DIR, '.trace-tools', 'generate-playwright.js');

const [, , traceArg, nameArg] = process.argv;
if (!traceArg) {
  console.error('Usage: node scripts/generate-spec.mjs <trace.json> [test-name]');
  process.exit(2);
}
const tracePath = path.resolve(traceArg);
if (!fs.existsSync(tracePath)) {
  console.error(`Trace file not found: ${tracePath}`);
  process.exit(2);
}

const testName = nameArg || path.basename(tracePath, '.json').replace(/^xs-trace-/, 'recorded-');
const specPath = path.join(TESTS_DIR, `${testName}.spec.ts`);

const raw = execFileSync('node', [GENERATOR, tracePath, testName], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
const cleaned = postProcess(raw);
fs.writeFileSync(specPath, cleaned);
console.log(`Wrote ${path.relative(E2E_DIR, specPath)} (${cleaned.split('\n').length} lines)`);
