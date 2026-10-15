import { test, expect } from '../fixtures';
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

  const dialog = page.getByRole('dialog');
  const nameInput = dialog.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toBeVisible();
  await nameInput.click();
  await page.keyboard.type(projectName);

  // Client is an AutoComplete: type to filter, then pick the option.
  const clientInput = dialog.getByRole('combobox', { name: 'Client' });
  await clientInput.click();
  await clientInput.pressSequentially(clientName.slice(0, 12));
  await page.getByRole('option', { name: clientName }).click();

  await page.getByRole('button', { name: /^Save project$/i }).click();
  await expect(page.getByText('Project added')).toBeVisible();

  // The new project row, with the chosen client, should appear in the table.
  await expect(page.getByRole('cell', { name: projectName })).toBeVisible();
  await expect(page.getByRole('cell', { name: clientName })).toBeVisible();
});
