import { test, expect } from '@playwright/test';
import { API_URL } from '../constants';

// API contract for the local-first bootstrap flow. global.setup has already
// POSTed the test user, so we exercise the read-side here and confirm the
// legacy /auth/* routes have been removed entirely.
test.describe('user bootstrap api', () => {
  test('GET /user/bootstrap reports setupComplete=true with user payload', async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/user/bootstrap`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      setupComplete: boolean;
      user: {
        id: string;
        name: string;
        username: string;
        preferences: { theme: string };
      } | null;
    };
    expect(body.setupComplete).toBe(true);
    expect(body.user).not.toBeNull();
    expect(body.user!.name.length).toBeGreaterThan(0);
    expect(body.user!.username.length).toBeGreaterThan(0);
    expect(['system', 'light', 'dark']).toContain(body.user!.preferences.theme);
  });

  test('POST /user/bootstrap returns 409 when a user already exists', async ({
    request,
  }) => {
    const res = await request.post(`${API_URL}/user/bootstrap`, {
      data: { name: 'Duplicate', username: 'dupe' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(409);
  });

  test('GET /user/me returns user with preferences (no session cookie needed)', async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/user/me`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      id: string;
      preferences: {
        theme: string;
        uiDensity: string;
        dateFormat: string;
        timeFormat: string;
      };
    };
    expect(typeof body.id).toBe('string');
    expect(typeof body.preferences.theme).toBe('string');
    expect(typeof body.preferences.uiDensity).toBe('string');
  });

  test('data endpoints work without session cookies', async ({ request }) => {
    for (const path of ['/clients', '/projects', '/tags']) {
      const res = await request.get(`${API_URL}${path}`);
      expect(res.ok(), `${path} should be 200`).toBe(true);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test('legacy /auth/* routes are gone', async ({ request }) => {
    // Each of these used to be the pre-local-first authentication surface
    // (Task 3 removed them). They must now 404 so old clients fail loudly
    // instead of silently misbehaving.
    for (const legacy of [
      '/auth/me',
      '/auth/login',
      '/auth/register',
      '/auth/logout',
    ]) {
      const res = await request.post(`${API_URL}${legacy}`, {
        data: {},
        failOnStatusCode: false,
      });
      expect(
        res.status(),
        `${legacy} should be 404 (got ${res.status()})`,
      ).toBe(404);
    }
  });
});
