import { expect, test } from '@playwright/test';

test('clicking the DatePicker label focuses the first date field', async ({
  page,
}) => {
  await page.goto('/reports');

  await page.getByText('Date range', { exact: true }).click();

  await expect(page.locator('#rangePicker-start-field')).toBeFocused();
});

test('desktop date-range DatePicker navigates by consecutive month pairs', async ({
  page,
}) => {
  await page.goto('/reports');

  await page.getByRole('button', { name: 'Open calendar' }).first().click();

  const monthTitles = async () =>
    page.locator('[id^="month-"]').evaluateAll((tables) =>
      tables.map((table) =>
        table
          .closest('div[class*="_calendarMonth"]')
          ?.querySelector('[data-part="view-trigger"]')
          ?.textContent?.trim(),
      ),
    );

  await expect.poll(monthTitles).toEqual(['May 2026', 'June 2026']);

  const previous = page.getByRole('button', { name: 'Previous month' });
  const next = page.getByRole('button', { name: 'Next month' });

  await previous.click();
  await expect.poll(monthTitles).toEqual(['April 2026', 'May 2026']);

  await previous.click();
  await expect.poll(monthTitles).toEqual(['March 2026', 'April 2026']);

  await next.click();
  await expect.poll(monthTitles).toEqual(['April 2026', 'May 2026']);

  await next.click();
  await expect.poll(monthTitles).toEqual(['May 2026', 'June 2026']);
});

test('desktop date-range DatePicker keeps the month pair stable while hovering a range', async ({
  page,
}) => {
  await page.goto('/reports');

  await page.getByRole('button', { name: 'Open calendar' }).first().click();

  const monthTitles = async () =>
    page.locator('[id^="month-"]').evaluateAll((tables) =>
      tables.map((table) =>
        table
          .closest('div[class*="_calendarMonth"]')
          ?.querySelector('[data-part="view-trigger"]')
          ?.textContent?.trim(),
      ),
    );

  await expect.poll(monthTitles).toEqual(['May 2026', 'June 2026']);

  await page
    .getByRole('button', { name: /Monday, May 4th, 2026|Choose Monday, May 4, 2026/ })
    .first()
    .click();

  for (const name of [
    /Tuesday, May 5th, 2026|Choose Tuesday, May 5, 2026/,
    /Friday, May 15th, 2026|Choose Friday, May 15, 2026/,
    /Sunday, May 31st, 2026|Choose Sunday, May 31, 2026/,
    /Monday, June 1st, 2026|Choose Monday, June 1, 2026/,
    /Tuesday, June 9th, 2026|Choose Tuesday, June 9, 2026/,
  ]) {
    await page.getByRole('button', { name }).first().hover();
    await expect.poll(monthTitles).toEqual(['May 2026', 'June 2026']);
  }
});
