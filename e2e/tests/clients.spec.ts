import { test, expect } from '../fixtures';
import { uniqueName } from '../helpers';

test('create a new client via the UI', async ({ page }) => {
  const name = uniqueName('Client');

  await page.goto('/');
  await page.getByRole('link', { name: 'Clients' }).click();
  await expect(page).toHaveURL(/\/clients$/);

  await page.getByRole('button', { name: /New client/i }).click();

  // ClientModal's "Name" TextBox — located by its label, not a DOM id.
  const nameInput = page.getByRole('dialog').getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toBeVisible();
  await nameInput.click();
  await page.keyboard.type(name);

  await page.getByRole('button', { name: /^Save client$/i }).click();
  await expect(page.getByText('Client added')).toBeVisible();

  // The new client should appear in the table.
  await expect(page.getByRole('cell', { name })).toBeVisible();
});
