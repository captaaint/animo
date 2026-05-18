import { test, expect } from '@playwright/test';
import { createClient, uniqueName } from '../helpers';

test('create a new project linked to a client', async ({ page }) => {
  const clientName = uniqueName('Client');
  const projectName = uniqueName('Project');

  // Seed a client through the API so the project has something to bind to.
  await page.goto('/');
  await createClient(page, clientName);

  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/projects$/);

  await page.getByRole('button', { name: /New project/i }).click();

  const nameInput = page.locator('input#name');
  await expect(nameInput).toBeVisible();
  await nameInput.click();
  await page.keyboard.type(projectName);

  // The project modal now has two Selects (Client + Currency); scope to the
  // Client one by aria-label so we always open the correct dropdown.
  await page.getByRole('combobox', { name: 'Client' }).click();
  await page.getByRole('option', { name: clientName }).click();

  await page.getByRole('button', { name: /^Save$/i }).click();

  // The new project row, with the chosen client, should appear in the table.
  await expect(page.getByRole('cell', { name: projectName })).toBeVisible();
  await expect(page.getByRole('cell', { name: clientName })).toBeVisible();
});
