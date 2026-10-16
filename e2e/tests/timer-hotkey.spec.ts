import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';

// E2E coverage for the in-app timer shortcut (originally issue #47). It used
// to be a bare "t", which fired too easily by accident; it is now Alt+T
// (Option+T on macOS). The TimerBar lives in the AppHeader (banner role);
// scope there so the WeekCalendar's ▶ next-week button never collides.

function header(page: Page) {
  return page.getByRole('banner');
}

test('Alt+T toggles the timer start then stop', async ({ page }) => {
  await page.goto('/');
  const playBtn = header(page).getByRole('button', { name: '▶', exact: true });
  const stopBtn = header(page).getByRole('button', { name: '■', exact: true });
  await expect(playBtn).toBeVisible();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Alt+KeyT');
  await expect(stopBtn).toBeVisible();
  await expect(playBtn).toHaveCount(0);

  // Let the stopwatch tick so end_time lands a whole second after start_time
  // (entries are saved at second precision, so a 0s span is rejected).
  await page.waitForTimeout(1500);

  // Toggle off → the entry is saved and the bar returns to idle.
  await page.keyboard.press('Alt+KeyT');
  await expect(page.getByText('Entry saved')).toBeVisible();
  await expect(playBtn).toBeVisible();
});

test('a bare "t" (or Shift+T) no longer starts the timer', async ({ page }) => {
  await page.goto('/');
  const playBtn = header(page).getByRole('button', { name: '▶', exact: true });
  const stopBtn = header(page).getByRole('button', { name: '■', exact: true });
  await expect(playBtn).toBeVisible();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('t');
  await page.keyboard.press('Shift+KeyT');
  await page.waitForTimeout(300);
  await expect(stopBtn).toHaveCount(0);
  await expect(playBtn).toBeVisible();
});

test('typing "t" in the description is ignored, Alt+T there starts the timer', async ({ page }) => {
  await page.goto('/');
  const playBtn = header(page).getByRole('button', { name: '▶', exact: true });
  const stopBtn = header(page).getByRole('button', { name: '■', exact: true });
  const descr = page.getByPlaceholder('What are you working on?');

  await descr.click();
  await page.keyboard.type('attain time tracking'); // several 't's
  await expect(descr).toHaveValue('attain time tracking');
  await expect(stopBtn).toHaveCount(0);

  // The chord works from inside the field and types nothing into it.
  await page.keyboard.press('Alt+KeyT');
  await expect(stopBtn).toBeVisible();
  await expect(descr).toHaveValue('attain time tracking');
  await expect(playBtn).toHaveCount(0);
});

test('the timer keycap hint shows Alt+T in the header', async ({ page }) => {
  await page.goto('/');
  await expect(header(page).getByText('Alt+T', { exact: true })).toBeVisible();
});
