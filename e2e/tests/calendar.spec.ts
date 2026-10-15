import { test, expect } from '../fixtures';
import { createTimeEntry, todayAt, uniqueName } from '../helpers';

test('calendar renders the current week with day columns', async ({ page }) => {
  await page.goto('/');

  // The WeekCalendar header shows the 7 short weekday labels with day numbers.
  for (const wd of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
    await expect(page.getByText(wd, { exact: false }).first()).toBeVisible();
  }

  // Week navigation: clicking the Today button leaves us in the same week.
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText('MON').first()).toBeVisible();
});

test('an entry created via API appears on the calendar', async ({ page }) => {
  const description = uniqueName('Cal entry');

  await page.goto('/');
  await createTimeEntry(page, {
    description,
    startTime: todayAt('11:00'),
    endTime: todayAt('12:30'),
  });
  await page.reload();

  // WeekCalendar starts at 00:00 and the entry sits mid-day, so scroll the
  // block into the viewport before asserting visibility.
  const block = page.getByText(description).first();
  await block.scrollIntoViewIfNeeded();
  await expect(block).toBeVisible();
});

test('clicking an entry on the calendar opens the EntryModal for editing', async ({
  page,
}) => {
  const description = uniqueName('Edit entry');

  await page.goto('/');
  await createTimeEntry(page, {
    description,
    startTime: todayAt('13:00'),
    endTime: todayAt('14:00'),
  });
  await page.reload();

  // The entry's text node on the calendar grid is clickable and opens the
  // modal. Force the click because the WeekCalendar overlays a resize handle
  // on the bottom edge of the entry block that can intercept the pointer.
  const block = page.getByText(description).first();
  await block.scrollIntoViewIfNeeded();
  await block.click({ force: true });

  // EntryModal opens in edit mode ("Edit entry", with a Delete button) and the
  // description textarea is prefilled.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /^Save entry$/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Delete$/i })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'What did you work on?' })).toHaveValue(
    description,
  );
});
