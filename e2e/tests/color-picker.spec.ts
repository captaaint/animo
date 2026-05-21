import { test, expect } from '@playwright/test';

// Regression test for the xmlui ColorPicker controlled-input lag bug.
// Before the local extension override, dispatching a single `change` event
// on the underlying `<input type="color">` left the DOM input's `.value`
// snapping back to the previous color (because the parent's state update
// was wrapped in `startTransition`, while the input itself was controlled).
// The user-visible symptom was the swatch being one selection behind.
//
// This test exercises the user-driven path via the TagModal: open it, pick
// a new color, and assert the input's DOM value persists on the next paint
// without any second interaction. See docs/xmlui-bugs/colorpicker.md.
test('ColorPicker reflects the selected color on the first change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Tags' }).click();
  await expect(page).toHaveURL(/\/tags$/);

  await page.getByRole('button', { name: /New tag/i }).click();

  const colorInput = page.locator('input[type="color"]').first();
  await expect(colorInput).toBeVisible();

  // Sanity: the form starts at the TagModal's bound default color.
  await expect(colorInput).toHaveValue('#3f8f8c');

  // Simulate a single user color selection. With the upstream bug, React
  // would re-reconcile the controlled input with the stale `value` prop
  // on the next paint, reverting `.value` back to '#3f8f8c'.
  await colorInput.evaluate((el: HTMLInputElement) => {
    el.value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // The new color must stick on the very next paint — no second pick.
  await expect(colorInput).toHaveValue('#ff0000');
});
