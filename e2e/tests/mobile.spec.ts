import { test, expect } from '@playwright/test';

// Mobile web UX regression suite. Runs under the WebKit "mobile-safari" project
// (iPhone viewport, touch) defined in playwright.config.ts, which is the closest
// automatable proxy for iOS Safari. It guards the three mobile fixes:
//   1. Settings is reachable from the nav (mobile NavLink, not the desktop-only
//      footer dropdown that renders behind the nav drawer).
//   2. Text inputs render at >= 16px so iOS Safari does not auto-zoom on focus.
//   3. Bottom drawers fit within the visible viewport with their pinned header
//      (and its action buttons) on screen.
//
// Behaviours that depend on real iOS Safari runtime chrome — the actual
// focus auto-zoom animation, and the dynamic-toolbar (dvh) resize — cannot be
// reproduced by a headless engine; those live in the manual checklist at
// docs/mobile-testing.md.

test.describe('mobile', () => {
  test('Settings is reachable from the mobile nav drawer', async ({ page }) => {
    await page.goto('/');

    // On mobile the NavPanel collapses behind a hamburger; open it.
    await page.getByRole('button', { name: 'hamburger' }).click();

    // Settings is a first-class NavLink on mobile (the desktop footer dropdown
    // renders behind the drawer and is unreachable there).
    const settingsLink = page.getByRole('link', { name: 'Settings' });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('Local profile')).toBeVisible();
  });

  test('text inputs render at >= 16px to prevent iOS auto-zoom', async ({
    page,
  }) => {
    // /settings is reachable by direct navigation and has plain TextBox inputs.
    await page.goto('/settings');

    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible();

    const fontSizePx = await input.evaluate(
      (el) => parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontSizePx).toBeGreaterThanOrEqual(16);
  });

  test('a bottom drawer fits the viewport with its header on screen', async ({
    page,
  }) => {
    await page.goto('/projects');

    // Open the New project drawer.
    await page.getByRole('button', { name: /New project/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const vh = viewport!.height;

    // The drawer body is intentionally taller than the viewport and scrolls
    // internally, so we don't assert on the whole dialog box. What must hold is
    // that the pinned header — and its action buttons — stays on screen. With a
    // vh height the bottom-anchored drawer would push the header above the top
    // (negative y) behind the iOS address bar; with dvh it sits within view.
    // A 1px rounding tolerance covers dvh's fractional-px height.
    const headerButtons = ['close', 'checkmark'];
    for (const name of headerButtons) {
      const btn = dialog.getByRole('button', { name });
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box, `${name} button has a layout box`).not.toBeNull();
      expect(box!.y, `${name} button top within viewport`).toBeGreaterThanOrEqual(-1);
      expect(
        box!.y + box!.height,
        `${name} button bottom within viewport`,
      ).toBeLessThanOrEqual(vh + 1);
    }
  });

  test('Settings scrolls so the bottom card is reachable on mobile', async ({
    page,
  }) => {
    await page.goto('/settings');

    // On a phone the Settings cards stack vertically and exceed the viewport,
    // so the bottom card (Appearance) is only reachable by scrolling. The Theme
    // picker is the only combobox on Settings. If the page were clipped instead
    // of scrollable, scrollIntoViewIfNeeded couldn't reveal it and the
    // toBeInViewport assertion would fail.
    const themePicker = page.getByRole('combobox');
    await expect(themePicker).toBeVisible();
    await themePicker.scrollIntoViewIfNeeded();
    await expect(themePicker).toBeInViewport();
  });
});
