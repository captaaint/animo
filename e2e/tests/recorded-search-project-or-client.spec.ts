import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('recorded-search-project-or-client', async ({ page }) => {

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

  // startup: startup
  await page.goto('./');

  // Monitor for modal dialogs (Conflict, error, etc.)
  await page.evaluate(() => {
    new MutationObserver(() => {
      document.querySelectorAll('[role="dialog"]').forEach(d => {
        if (d.getAttribute('data-modal-seen')) return;
        d.setAttribute('data-modal-seen', '1');
        const title = (d.querySelector('h2, h3, [class*="title"]') as HTMLElement)?.innerText || '';
        const body = (d as HTMLElement).innerText?.slice(0, 300) || '';
        console.log('__MODAL__:' + title + ' | ' + body);
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  await test.step('click: Search project or client', async () => {
    // ACCESSIBILITY GAP: combobox has no accessible name
    await page.getByRole('combobox').click();
  });

  await test.step('click: Mobile App', async () => {
    // ACCESSIBILITY GAP: option has no accessible name
    await page.getByRole('option').click();
  });

  await test.step('click: Website Redesign', async () => {
    // ACCESSIBILITY GAP: option has no accessible name
    await page.getByRole('option').click();
  });

  await test.step('click: Analytics Dashboard', async () => {
    // ACCESSIBILITY GAP: option has no accessible name
    await page.getByRole('option').click();
  });

  await test.step('click: Internal Ops', async () => {
    // ACCESSIBILITY GAP: option has no accessible name
    await page.getByRole('option').click();
  });

  await test.step('click: Brand Guidelines', async () => {
    // ACCESSIBILITY GAP: option has no accessible name
    await page.getByRole('option').click();
  });

  await test.step('click: Marketing Site', async () => {
    // ACCESSIBILITY GAP: option has no accessible name
    await page.getByRole('option').click();
  });

  await test.step('click: canvas', async () => {
    // ACCESSIBILITY GAP: img has no accessible name
    await page.getByRole('img').click();
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
