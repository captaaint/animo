import { test, expect } from '@playwright/test';

// Regression: AuthGate used to fire `onSignIn` from its bootstrap path on
// every page mount. Main.xmlui's `onSignIn="Actions.navigate('/')"` then
// kicked in on every refresh, so reloading the browser on any route
// silently bounced the user back to the Calendar (`/`). The fix scopes
// `onSignIn` to interactive sign-in / register flows only — bootstrap
// raises `onBootstrap` but no longer impersonates a sign-in.

const ROUTES: Array<{ path: string; link: string }> = [
  { path: '/list', link: 'List' },
  { path: '/projects', link: 'Projects' },
  { path: '/clients', link: 'Clients' },
  { path: '/reports', link: 'Reports' },
  { path: '/tags', link: 'Tags' },
  { path: '/settings', link: 'Settings' },
];

for (const route of ROUTES) {
  test(`reloading ${route.path} keeps the user on ${route.path}`, async ({ page }) => {
    await page.goto('/');
    // Navigate via the in-app nav link (the app uses a HashRouter).
    await page.getByRole('link', { name: route.link }).click();
    const hash = `#${route.path}`;
    await expect.poll(() => page.url()).toContain(hash);

    // Hard-reload and confirm we land on the same hash route.
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain(hash);
  });
}
