import { test as setup, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_URL, STORAGE_STATE } from '../constants';
import { TEST_USER } from '../test-user';

setup('authenticate', async ({ browser }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  const context = await browser.newContext();

  // Ensure the test user exists. The endpoint returns 409 if already
  // registered, which is fine for our purposes.
  const registerRes = await context.request.post(`${API_URL}/auth/register`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      name: TEST_USER.name,
    },
    failOnStatusCode: false,
  });
  if (!registerRes.ok() && registerRes.status() !== 409) {
    throw new Error(
      `register failed: ${registerRes.status()} ${await registerRes.text()}`,
    );
  }

  // Log in through the UI so the session cookie is set by the browser
  // (Chromium honours the Secure-over-localhost exception that the API
  // request context does not).
  const page = await context.newPage();
  await page.goto('/login');
  await page.locator('input#email').fill(TEST_USER.email);
  await page.locator('input#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible();

  // Wipe leftover test data so screens don't overflow and tables don't grow
  // past the viewport (which makes role-based cell selectors miss entries
  // that are rendered below the fold). Delete via fetch from inside the page
  // so the Secure session cookie is sent correctly. Order matters: entries
  // first (FK to projects), then projects (FK to clients), then clients.
  await page.evaluate(async (apiBase) => {
    const deleteAll = async (
      listUrl: string,
      itemPath: (id: string) => string,
    ) => {
      const res = await fetch(listUrl, { credentials: 'include' });
      if (!res.ok) return;
      const items: Array<{ id: string }> = await res.json();
      await Promise.all(
        items.map((e) =>
          fetch(`${apiBase}${itemPath(e.id)}`, {
            method: 'DELETE',
            credentials: 'include',
          }),
        ),
      );
    };

    await deleteAll(
      `${apiBase}/time-entries?from=2000-01-01&to=2100-01-01`,
      (id) => `/time-entries/${id}`,
    );
    await deleteAll(`${apiBase}/projects`, (id) => `/projects/${id}`);
    await deleteAll(`${apiBase}/clients`, (id) => `/clients/${id}`);
    await deleteAll(`${apiBase}/tags`, (id) => `/tags/${id}`);
  }, API_URL);

  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});
