import { expect, test } from '../fixtures';

test('entry modal labels focus their fields', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'List' }).click();
  await page.getByRole('button', { name: /New entry/i }).click();
  // Scope label clicks to the modal: "Tags", "Date", … also appear in the nav.
  const dialog = page.getByRole('dialog');

  await dialog.getByText('What did you work on?', { exact: true }).click();
  await expect(page.locator('#descrInput')).toBeFocused();

  // Project and Tags are built-in XMLUI AutoCompletes, which generate their
  // own DOM ids; assert the label association through the accessible name.
  await dialog.getByText('Project', { exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Project' })).toBeFocused();

  // The Project dropdown opens on focus and covers this label, so dispatch the
  // click on the label itself (label activation still focuses its control).
  await dialog.getByText('Tags', { exact: true }).dispatchEvent('click');
  await expect(dialog.getByRole('combobox', { name: 'Tags' })).toBeFocused();

  await dialog.getByText('Start', { exact: true }).click();
  await expect(page.locator('#startInput-input')).toBeFocused();

  await dialog.getByText('End', { exact: true }).click();
  await expect(page.locator('#endInput-input')).toBeFocused();

  await dialog.getByText('Duration', { exact: true }).click();
  await expect(page.locator('#durInput-input')).toBeFocused();

  await dialog.getByText('Date', { exact: true }).click();
  await expect(page.locator('#entryDatePicker-start-field')).toBeFocused();
});
