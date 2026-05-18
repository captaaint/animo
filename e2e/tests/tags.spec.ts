import { test, expect } from '@playwright/test';
import {
  createTag,
  createTimeEntry,
  todayAt,
  uniqueName,
} from '../helpers';

test('manage tags from the Tags screen', async ({ page }) => {
  const tagName = uniqueName('Tag');

  await page.goto('/');
  await page.getByRole('link', { name: 'Tags' }).click();
  await expect(page).toHaveURL(/\/tags$/);

  await page.getByTestId('new-tag-btn').click();
  await page.locator('input#name').fill(tagName);
  await page.getByRole('button', { name: /^Save$/i }).click();

  await expect(page.getByText('Tag added')).toBeVisible();
  await expect(page.getByRole('cell', { name: tagName })).toBeVisible();
});

test('time entry with tags shows tag chips in the list view', async ({ page }) => {
  const tagName = uniqueName('frontend');
  const description = uniqueName('Tagged work');

  await page.goto('/');
  const tag = await createTag(page, tagName);
  await createTimeEntry(page, {
    description,
    startTime: todayAt('08:00'),
    endTime: todayAt('09:00'),
    tagIds: [tag.id],
  });

  await page.reload();
  await page.getByRole('link', { name: 'List' }).click();

  // The entry row should be visible alongside the tag chip.
  await expect(page.getByText(description)).toBeVisible();
  // The tag name should appear as a chip within the row.
  const row = page.getByTestId('list-entry-row').filter({ hasText: description }).first();
  await expect(row.getByText(tagName)).toBeVisible();
});
