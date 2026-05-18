import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('reports-date-range', async ({ page }) => {

  // Platform-aware modifier key (Meta on macOS, Control on Windows/Linux)
  const _mod = process.platform === 'darwin' ? 'Meta' : 'Control';

  // Collect XMLUI runtime errors (ErrorBoundary, script errors, toast messages)
  const _xsErrors: string[] = [];
  const _modalsSeen: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') _xsErrors.push(msg.text());
    if (msg.text().startsWith('__MODAL__:')) _modalsSeen.push(msg.text().slice(10));
  });
  page.on('pageerror', err => _xsErrors.push(err.message));

  try {

  await page.goto('./');

  await test.step('click: Reports', async () => {
    await page.getByText('Reports', { exact: true }).click();
  });

  await test.step('click: 2026-05-11 - 2026-05-17', async () => {
    await page.getByRole('button', { name: '2026-05-11 - 2026-05-17', exact: true }).evaluate(node => {
      let el = node.parentElement;
      while (el && el !== document.documentElement) {
        if (el.scrollHeight > el.clientHeight) { el.scrollTop = 0; break; }
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    });
    await page.getByRole('button', { name: '2026-05-11 - 2026-05-17', exact: true }).click();
  });

  await test.step('click: Monday, May 4th, 2026', async () => {
    await page.getByRole('button', { name: 'Monday, May 4th, 2026', exact: true }).evaluate(node => {
      let el = node.parentElement;
      while (el && el !== document.documentElement) {
        if (el.scrollHeight > el.clientHeight) { el.scrollTop = 0; break; }
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    });
    await page.getByRole('button', { name: 'Monday, May 4th, 2026', exact: true }).click();
  });

  await test.step('click: Sunday, May 31st, 2026', async () => {
    await page.getByRole('button', { name: 'Sunday, May 31st, 2026', exact: true }).evaluate(node => {
      let el = node.parentElement;
      while (el && el !== document.documentElement) {
        if (el.scrollHeight > el.clientHeight) { el.scrollTop = 0; break; }
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    });
    await page.getByRole('button', { name: 'Sunday, May 31st, 2026', exact: true }).click();
  });

  await test.step('click: Proceed', async () => {
    const responsePromise0_0 = page.waitForResponse(async r => r.url().includes('http://127.0.0.1:8080/api/reports/summary') && r.status() === 200 && (await r.body()).length > 2);
    await page.getByRole('button', { name: 'Proceed', exact: true }).evaluate(node => {
      let el = node.parentElement;
      while (el && el !== document.documentElement) {
        if (el.scrollHeight > el.clientHeight) { el.scrollTop = 0; break; }
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    });
    await page.getByRole('button', { name: 'Proceed', exact: true }).click();
    await responsePromise0_0;
    const body_responsePromise0_0 = await (await responsePromise0_0).json();
    { const _snap = Array.isArray(body_responsePromise0_0) ? body_responsePromise0_0[0] : body_responsePromise0_0;
      const _keys = Object.keys(_snap).sort();
      ['daily', 'entries', 'totalSeconds'].forEach(k => expect(_keys).toContain(k)); }
  });
  } finally {
    // Capture trace even on failure (if browser still open)
    try {
      await page.waitForTimeout(500);
      const logsJson = await page.evaluate(() => {
        const logs = (window as any)._xsLogs || [];
        const seen = new WeakSet();
        return JSON.stringify(logs, (_key, val) => {
          if (typeof val === 'function') return undefined;
          if (val && typeof val === 'object') {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
          }
          return val;
        }, 2);
      });
      const logs = JSON.parse(logsJson);
      const traceFile = process.env.TRACE_OUTPUT || 'captured-trace.json';
      fs.writeFileSync(traceFile, logsJson);
      console.log(`Trace captured to ${traceFile} (${logs.length} events)`);
      // Report XMLUI errors from _xsLogs
      const errors = logs.filter((e: any) => e.kind?.startsWith('error'));
      if (errors.length > 0) {
        console.log('\nXMLUI RUNTIME ERRORS:');
        errors.forEach((e: any) => console.log(`  [${e.kind}] ${e.error || e.text || JSON.stringify(e)}`));
      }
    } catch (e) {
      console.log('Could not capture trace (browser may have closed)');
    }
    // Report modals that appeared during the test
    if (_modalsSeen.length > 0) {
      console.log('\nMODALS:');
      _modalsSeen.forEach(m => console.log(`  ${m}`));
    }
    // Report visible table rows for diagnostics
    try {
      const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table tbody tr'))
          .map(r => (r as HTMLElement).innerText?.split('\t')[0]?.trim())
          .filter(Boolean)
      );
      if (rows.length > 0) {
        console.log('\nVISIBLE ROWS: ' + rows.join(', '));
      }
    } catch (_) {}
    // Report console errors collected during the test (opt-in via --browser-errors)
    if (false && _xsErrors.length > 0) {
      console.log('\nBROWSER ERRORS:');
      _xsErrors.forEach(e => console.log(`  ${e}`));
    }
  }
});
