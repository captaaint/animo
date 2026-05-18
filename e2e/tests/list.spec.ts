import { test, expect } from '@playwright/test';
import { createTimeEntry, todayAt, uniqueName } from '../helpers';

test('create a new time entry from the List view', async ({ page }) => {
  const description = uniqueName('List entry');

  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();
  await expect(page).toHaveURL(/\/list$/);

  await page.getByRole('button', { name: /New entry/i }).click();

  // EntryModal: the description input has a "What did you work on?"
  // placeholder.
  const descrInput = page.getByPlaceholder('What did you work on?');
  await expect(descrInput).toBeVisible();
  await descrInput.click();
  await page.keyboard.type(description);

  // New-entry button label is "Add" (Save is only for edits).
  await page.getByRole('button', { name: /^Add$/i }).click();

  await expect(page.getByText('Entry added')).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();
});

test('row dot-menu Delete removes the entry after confirm', async ({ page }) => {
  const description = uniqueName('Doomed');

  await page.goto('/');
  await createTimeEntry(page, {
    description,
    startTime: todayAt('10:00'),
    endTime: todayAt('11:00'),
  });

  await page.reload();
  await page.getByRole('link', { name: 'List' }).click();

  const row = page
    .getByTestId('list-entry-row')
    .filter({ hasText: description })
    .first();
  await expect(row).toBeVisible();

  await row.getByTestId('row-actions').click();
  await page.getByTestId('delete-entry').click();

  // XMLUI's APICall confirmMessage opens an in-page ConfirmationModal with
  // a default "Yes" button. Confirm to actually fire the DELETE.
  await page.getByRole('button', { name: /^Yes$/i }).click();

  await expect(page.getByText('Entry deleted')).toBeVisible();
  await expect(page.getByText(description)).toHaveCount(0);
});

test('empty list shows only the friendly empty state, not "No data available"', async ({
  page,
}) => {
  // Regression: the List previously rendered both a custom NoResult ("No
  // entries this week") and its own default "No data available" footer. The
  // fix moved the NoResult into emptyListTemplate so only one message shows.
  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();
  await expect(page).toHaveURL(/\/list$/);

  // Search for a string no entry could possibly match.
  await page
    .getByPlaceholder('Search description, project, client, tag…')
    .fill('zzz-no-such-entry-zzz');

  await expect(page.getByText('No entries match your search')).toBeVisible();
  await expect(page.getByText('No data available')).toHaveCount(0);
});

test('Today / This week totals reflect entries on the List view', async ({ page }) => {
  // Regression: after the ListScreen refactor the Today / This week cards
  // referenced `entriesDs.value` (which only lives in Timesheet's scope), so
  // both totals silently rendered as "0h 00m". Use $props.entries instead.
  await page.goto('/');
  await createTimeEntry(page, {
    description: uniqueName('Total entry'),
    startTime: todayAt('08:00'),
    endTime: todayAt('09:30'),
  });

  await page.reload();
  await page.getByRole('link', { name: 'List' }).click();

  // The Today card must show at least the 1h 30m we just added.
  const todayCard = page
    .locator('div', { has: page.getByText('Today', { exact: true }) })
    .first();
  await expect(todayCard).toBeVisible();
  // 0h 00m is the broken-baseline value; assert we're not seeing it.
  await expect(todayCard).not.toContainText('0h 00m');
});
