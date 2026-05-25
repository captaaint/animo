import { test, expect } from '@playwright/test';

// Local-first model: with a bootstrapped user (global.setup) the app boots
// straight into the workspace. There is no login screen — only the workspace
// nav links are visible.
test.describe('smoke', () => {
  test('app boots straight into the workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
  });

  test('navigates between sections', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await page.getByRole('link', { name: 'Clients' }).click();
    await expect(page).toHaveURL(/\/clients$/);

    await page.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports$/);
  });

  test('legacy /login and /register routes redirect to workspace', async ({
    page,
  }) => {
    // Defined as <Redirect to="/"> in Main.xmlui so old bookmarks and the
    // route-persistence helper can't strand a user on a dead page.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible();

    await page.goto('/register');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible();
  });
});
