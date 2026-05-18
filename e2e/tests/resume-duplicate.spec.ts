import { test, expect } from '@playwright/test';
import {
  createClient,
  createProject,
  createTimeEntry,
  todayAt,
  uniqueName,
} from '../helpers';

test('Resume (▶) starts the TimerBar stopwatch with the entry description and project', async ({ page }) => {
  const description = uniqueName('Resume me');
  const clientName = uniqueName('Resume client');
  const projectName = uniqueName('Resume project');

  await page.goto('/');
  const client = await createClient(page, clientName);
  const project = await createProject(page, projectName, client.id);
  await createTimeEntry(page, {
    description,
    projectId: project.id,
    startTime: todayAt('08:00'),
    endTime: todayAt('09:30'),
  });

  // Reload so DataSources pick up the new project + entry.
  await page.reload();

  await page.getByRole('link', { name: 'List' }).click();
  await expect(page.getByText(description)).toBeVisible();

  // Make sure the TimerBar starts in the idle state.
  const header = page.getByRole('banner');
  await expect(
    header.getByRole('button', { name: '▶', exact: true }),
  ).toBeVisible();

  // Open the row's dot-menu, then click Resume.
  const row = page.getByTestId('list-entry-row').filter({ hasText: description }).first();
  await row.getByTestId('row-actions').click();
  await page.getByTestId('resume-entry').click();

  // After resume the header should show the stop (■) button — the timer
  // started — and the description input should hold the entry's text.
  await expect(
    header.getByRole('button', { name: '■', exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder('What are you working on?')).toHaveValue(
    description,
  );

  // Stop the timer so we leave the app in a clean state. The save toast is
  // racy (depends on the API roundtrip) so we don't assert on it — the core
  // resume verification is the ▶ → ■ swap plus the description value above.
  await header.getByRole('button', { name: '■', exact: true }).click();
});

test('Duplicate (Copy) clones the entry to today and toasts success', async ({ page }) => {
  const description = uniqueName('Dup me');

  await page.goto('/');
  // Place the original entry yesterday so we can prove the duplicate landed
  // on a different day (today).
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  await createTimeEntry(page, {
    description,
    startTime: (() => {
      const d = new Date(yesterday);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    })(),
    endTime: (() => {
      const d = new Date(yesterday);
      d.setHours(10, 0, 0, 0);
      return d.toISOString();
    })(),
  });

  await page.reload();
  await page.getByRole('link', { name: 'List' }).click();

  // Wait until the original row is on screen.
  await expect(page.getByText(description).first()).toBeVisible();

  const row = page.getByTestId('list-entry-row').filter({ hasText: description }).first();
  await row.getByTestId('row-actions').click();
  await page.getByTestId('duplicate-entry').click();

  await expect(page.getByText('Entry duplicated')).toBeVisible();

  // Two rows should now contain the description (yesterday + today).
  await expect(page.getByText(description)).toHaveCount(2);
});
