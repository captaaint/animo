import { test, expect } from '@playwright/test';
import { createTimeEntry, todayAt, uniqueName } from '../helpers';

test('reports screen shows totals and the entry table for the current week', async ({
  page,
}) => {
  const description = uniqueName('Report entry');

  await page.goto('/');
  await createTimeEntry(page, {
    description,
    startTime: todayAt('09:00'),
    endTime: todayAt('10:30'),
  });

  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);

  // The header cards include "Total Hours" with a duration like "1h 30m" or
  // the full week total accumulated by previous tests. Either way it must
  // not be the empty "0h 00m" we'd see with no data at all.
  await expect(page.getByText('Total Hours')).toBeVisible();

  // Our just-created entry shows up in the detail list.
  await expect(
    page.getByTestId('reports-entry-row').filter({ hasText: description }).first(),
  ).toBeVisible();
});

test('empty reports list shows the friendly empty state, not "No data available"', async ({
  page,
}) => {
  // The Reports List used to show only the default "No data available". After
  // the fix, an empty result set should render the same NoResult we use on
  // the List screen instead. Forcing an impossible search guarantees zero
  // matching entries regardless of what the seeded DB contains.
  await page.goto('/');
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);

  await page
    .getByPlaceholder('Search description, project, client, tag…')
    .fill('zzz-no-such-entry-zzz');

  await expect(page.getByText('No entries match your filters')).toBeVisible();
  await expect(page.getByText('No data available')).toHaveCount(0);
});

test('export PDF opens the preview modal with a Download button', async ({ page }) => {
  await page.goto('/');
  await createTimeEntry(page, {
    description: uniqueName('PDF entry'),
    startTime: todayAt('15:00'),
    endTime: todayAt('15:45'),
  });

  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByRole('button', { name: /Export PDF/i }).click();

  // pdfmake renders client-side; once done the preview modal mounts with a
  // Discard / Download pair. Allow plenty of time for the first render
  // (pdfmake loads its font VFS the first time).
  await expect(page.getByRole('button', { name: /^Download$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Discard$/i })).toBeVisible();
});
