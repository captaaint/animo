import { expect, test, type Page } from '@playwright/test';
import { createTimeEntry, todayAt, uniqueName } from '../helpers';

async function openNewEntryModal(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();
  await expect(page).toHaveURL(/\/list$/);
  await page.getByRole('button', { name: /New entry/i }).click();

  const description = page.locator('textarea[placeholder="Add description..."]').first();
  await expect(description).toBeVisible();
  return description;
}

test('description autocomplete preserves spaces while suggestions are open', async ({
  page,
}) => {
  const previous = uniqueName('Alpha beta task');

  await page.goto('/');
  await createTimeEntry(page, {
    description: previous,
    startTime: todayAt('08:00'),
    endTime: todayAt('09:00'),
  });

  const description = await openNewEntryModal(page);

  await description.fill('Alpha');
  await expect(page.getByRole('option', { name: previous })).toBeVisible();

  await description.press(' ');
  await expect(description).toHaveValue('Alpha ');
});

test('description autocomplete suggests previous descriptions by prefix', async ({
  page,
}) => {
  const previous = uniqueName('Autocomplete planning');
  const prefix = previous.slice(0, 'Autocomplete'.length);

  await page.goto('/');
  await createTimeEntry(page, {
    description: previous,
    startTime: todayAt('09:00'),
    endTime: todayAt('10:00'),
  });

  const description = await openNewEntryModal(page);

  await description.fill(prefix);
  await expect(page.getByRole('option', { name: previous })).toBeVisible();
});

test('description autocomplete can select a suggestion from the keyboard', async ({
  page,
}) => {
  const previous = uniqueName('Keyboard selected task');
  const prefix = previous.slice(0, 'Keyboard selected'.length);

  await page.goto('/');
  await createTimeEntry(page, {
    description: previous,
    startTime: todayAt('10:00'),
    endTime: todayAt('11:00'),
  });

  const description = await openNewEntryModal(page);

  await description.fill(prefix);
  await expect(page.getByRole('option', { name: previous })).toBeVisible();

  await description.press('Tab');
  await expect(description).toHaveValue(previous);
});
