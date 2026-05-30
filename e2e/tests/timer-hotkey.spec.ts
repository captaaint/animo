import { test, expect, Page } from '@playwright/test';

// E2E coverage for issue #47: an in-app keyboard shortcut ("t") starts/stops
// the timer, mirroring the play/stop buttons, and is ignored while typing in a
// field. The TimerBar lives in the AppHeader (banner role); scope there so the
// WeekCalendar's ▶ next-week button never collides.

function header(page: Page) {
  return page.getByRole('banner');
}

test('pressing "t" toggles the timer start then stop', async ({ page }) => {
  await page.goto('/');
  const playBtn = header(page).getByRole('button', { name: '▶', exact: true });
  const stopBtn = header(page).getByRole('button', { name: '■', exact: true });
  await expect(playBtn).toBeVisible();

  // Make sure focus isn't sitting in a text field, then toggle on.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('t');
  await expect(stopBtn).toBeVisible();
  await expect(playBtn).toHaveCount(0);

  // Let the stopwatch tick so end_time lands a whole second after start_time
  // (entries are saved at second precision, so a 0s span is rejected).
  await page.waitForTimeout(1500);

  // Toggle off → the entry is saved and the bar returns to idle.
  await page.keyboard.press('t');
  await expect(page.getByText('Entry saved')).toBeVisible();
  await expect(playBtn).toBeVisible();
});

test('"t" is ignored while typing in the description field', async ({ page }) => {
  await page.goto('/');
  const playBtn = header(page).getByRole('button', { name: '▶', exact: true });
  const stopBtn = header(page).getByRole('button', { name: '■', exact: true });
  const descr = page.getByPlaceholder('What are you working on?');

  await descr.click();
  await page.keyboard.type('attain time tracking'); // several 't's

  // The keystrokes land in the field; the timer never starts.
  await expect(descr).toHaveValue('attain time tracking');
  await expect(stopBtn).toHaveCount(0);
  await expect(playBtn).toBeVisible();
});

test('the timer keycap hint is visible in the header', async ({ page }) => {
  await page.goto('/');
  await expect(header(page).getByText('T', { exact: true })).toBeVisible();
});
