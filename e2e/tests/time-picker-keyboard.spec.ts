import { test, expect, Page, Locator } from '@playwright/test';

// E2E coverage for issue #48: the TimePicker accepts typed keyboard input in
// addition to the dropdown wheel. Exercised through the List → New entry
// modal, whose Start / End / Duration TimePickers are wired so editing one
// recomputes the others — which doubles as proof that onDidChange fires.
//
// The TimePicker inputs carry a stable, self-authored signature
// (inputmode="numeric" + placeholder="--:--") and render in document order
// Start, End, Duration — used here instead of fragile hashed CSS classes.

function timeInputs(page: Page): Locator {
  return page.locator('input[inputmode="numeric"][placeholder="--:--"]');
}

// Commit the focused time field by moving focus to a neutral element (the
// description box). Tab would land on the next *time* field, whose display is
// intentionally not refreshed while focused — so a neutral blur is used to
// avoid that and to let every field sync from its value.
async function blur(page: Page) {
  await page.getByPlaceholder('Add description...').click();
}

async function openNewEntryModal(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();
  await expect(page).toHaveURL(/\/list$/);
  await page.getByRole('button', { name: /New entry/i }).click();
  await expect(timeInputs(page).first()).toBeVisible();
}

test('typing a full HH:mm commits and recomputes the duration', async ({ page }) => {
  await openNewEntryModal(page);
  const inputs = timeInputs(page);
  const start = inputs.nth(0);
  const end = inputs.nth(1);
  const dur = inputs.nth(2);

  await start.fill('09:15');
  await blur(page);
  await expect(start).toHaveValue('09:15');

  await end.fill('10:45');
  await blur(page);
  await expect(end).toHaveValue('10:45');
  // 10:45 − 09:15 = 1h30m.
  await expect(dur).toHaveValue('01:30');
});

test('bare digits are normalized to HH:mm on blur', async ({ page }) => {
  await openNewEntryModal(page);
  const start = timeInputs(page).nth(0);

  await start.fill('0930');
  await blur(page);
  await expect(start).toHaveValue('09:30');
});

test('invalid input reverts to the last valid value on blur', async ({ page }) => {
  await openNewEntryModal(page);
  const start = timeInputs(page).nth(0);

  await start.fill('07:20');
  await blur(page);
  await expect(start).toHaveValue('07:20');

  await start.fill('99:99');
  await blur(page);
  await expect(start).toHaveValue('07:20');
});

test('pressing Enter commits the typed time and saves the entry', async ({ page }) => {
  await openNewEntryModal(page);
  const start = timeInputs(page).nth(0);

  // Enter both commits the typed value and submits the modal (its primary
  // action). The saved entry must therefore start at the typed time.
  await start.fill('06:37');
  await start.press('Enter');

  await expect(page.getByText(/06:37/).first()).toBeVisible();
});

test('the dropdown wheel still works and syncs into the typed field', async ({ page }) => {
  await openNewEntryModal(page);
  const start = timeInputs(page).nth(0);

  // A complete typed value live-commits, so no explicit commit is needed.
  await start.fill('09:15');
  await blur(page);
  await expect(start).toHaveValue('09:15');

  // Open the Start wheel via its clock trigger (the button sibling preceding
  // the input) and pick minutes 45 — a value unique to the minutes column
  // (hours only reach 23) and, with only this popover open, unique in the DOM.
  const startIcon = start.locator('xpath=preceding-sibling::button[1]');
  await startIcon.click();
  await page.getByRole('button', { name: '45', exact: true }).click();
  await expect(start).toHaveValue(/:45$/);
});
