import { test, expect } from '../fixtures';
import { createTimeEntry, uniqueName } from '../helpers';

// Originally a recorded trace against the demo dataset on a fixed date.
// Rewritten to pin the browser clock and seed its own entry: picking a custom
// range in the Reports DatePicker reloads the summary for that range.
test('Reports date range picks a custom range and reloads the summary', async ({ page }) => {
  // "Today" is Tuesday 12 May 2026, so the default range is May 11–17.
  await page.clock.setFixedTime(new Date('2026-05-12T10:00:00'));
  const description = uniqueName('Late May work');

  await page.goto('/');
  // An entry outside the default week.
  await createTimeEntry(page, {
    description,
    startTime: '2026-05-20T09:00:00.000Z',
    endTime: '2026-05-20T10:00:00.000Z',
  });

  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByText('Total Hours')).toBeVisible();
  await expect(page.getByText(description)).toHaveCount(0);

  const summary = page.waitForResponse(
    (r) =>
      r.url().includes('/api/reports/summary') &&
      r.url().includes('from=2026-05-04') &&
      r.url().includes('to=2026-05-31') &&
      r.ok(),
  );
  await page.getByRole('button', { name: 'Open calendar' }).first().click();
  await page
    .getByRole('button', { name: /Monday, May 4th, 2026|Choose Monday, May 4, 2026/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /Sunday, May 31st, 2026|Choose Sunday, May 31, 2026/ })
    .first()
    .click();

  const body = await (await summary).json();
  expect(Object.keys(body)).toEqual(expect.arrayContaining(['daily', 'entries', 'totalSeconds']));
  await expect(page.getByText(description)).toBeVisible();
});
