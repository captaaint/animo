import { test, expect } from '../fixtures';
import { type Locator } from '@playwright/test';

// Palette swatches are plain colored divs (no test id), so find the one whose
// rendered background is the requested color.
async function swatch(dialog: Locator, rgb: string): Promise<Locator> {
  const index = await dialog.locator('div').evaluateAll(
    (els, color) =>
      els.findIndex(
        (el) =>
          getComputedStyle(el).backgroundColor === color &&
          (el as HTMLElement).offsetHeight >= 40,
      ),
    rgb,
  );
  if (index < 0) throw new Error(`no swatch with background ${rgb}`);
  return dialog.locator('div').nth(index);
}

// The tag color is picked from a swatch palette in TagModal (it replaced the
// earlier <input type="color"> ColorPicker, which lagged one pick behind). This keeps the original
// regression's intent: a single pick must show up immediately — the preview
// must never lag one selection behind.
test('tag color palette reflects the selected color on the first pick', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Tags' }).click();
  await expect(page).toHaveURL(/\/tags$/);

  await page.getByRole('button', { name: /^New tag$/i }).click();
  const dialog = page.getByRole('dialog');

  // Sanity: a new tag starts at the default "Sage teal".
  await expect(dialog.getByText('#3F8F8C', { exact: true })).toBeVisible();

  await (await swatch(dialog, 'rgb(235, 87, 87)')).click(); // Coral #EB5757

  // The preview updates on the very first pick — no second click.
  await expect(dialog.getByText('Coral', { exact: true })).toBeVisible();
  await expect(dialog.getByText('#EB5757', { exact: true })).toBeVisible();

  // And a second, different pick replaces it immediately as well.
  await (await swatch(dialog, 'rgb(63, 81, 181)')).click(); // Indigo #3F51B5
  await expect(dialog.getByText('Indigo', { exact: true })).toBeVisible();
  await expect(dialog.getByText('#3F51B5', { exact: true })).toBeVisible();
});
