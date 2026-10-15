import { test, expect } from '../fixtures';
import { createClient, createProject, createTimeEntry, todayAt, uniqueName } from '../helpers';

// Originally a recorded trace that clicked through the Reports "Search project
// or client" filter against the demo dataset. Rewritten to seed its own data so
// it runs against any database: the Projects filter groups projects by client,
// matches client names as well as project names, and is multi-select.
test('Reports project filter searches by client and multi-selects projects', async ({ page }) => {
  const clientA = uniqueName('SearchClientA');
  const clientB = uniqueName('SearchClientB');
  const projectA1 = uniqueName('Alpha');
  const projectA2 = uniqueName('Beta');
  const projectB1 = uniqueName('Gamma');
  const descA1 = uniqueName('A1 work');
  const descA2 = uniqueName('A2 work');
  const descB1 = uniqueName('B1 work');

  await page.goto('/');
  const cA = await createClient(page, clientA);
  const cB = await createClient(page, clientB);
  const pA1 = await createProject(page, projectA1, cA.id);
  const pA2 = await createProject(page, projectA2, cA.id);
  const pB1 = await createProject(page, projectB1, cB.id);
  for (const [description, projectId, from, to] of [
    [descA1, pA1.id, '08:00', '08:30'],
    [descA2, pA2.id, '09:00', '09:30'],
    [descB1, pB1.id, '10:00', '10:30'],
  ] as const) {
    await createTimeEntry(page, { description, projectId, startTime: todayAt(from), endTime: todayAt(to) });
  }

  await page.reload();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByText(descB1)).toBeVisible();

  const filter = page.getByRole('combobox', { name: 'Projects' });
  await filter.click();
  await filter.pressSequentially(clientA);

  // Searching by the client name finds both of its projects, under its group
  // header, and nothing from the other client.
  await expect(page.getByRole('option', { name: projectA1 })).toBeVisible();
  await expect(page.getByRole('option', { name: projectA2 })).toBeVisible();
  await expect(page.getByRole('option', { name: projectB1 })).toHaveCount(0);
  await expect(page.getByText(clientA.toUpperCase(), { exact: true })).toBeVisible();

  // Multi-select: pick both projects of client A.
  await page.getByRole('option', { name: projectA1 }).click();
  await filter.fill(clientA);
  await page.getByRole('option', { name: projectA2 }).click();
  await page.keyboard.press('Escape');

  await expect(page.getByText(descA1)).toBeVisible();
  await expect(page.getByText(descA2)).toBeVisible();
  await expect(page.getByText(descB1)).toHaveCount(0);
});
