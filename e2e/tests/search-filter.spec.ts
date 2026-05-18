import { test, expect } from '@playwright/test';
import { createTimeEntry, todayAt, uniqueName } from '../helpers';

test('list view search filters entries by description', async ({ page }) => {
  const wantedDesc = uniqueName('Find me');
  const otherDesc = uniqueName('Skip me');

  await page.goto('/');
  await createTimeEntry(page, {
    description: wantedDesc,
    startTime: todayAt('08:00'),
    endTime: todayAt('09:00'),
  });
  await createTimeEntry(page, {
    description: otherDesc,
    startTime: todayAt('09:30'),
    endTime: todayAt('10:30'),
  });

  await page.reload();
  await page.getByRole('link', { name: 'List' }).click();

  // Both entries are visible initially.
  await expect(page.getByText(wantedDesc)).toBeVisible();
  await expect(page.getByText(otherDesc)).toBeVisible();

  // Type a substring of the wanted description in the search box.
  const search = page.getByPlaceholder('Search description, project, client, tag…');
  await search.fill('Find me');

  // The other entry should disappear; the wanted one should remain.
  await expect(page.getByText(otherDesc)).toHaveCount(0);
  await expect(page.getByText(wantedDesc)).toBeVisible();

  // Clear the filter — both rows should reappear.
  await search.fill('');
  await expect(page.getByText(otherDesc)).toBeVisible();
  await expect(page.getByText(wantedDesc)).toBeVisible();
});
