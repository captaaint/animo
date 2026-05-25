import { test, expect } from '@playwright/test';

// Regression: starting the TimerBar on List, navigating to another menu
// section (Reports / Manage), then returning used to wipe the running
// stopwatch. The TimerBar was gated on `pageTitle === 'Calendar' || 'List'`,
// so the React Stopwatch unmounted on navigation and lost its state. The
// fix keeps TimerBar mounted on every desktop page and persists
// {running, startedAtMs} in localStorage as a fallback for any page that
// would unmount the bar in the future.

test('TimerBar keeps running across navigation between sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();

  const header = page.getByRole('banner');
  const play = header.getByRole('button', { name: '▶', exact: true });
  const stop = header.getByRole('button', { name: '■', exact: true });
  const counter = header.getByText(/^\d+:\d{2}:\d{2}$/).first();

  await expect(play).toBeVisible();
  await play.click();
  await expect(stop).toBeVisible();

  // Let the stopwatch tick at least once so the display is past 0:00:00.
  await page.waitForTimeout(1200);
  const elapsedBefore = await counter.innerText();
  expect(elapsedBefore).not.toBe('0:00:00');

  // Reports: under the old behaviour the TimerBar would disappear here.
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/reports');
  await expect(stop).toBeVisible();

  // Projects too — also outside the old whitelist.
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/projects');
  await expect(stop).toBeVisible();

  await page.waitForTimeout(1500);

  // Back to List — the display must have moved past what we captured.
  await page.getByRole('link', { name: 'List' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/list');
  await expect(stop).toBeVisible();

  const elapsedAfter = await counter.innerText();
  expect(toSeconds(elapsedAfter)).toBeGreaterThan(toSeconds(elapsedBefore));

  // Leave the app idle.
  await stop.click();
});

function toSeconds(hms: string): number {
  const parts = hms.split(':').map((s) => Number.parseInt(s, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return -1;
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}
