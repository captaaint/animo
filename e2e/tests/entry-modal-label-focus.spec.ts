import { expect, test } from '@playwright/test';

test('entry modal labels focus their fields', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();
  await page.getByRole('button', { name: /New entry/i }).click();

  await page.getByText('What did you work on?', { exact: true }).click();
  await expect(page.locator('#descrInput')).toBeFocused();

  await page.getByText('Project', { exact: true }).click();
  await expect(page.locator('#projectInput')).toBeFocused();

  await page.getByText('Tags', { exact: true }).click();
  await expect(page.locator('#tagsInput')).toBeFocused();

  await page.getByText('Start', { exact: true }).click();
  await expect(page.locator('#startInput-input')).toBeFocused();

  await page.getByText('End', { exact: true }).click();
  await expect(page.locator('#endInput-input')).toBeFocused();

  await page.getByText('Duration', { exact: true }).click();
  await expect(page.locator('#durInput-input')).toBeFocused();

  await page.getByText('Date', { exact: true }).click();
  await expect(page.locator('#entryDatePicker-start-field')).toBeFocused();
});
