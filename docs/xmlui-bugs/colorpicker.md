# [bug] `ColorPicker` selection lags one step behind because `onChange` is wrapped in `startTransition`

## Affected version

- `xmlui@0.12.27` (latest tested)
- Likely all versions since the `useTransition` change in `ColorPickerReact.tsx` was introduced.

## Environment

- React 18+
- Browsers tested: Chrome 138, Safari 17 (macOS Sonoma 14.8.5)
- Reproduced both in browser dev (`vite`) and in a Tauri desktop shell.

## Summary

`ColorPicker` renders a **controlled** native `<input type="color" value={value}>`, but the
internal change handler routes the new value through `React.startTransition`. The transition
defers the parent state update, so for one render the `value` prop the input is reconciled
against is still the old color. The native swatch visually snaps back to the previous color
until the next user interaction — i.e. the picker appears "one selection behind."

This is the canonical React anti-pattern of pairing a *controlled* input with a *transition*
on its value commit: <https://react.dev/reference/react/useTransition#starttransition-caveats>.

## Steps to reproduce

```xmlui
<App>
  <ColorPicker id="cp" initialValue="#3F8F8C" />
  <Text>Current value: {cp.value}</Text>
</App>
```

1. Click the swatch — native color dialog opens.
2. Pick a color (e.g. red `#ff0000`) and confirm.
3. **Observed:** the displayed `cp.value` text updates to `#ff0000`, but the rendered
   swatch on the `<input type="color">` is still the previous color (`#3F8F8C`).
4. Open the dialog again and pick another color (e.g. blue `#0000ff`).
5. **Observed:** the swatch *now* shows `#ff0000` (the previous pick), while the text
   updates to `#0000ff`. The visible swatch is always one selection behind.

Reproducible in isolation (no `Form`, no `bindTo` needed). When used inside `<Form bindTo="...">`,
the lag is more confusing because users assume the form value is wrong.

## Expected behavior

After confirming a color in the native dialog, the swatch displayed by the `<input>`
must match the just-selected color on the very next paint — not after a second interaction.

## Root cause

File: `xmlui/src/components/ColorPicker/ColorPickerReact.tsx` (`xmlui@0.12.27`)

```tsx
const [isPending, startTransition] = useTransition();

const updateValue = useCallback(
  (value: string) => {
    updateState?.({ value });
    onDidChange(value);
  },
  [onDidChange, updateState],
);

const updateValueWithTransition = useCallback(
  (value: string, immediate = false) => {
    if (immediate) {
      updateValue(value);
    } else {
      startTransition(() => {
        updateValue(value);   // <-- deferred
      });
    }
  },
  [updateValue, startTransition],
);

const onInputChange = useCallback(
  (event: ChangeEvent<HTMLInputElement>) => {
    updateValueWithTransition(event.target.value);   // <-- non-immediate path
  },
  [updateValueWithTransition],
);

// ...

<input
  // ...
  onChange={onInputChange}
  type="color"
  value={value}   // <-- controlled
/>
```

Sequence of events for a single user pick:

1. User confirms a new color in the native picker → DOM emits `change`.
2. `onInputChange` calls `updateValueWithTransition(newColor)` which calls
   `startTransition(() => updateState({ value: newColor }))`.
3. React commits the **synchronous** part of the render first. The synchronous part
   includes a re-render of the `<input>` with the *old* `value` prop (state hasn't
   updated yet), so the browser snaps the controlled input back to the old color.
4. The transition then commits the state update. `value` updates, the parent re-renders,
   and `updateState` runs — but the native picker UI has already closed, so the
   intermediate swatch the user sees is the *previous* color until they open it again.

The `setValue` API path (`updateValueWithTransition(newValue, true)`) is correctly
immediate, which is why programmatic updates (e.g. `colorPicker.setValue('#ff0000')`)
work without any lag. Only the user-driven `onChange` path is affected.

## Why `startTransition` is wrong here

`useTransition` is designed for state that drives *expensive non-urgent renders*
(filtering large lists, route changes, etc.). For a controlled input, the value
update *is* the urgent visual response — deferring it forces React to render the
input with stale state, which the browser then displays. From the React docs:

> Calls to `startTransition` are batched and run together; calls that update inputs
> (`<input>`, `<textarea>`, `<select>`) shouldn't be inside `startTransition`.

— <https://react.dev/reference/react/useTransition#starttransition-caveats>

## Proposed fix

Drop the transition from the user-driven path. The native color picker fires
exactly one `change` event per user action, so there is nothing to throttle.

```diff
- const onInputChange = useCallback(
-   (event: ChangeEvent<HTMLInputElement>) => {
-     updateValueWithTransition(event.target.value);
-   },
-   [updateValueWithTransition],
- );
+ const onInputChange = useCallback(
+   (event: ChangeEvent<HTMLInputElement>) => {
+     // Controlled input: must update synchronously, otherwise the
+     // displayed swatch lags one selection behind.
+     updateValue(event.target.value);
+   },
+   [updateValue],
+ );
```

`useTransition` / `updateValueWithTransition` can then be removed entirely, or kept
solely for the programmatic `setValue` path (which already takes the `immediate=true`
branch).

If a deferred path is desired for some other reason, the input must additionally be
switched to **uncontrolled** (use `defaultValue` and read on `change`) so the native
control owns its own visible state. Mixing controlled + transition on the same
`value` prop is incorrect either way.

## Suggested regression test

A Playwright / Vitest case that:

1. Renders `<ColorPicker id="cp" initialValue="#000000" />` plus a `<Text>{cp.value}</Text>`.
2. Dispatches a single `change` event on the underlying `<input type="color">` with value `#ff0000`.
3. Asserts both that the text reads `#ff0000` **and** that the DOM input's `.value` is `#ff0000`
   on the next animation frame (not after a second dispatch).

```ts
test("ColorPicker reflects selection on first change", async ({ page }) => {
  await page.goto("/test-pages/color-picker");
  const input = page.locator('input[type="color"]');
  await input.evaluate((el: HTMLInputElement) => {
    el.value = "#ff0000";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Both the controlled DOM value and the bound text must update
  // *before* any second interaction.
  await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.value))
    .toBe("#ff0000");
  await expect(page.getByText("#ff0000")).toBeVisible();
});
```

## References

- React docs — `useTransition` caveats:
  <https://react.dev/reference/react/useTransition#starttransition-caveats>
- React docs — controlled vs uncontrolled `<input>`:
  <https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable>
- XMLUI docs — `ColorPicker`:
  <https://docs.xmlui.org/components/ColorPicker>
