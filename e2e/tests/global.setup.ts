import { test as setup, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_URL, STORAGE_STATE } from '../constants';
import { LOCAL_USER } from '../test-user';

// Local-first bootstrap: there is no login or session cookie. We just need to
// ensure the single local user exists so the app reaches the "ready" state
// (instead of showing the onboarding screen) on first navigation. POST
// /api/user/bootstrap creates the user and returns 409 if one already exists,
// which is fine — we only need *some* user present.
setup('bootstrap-local-user', async ({ browser }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  const context = await browser.newContext();

  const bootstrapRes = await context.request.post(`${API_URL}/user/bootstrap`, {
    data: { name: LOCAL_USER.name, username: LOCAL_USER.username },
    failOnStatusCode: false,
  });
  if (!bootstrapRes.ok() && bootstrapRes.status() !== 409) {
    throw new Error(
      `bootstrap failed: ${bootstrapRes.status()} ${await bootstrapRes.text()}`,
    );
  }

  // Sanity check: the GET form must now report setupComplete:true so every
  // spec can assume the app boots straight into the workspace.
  const statusRes = await context.request.get(`${API_URL}/user/bootstrap`);
  if (!statusRes.ok()) {
    throw new Error(
      `bootstrap status check failed: ${statusRes.status()} ${await statusRes.text()}`,
    );
  }
  const status = (await statusRes.json()) as { setupComplete: boolean };
  if (!status.setupComplete) {
    throw new Error('bootstrap status reports setupComplete=false after POST');
  }

  // Wipe leftover CRUD data so screens don't overflow and tables don't grow
  // past the viewport (which makes role-based cell selectors miss entries
  // rendered below the fold). Order matters: time-entries first (FK→projects,
  // tags), then projects (FK→clients), then clients and tags.
  const page = await context.newPage();
  await page.goto('/');
  // Wait for the workspace to mount before issuing deletes — otherwise the
  // AppShell may still be loading its data sources.
  await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible({
    timeout: 10_000,
  });

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

  // Persist the (mostly empty) storage state so the chromium project can
  // reuse the same browser-context shape across specs. There are no session
  // cookies in the local-first model, but localStorage (e.g. tt:theme-pref)
  // can carry user preferences that some specs want pre-cleared.
  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});
