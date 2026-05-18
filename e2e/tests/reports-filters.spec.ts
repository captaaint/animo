import { test, expect } from '@playwright/test';
import {
  createClient,
  createProject,
  createTag,
  createTimeEntry,
  todayAt,
  uniqueName,
} from '../helpers';

test('client filter reduces the entry table to that client only', async ({ page }) => {
  const clientA = uniqueName('FilterA');
  const clientB = uniqueName('FilterB');
  const projectA = uniqueName('ProjA');
  const projectB = uniqueName('ProjB');
  const descA = uniqueName('AEntry');
  const descB = uniqueName('BEntry');

  await page.goto('/');
  const cA = await createClient(page, clientA);
  const cB = await createClient(page, clientB);
  const pA = await createProject(page, projectA, cA.id);
  const pB = await createProject(page, projectB, cB.id);
  await createTimeEntry(page, {
    description: descA,
    projectId: pA.id,
    startTime: todayAt('08:00'),
    endTime: todayAt('09:00'),
  });
  await createTimeEntry(page, {
    description: descB,
    projectId: pB.id,
    startTime: todayAt('10:00'),
    endTime: todayAt('11:00'),
  });

  await page.reload();
  await page.getByRole('link', { name: 'Reports' }).click();

  // Both rows visible initially.
  await expect(page.getByText(descA)).toBeVisible();
  await expect(page.getByText(descB)).toBeVisible();

  // Pick clientA from the client filter.
  await page.getByTestId('filter-client').click();
  await page.getByRole('option', { name: clientA }).click();

  // Only the A entry remains.
  await expect(page.getByText(descA)).toBeVisible();
  await expect(page.getByText(descB)).toHaveCount(0);

  // Clear filters.
  await page.getByTestId('filter-clear').click();
  await expect(page.getByText(descB)).toBeVisible();
});

test('AppHeader Export PDF button on Reports page opens the preview', async ({ page }) => {
  await page.goto('/');
  await createTimeEntry(page, {
    description: uniqueName('HeaderPdf'),
    startTime: todayAt('13:00'),
    endTime: todayAt('14:00'),
  });

  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);

  await page.getByTestId('header-export-pdf').click();

  // Same downstream behavior as before: the preview modal mounts with a
  // Download + Discard button pair.
  await expect(page.getByRole('button', { name: /^Download$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Discard$/i })).toBeVisible();
});

test('export PDF succeeds when entries carry tags', async ({ page }) => {
  // Locks in the TAGS column path in reportPdf.ts: ReportsScreen enriches
  // each entry with {name, color} tag objects, and the PDF generator must
  // render them without crashing when at least one entry has tags attached.
  const tagName = uniqueName('alpha');

  await page.goto('/');
  const tag = await createTag(page, tagName, '#7c3aed');
  await createTimeEntry(page, {
    description: uniqueName('TaggedPdf'),
    startTime: todayAt('16:00'),
    endTime: todayAt('17:00'),
    tagIds: [tag.id],
  });

  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByTestId('header-export-pdf').click();

  await expect(page.getByRole('button', { name: /^Download$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /^Discard$/i })).toBeVisible();
});

test('tag filter narrows entries to those with the selected tag', async ({ page }) => {
  const tagName = uniqueName('focus');
  const desc1 = uniqueName('Tagged');
  const desc2 = uniqueName('Untagged');

  await page.goto('/');
  const tag = await createTag(page, tagName);
  await createTimeEntry(page, {
    description: desc1,
    startTime: todayAt('07:00'),
    endTime: todayAt('07:30'),
    tagIds: [tag.id],
  });
  await createTimeEntry(page, {
    description: desc2,
    startTime: todayAt('07:45'),
    endTime: todayAt('08:15'),
  });

  await page.reload();
  await page.getByRole('link', { name: 'Reports' }).click();

  await expect(page.getByText(desc1)).toBeVisible();
  await expect(page.getByText(desc2)).toBeVisible();

  await page.getByTestId('filter-tag').click();
  await page.getByRole('option', { name: tagName }).click();

  await expect(page.getByText(desc1)).toBeVisible();
  await expect(page.getByText(desc2)).toHaveCount(0);
});
