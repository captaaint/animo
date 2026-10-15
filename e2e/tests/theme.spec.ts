import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import { API_URL } from '../constants';

const PREF_KEY = 'tt:theme-pref';
const TONE_KEY = 'tt:theme-tone';

// Reset the user's saved theme preference to "system" through the API so
// other specs don't inherit whatever this run picked. We do this in
// beforeEach so a flaky/cancelled run never wedges a tone for the next run.
test.beforeEach(async ({ request }) => {
  await request.patch(`${API_URL}/user/me`, {
    data: { preferences: { theme: 'system' } },
  });
});

// All theme specs read & write the same single local user, so they would
// race each other under fullyParallel. Run them serially to keep the
// preference state deterministic.
test.describe.configure({ mode: 'serial' });

// Start listening for the preference PATCH *before* the click that triggers it.
// The Select's change handler fires synchronously, so the request can complete
// before `click()` resolves; a listener registered afterwards would miss it.
const themePatch = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.url().includes('/api/user/me') &&
      res.request().method() === 'PATCH' &&
      res.ok(),
  );

test.describe('theme preference persistence', () => {
  test('Select on Settings updates the live tone and survives reload', async ({
    page,
  }) => {
    await page.goto('/settings');

    // The Theme picker is the only combobox on Settings. Selecting an option
    // both flips the live UI (via TonePersist.setTone in Main.xmlui) *and*
    // PATCHes the user record so a fresh load on another device gets the
    // same theme.
    const themeSelect = page.getByRole('combobox');
    await themeSelect.click();
    // Wait for the PATCH to land — otherwise a fast reload can race the
    // server write and read back the previous value.
    const darkSaved = themePatch(page);
    await page.getByRole('option', { name: 'Dark' }).click();
    await darkSaved;

    // Live: TonePersist mirrors the active tone into localStorage.
    const live = await page.evaluate(
      ({ pref, tone }) => ({
        pref: localStorage.getItem(pref),
        tone: localStorage.getItem(tone),
      }),
      { pref: PREF_KEY, tone: TONE_KEY },
    );
    expect(live.pref).toBe('dark');
    expect(live.tone).toBe('dark');

    // Reload: bootstrap re-hydrates preferences from the API and TonePersist
    // re-applies them in useLayoutEffect before the first paint.
    await page.reload();
    await expect(themeSelect).toHaveText(/Dark/i);
    const afterReload = await page.evaluate(
      ({ pref, tone }) => ({
        pref: localStorage.getItem(pref),
        tone: localStorage.getItem(tone),
      }),
      { pref: PREF_KEY, tone: TONE_KEY },
    );
    expect(afterReload.pref).toBe('dark');
    expect(afterReload.tone).toBe('dark');
  });

  test('picking "System" stores the preference and resolves to a concrete tone', async ({
    page,
  }) => {
    await page.goto('/settings');

    const themeSelect = page.getByRole('combobox');
    await themeSelect.click();
    const lightSaved = themePatch(page);
    await page.getByRole('option', { name: 'Light' }).click();
    await lightSaved;

    await themeSelect.click();
    const systemSaved = themePatch(page);
    await page.getByRole('option', { name: 'System' }).click();
    await systemSaved;

    const state = await page.evaluate(
      ({ pref, tone }) => ({
        pref: localStorage.getItem(pref),
        tone: localStorage.getItem(tone),
      }),
      { pref: PREF_KEY, tone: TONE_KEY },
    );
    // Preference is "system"; the resolved tone is whatever the test
    // environment's prefers-color-scheme says.
    expect(state.pref).toBe('system');
    expect(['light', 'dark']).toContain(state.tone);
  });
});
