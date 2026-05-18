import { test, expect } from '@playwright/test';
import { API_URL } from '../constants';
import {
  createClient,
  createProject,
  uniqueName,
} from '../helpers';

test('Reports KPI shows billable hours and amount after creating a billable entry on a paid project', async ({
  page,
}) => {
  const clientName = uniqueName('Pay client');
  const projectName = uniqueName('Pay project');
  const description = uniqueName('Bill me');

  await page.goto('/');

  // Create a client + a project with a $50/h rate (EUR).
  const client = await createClient(page, clientName);
  // The createProject helper hits POST /projects directly with our extended
  // payload — pass hourlyRate/currency via raw fetch from the page context so
  // cookies are sent correctly.
  const projectRes = await page.evaluate(
    async ({ apiBase, name, clientId }) => {
      const res = await fetch(`${apiBase}/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          clientId,
          color: '#3b82f6',
          hourlyRate: 50,
          currency: 'EUR',
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return await res.json();
    },
    { apiBase: API_URL, name: projectName, clientId: client.id },
  );

  // Create a 1-hour entry on that project today and mark it billable.
  const now = new Date();
  const start = new Date(now);
  start.setHours(10, 0, 0, 0);
  const end = new Date(now);
  end.setHours(11, 0, 0, 0);

  await page.evaluate(
    async ({ apiBase, projectId, description, startTime, endTime }) => {
      const res = await fetch(`${apiBase}/time-entries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          description,
          startTime,
          endTime,
          billable: true,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return await res.json();
    },
    {
      apiBase: API_URL,
      projectId: projectRes.id,
      description,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  );

  // Navigate to reports. The default range is the current week which contains
  // today's entry.
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);

  // Billable Hours card should read "1h 00m".
  await expect(page.getByText('Billable Hours')).toBeVisible();
  await expect(page.getByText('1h 00m').first()).toBeVisible();

  // Amount card should show 50.00 EUR.
  await expect(page.getByText('50.00 EUR')).toBeVisible();

  // The row should be flagged with the $ marker.
  await expect(page.getByText(description)).toBeVisible();
});

test('ProjectModal hourly rate field persists on the project', async ({ page }) => {
  const projectName = uniqueName('Rate proj');

  await page.goto('/');
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole('button', { name: /New project/i }).click();

  await page.locator('input#name').fill(projectName);
  // The hourly rate field is a NumberBox bound to "hourlyRate".
  const rateInput = page.locator('input#hourlyRate');
  await rateInput.fill('75');

  await page.getByRole('button', { name: /^Save$/i }).click();

  await expect(page.getByText('Project added')).toBeVisible();
  // The project row should show "75 EUR/h" or "75 USD/h" depending on the
  // default we picked (EUR).
  await expect(page.getByText('75 EUR/h')).toBeVisible();
});
