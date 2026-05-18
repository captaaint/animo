import { test, expect } from '@playwright/test';
import { uniqueName } from '../helpers';

test('TimerBar exposes only the counter mode (no Manual switch)', async ({ page }) => {
  // Regression: the TimerBar used to ship with a Timer / Manual RadioGroup
  // and a "+" Add button for the Manual flow. Both have been removed in
  // favour of a counter-only TimerBar.
  await page.goto('/');
  await expect(page.getByPlaceholder('What are you working on?')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Manual' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Timer' })).toHaveCount(0);
  await expect(
    page.getByRole('banner').getByRole('button', { name: '+', exact: true }),
  ).toHaveCount(0);
});

test('record a time entry with the timer (counter mode)', async ({ page }) => {
  const description = uniqueName('Timer entry');

  await page.goto('/');

  // Default mode is "counter"; just type a description and start the timer.
  const descrInput = page.getByPlaceholder('What are you working on?');
  await descrInput.click();
  await page.keyboard.type(description);

  // The TimerBar lives in the AppHeader (banner role). Scope all play/stop
  // buttons there so we don't collide with the WeekCalendar's ▶ next-week
  // button on the Calendar screen.
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: '▶', exact: true }).click();

  // Let the stopwatch tick so duration > 0.
  await page.waitForTimeout(1500);

  await header.getByRole('button', { name: '■', exact: true }).click();

  await expect(page.getByText('Entry saved')).toBeVisible();

  await page.getByRole('link', { name: 'List' }).click();
  await expect(page.getByText(description)).toBeVisible();
});
