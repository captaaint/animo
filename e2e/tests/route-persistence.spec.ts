import { test, expect } from '@playwright/test';

// Regression: AuthGate used to fire `onSignIn` from its bootstrap path on
// every page mount. Main.xmlui's `onSignIn="Actions.navigate('/')"` then
// kicked in on every refresh, so reloading the browser on any route
// silently bounced the user back to the Calendar (`/`). Local-first dropped
// the AuthGate entirely (LocalUserGate now bootstraps without navigation),
// but the regression matters for any future routing changes too — this
// spec keeps the deep-link reload behaviour covered.
//
// /settings is accessed via direct navigation: it is reachable only from the
// user dropdown menu in the NavPanel footer, not as a top-level nav link,
// so there's no `getByRole('link', { name: 'Settings' })` to click.

const ROUTES: Array<{ path: string; link?: string }> = [
  { path: '/list', link: 'List' },
  { path: '/projects', link: 'Projects' },
  { path: '/clients', link: 'Clients' },
  { path: '/reports', link: 'Reports' },
  { path: '/tags', link: 'Tags' },
  { path: '/settings' },
];

for (const route of ROUTES) {
  test(`reloading ${route.path} keeps the user on ${route.path}`, async ({ page }) => {
    await page.goto('/');
    if (route.link) {
      await page.getByRole('link', { name: route.link }).click();
    } else {
      await page.goto(route.path);
    }
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(route.path);

    // Hard-reload and confirm we land on the same path.
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe(route.path);
  });
}
