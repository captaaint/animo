import { test, expect } from '@playwright/test';
import { uniqueName } from '../helpers';

test('create a new client via the UI', async ({ page }) => {
  const name = uniqueName('Client');

  await page.goto('/');
  await page.getByRole('link', { name: 'Clients' }).click();
  await expect(page).toHaveURL(/\/clients$/);

  await page.getByRole('button', { name: /New client/i }).click();

  const nameInput = page.locator('input#name');
  await expect(nameInput).toBeVisible();
  await nameInput.click();
  await page.keyboard.type(name);

  await page.getByRole('button', { name: /^Save$/i }).click();

  // The new client should appear in the table.
  await expect(page.getByRole('cell', { name })).toBeVisible();
});
