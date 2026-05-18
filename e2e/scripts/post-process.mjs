// Clean up issues in raw output from xmlui-org/trace-tools' generate-playwright.js
// so the resulting spec runs against a fresh DB state.

// Split a generated spec into discrete `await test.step(...)` blocks by tracking
// brace depth, then drop the ones the predicate marks. Brace-tracking is
// necessary because step bodies contain nested `{ ... }` (object literals,
// inner blocks) that confuse plain regex matching.
function dropFollowingSteps(spec, predicate) {
  const lines = spec.split('\n');
  const stepStart = /^\s*await test\.step\('([^']+)',\s*async\s*\(\)\s*=>\s*\{\s*$/;
  const steps = []; // { startLine, endLine, label, raw }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(stepStart);
    if (!m) continue;
    let depth = 1;
    let j = i + 1;
    for (; j < lines.length && depth > 0; j++) {
      const opens = (lines[j].match(/\{/g) || []).length;
      const closes = (lines[j].match(/\}/g) || []).length;
      depth += opens - closes;
    }
    steps.push({ startLine: i, endLine: j - 1, label: m[1] });
    i = j - 1;
  }

  const drop = new Set();
  steps.forEach((step, idx) => {
    if (predicate(step.label, idx, steps)) drop.add(idx);
  });
  if (drop.size === 0) return spec;

  const out = [];
  let cursor = 0;
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k];
    if (cursor < s.startLine) out.push(...lines.slice(cursor, s.startLine));
    if (!drop.has(k)) out.push(...lines.slice(s.startLine, s.endLine + 1));
    cursor = s.endLine + 1;
  }
  if (cursor < lines.length) out.push(...lines.slice(cursor));
  return out.join('\n');
}

export function postProcess(spec) {
  let out = spec;

  // 1. Drop literal "[object Object]" assertions — the generator emits these
  // for value:change events whose payload was a plain object (e.g. DatePicker
  // range, ColorPicker). They always fail.
  out = out
    .split('\n')
    .filter(
      (line) =>
        !/toHaveAttribute\(\s*['"][^'"]*['"]\s*,\s*['"]\[object Object\]['"]\s*\)/.test(
          line,
        ),
    )
    .join('\n');

  // 2. Remove the `&& (await r.body()).length > 2` clause from waitForResponse
  // predicates. After a setup wipe, list endpoints return `[]` (2 bytes) and
  // the predicate never resolves.
  out = out.replace(/\s*&&\s*\(await r\.body\(\)\)\.length\s*>\s*2/g, '');

  // 3. Drop method checks for `'PATCH'` — the xmlui engine logs the literal
  // XMLUI template `{editItem ? 'PATCH' : 'POST'}` into the api:start trace
  // entry, and the generator picks the wrong branch. URL + status is enough.
  out = out.replace(/\s*&&\s*r\.request\(\)\.method\(\)\s*===\s*'PATCH'/g, '');

  // 4. Drop ALL `toHaveAttribute('aria-valuenow', ...)` asserts. The generator
  // emits these from value:change events, but ColorPicker/DatePicker/TimeInput
  // don't expose aria-valuenow — they use `value`. These asserts always fail.
  out = out
    .split('\n')
    .filter(
      (line) =>
        !/toHaveAttribute\(\s*['"]aria-valuenow['"]/.test(line),
    )
    .join('\n');

  // 5. Drop absolute row-count assertions like
  //    `expect(body.length).toBeGreaterThan(2)`. The generator derives N from
  //    the baseline trace, but our setup wipes everything so the counts won't
  //    match a fresh DB.
  out = out
    .split('\n')
    .filter(
      (line) =>
        !/expect\(body_[A-Za-z0-9_]+\.length\)\.toBeGreaterThan\(\d+\)/.test(
          line,
        ),
    )
    .join('\n');

  // 6. Scope TimerBar buttons (+, ▶, ■, folder) to the AppHeader. These
  // symbols also appear on the WeekCalendar (zoom in/out, prev/next week)
  // and would otherwise trigger Playwright strict-mode violations.
  out = out.replace(
    /page\.getByRole\('button',\s*\{\s*name:\s*'(\+|▶|■|folder)'(?:\s*,\s*exact:\s*true)?\s*\}\)/g,
    "page.getByRole('banner').getByRole('button', { name: '$1', exact: true })",
  );

  // 7. Drop test.step blocks that depend on recorded state our cleanup wipes:
  //    - `click: HH:MM – HH:MM` — clicks a calendar entry by its label, but
  //      we strip the hour/minute fills so the entry has default times.
  //    - The immediately following `click: Close` — modal that never opened.
  // Implemented by splitting on test.step boundaries instead of regex over the
  // whole file, which gets tangled on nested braces.
  out = dropFollowingSteps(
    out,
    (label, idx, all) => {
      if (/^click:\s*\d{2}:\d{2}/.test(label)) return true;
      // Drop Close steps that immediately follow a dropped time-range step.
      if (label === 'click: Close' && idx > 0) {
        const prev = all[idx - 1];
        if (prev && /^click:\s*\d{2}:\d{2}/.test(prev.label)) return true;
      }
      return false;
    },
  );

  // 8. Drop test.step blocks that only do `fill('')` on hour/minute textboxes.
  // The TimeInput is two segmented inputs; the engine records individual
  // keydowns but no consolidated value, so the generator emits empty fills
  // that wipe the field. Removing them lets the default time stay.
  out = out.replace(
    /\s*await test\.step\('fill: (?:hour|minute)',\s*async\s*\(\)\s*=>\s*\{\s*await page\.getByRole\('textbox',\s*\{\s*name:\s*'(?:hour|minute)'\s*\}\)\.fill\(''\);\s*\}\);\n?/g,
    '',
  );

  return out;
}
