import { test as base, expect } from '@playwright/test';

// XMLUI only renders `testId` as `data-testid` when it runs in E2E mode
// (`window.XMLUI_MOCK_TEST_ID`) or with `xsVerbose`. The app used to ship with
// `xsVerbose: true`; since that was dropped no `getByTestId(...)` locator could
// match. Turn E2E mode on for every page before the app boots.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { XMLUI_MOCK_TEST_ID?: boolean }).XMLUI_MOCK_TEST_ID = true;
    });
    await use(page);
  },
});

export { expect };
