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

  test('the date-range DatePicker opens as a scrollable bottom sheet', async ({
    page,
  }) => {
    await page.goto('/reports');

    // Open the Reports date-range picker via its calendar adornment.
    await page.getByRole('button', { name: 'Open calendar' }).first().click();

    // On mobile the calendar is a bottom-sheet drawer, not an anchored popover.
    const sheet = page.getByTestId('datepicker-sheet');
    await expect(sheet).toBeVisible();
    await sheet.evaluate(async (el) => {
      await Promise.all(
        el.getAnimations({ subtree: true }).map((animation) =>
          animation.finished.catch(() => undefined),
        ),
      );
    });

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const vh = viewport!.height;

    // The sheet is pinned to the bottom edge of the screen.
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox, 'sheet has a layout box').not.toBeNull();
    expect(sheetBox!.y + sheetBox!.height).toBeGreaterThanOrEqual(vh - 2);

    // The pinned header's close button stays on screen while the body scrolls.
    const close = sheet.getByRole('button', { name: 'close' });
    await expect(close).toBeVisible();
    const closeBox = await close.boundingBox();
    expect(closeBox!.y).toBeGreaterThanOrEqual(-1);
    expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(vh + 1);

    // Months are stacked vertically — each rendered month is a day-grid table
    // (id="month-N"). Desktop range shows two; the mobile stack renders many
    // more, which is what makes scroll-based navigation work.
    const monthTables = sheet.locator('[id^="month-"]');
    expect(await monthTables.count()).toBeGreaterThanOrEqual(3);

    // Navigation is by scrolling: the calendar body has overflowing content in a
    // scrollable container (no prev/next chevrons on mobile).
    const isScrollable = await sheet.evaluate((el) => {
      for (const node of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
        const overflowY = getComputedStyle(node).overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight + 4
        ) {
          return true;
        }
      }
      return false;
    });
    expect(isScrollable).toBe(true);

    // Selecting dates updates the live summary. Reports opens with an initial
    // range, so capture it first, then pick a fresh range and assert it changed.
    // Use DOM click here instead of locator.click(): Playwright scrolls the
    // target into view before a locator click, which would mask the app's own
    // scroll stability in this drawer.
    const summary = sheet.getByTestId('datepicker-summary');
    await expect(summary).toBeVisible();
    const before = (await summary.textContent())?.trim();
    const calendarBodyMetrics = async () =>
      sheet.evaluate((el) => {
        const currentMonth = el.querySelector<HTMLElement>('#month-6');
        let node = currentMonth?.parentElement;
        while (node) {
          const overflowY = getComputedStyle(node).overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight + 4
          ) {
            const box = node.getBoundingClientRect();
            return {
              top: box.top,
              height: box.height,
              scrollTop: node.scrollTop,
            };
          }
          node = node.parentElement;
        }
        throw new Error('DatePicker calendar body was not scrollable');
      });
    await sheet.evaluate((el) => {
      const view = el.querySelector<HTMLElement>('#month-6')?.closest<HTMLElement>('div[class*="_view"]');
      const march = Array.from(el.querySelectorAll<HTMLElement>('[id^="month-"]')).find(
        (table) =>
          table
            .closest<HTMLElement>('div[class*="_calendarMonth"]')
            ?.querySelector('button')
            ?.textContent?.trim() === 'March 2026',
      );
      const marchMonth = march?.closest<HTMLElement>('div[class*="_calendarMonth"]');
      if (!view || !marchMonth) throw new Error('March 2026 month was not rendered');
      view.scrollTop = marchMonth.offsetTop;
    });
    const bodyAtMarch = await calendarBodyMetrics();

    await sheet
      .getByRole('button', { name: 'Choose Monday, March 9, 2026' })
      .evaluate((button: HTMLButtonElement) => button.click());
    const bodyAfterStart = await calendarBodyMetrics();
    expect(Math.abs(bodyAfterStart.top - bodyAtMarch.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(bodyAfterStart.height - bodyAtMarch.height)).toBeLessThanOrEqual(1);
    expect(bodyAfterStart.scrollTop).toBe(bodyAtMarch.scrollTop);

    await sheet
      .getByRole('button', { name: 'Choose Sunday, March 22, 2026' })
      .evaluate((button: HTMLButtonElement) => button.click());
    const bodyAfterEnd = await calendarBodyMetrics();
    expect(Math.abs(bodyAfterEnd.top - bodyAtMarch.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(bodyAfterEnd.height - bodyAtMarch.height)).toBeLessThanOrEqual(1);
    expect(bodyAfterEnd.scrollTop).toBe(bodyAtMarch.scrollTop);

    await expect
      .poll(async () => (await summary.textContent())?.trim())
      .not.toBe(before);
    await expect(summary).toContainText('Mar 9, 2026');
    await expect(summary).toContainText('Mar 22, 2026');

    // The close button dismisses the sheet.
    await close.click();
    await expect(sheet).toBeHidden();
  });
});
