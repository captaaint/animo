# Mobile web UX testing

Animo's web UI is responsive and is regularly used from phones. iOS Safari in
particular has behaviours that desktop Chrome never exercises (focus auto-zoom,
a dynamic browser-chrome viewport, popovers stacking against modal drawers).
This page is the validation suite for mobile web UX: an automated layer plus a
manual checklist for the parts a headless engine can't reproduce.

## What's automated

`e2e/tests/mobile.spec.ts` runs under the **`mobile-safari`** Playwright project
(WebKit + iPhone 13 viewport — the closest automatable proxy for iOS Safari).
It guards the deterministic half of each fix:

| Check | Asserts | Guards |
| --- | --- | --- |
| Settings reachable | hamburger → `Settings` NavLink → `/settings` loads | Settings nav fix |
| Input font-size | first `input` computes to ≥ 16px | iOS auto-zoom fix |
| Drawer fits viewport | drawer panel stays within the viewport and the header close/save buttons are on screen | drawer height (dvh) fix |

Run it locally (starts the API + app automatically via Playwright's `webServer`):

```sh
cd e2e
npm run install-browsers   # one-time: installs chromium + webkit
npm test -- --project=mobile-safari
```

The desktop `chromium` project ignores `mobile.spec.ts`, and the mobile project
only runs it, so the two viewports never cross-contaminate.

## What must be tested manually (real iOS Safari)

A headless WebKit build does not render the iOS browser chrome, so these three
behaviours can only be confirmed on a real device (or the iOS Simulator's
Safari). Test on an actual iPhone against the demo build or a dev server exposed
on the LAN.

### 1. Settings navigation

- [ ] Tap the hamburger to open the nav drawer.
- [ ] An **Account → Settings** entry is visible inside the drawer.
- [ ] Tapping it navigates to Settings in one gesture (no dropdown that opens
      behind the drawer).
- [ ] Portrait **and** landscape.

### 2. Input focus — no auto-zoom

For each input below, focus it and confirm the page does **not** zoom in:

- [ ] Timer/description box, entry drawer description (TextArea)
- [ ] Project / tag autocompletes
- [ ] Date field
- [ ] Client / project / tag create forms
- [ ] Settings: display name, username
- [ ] Onboarding/setup: name, username

Pinch-zoom must still work everywhere (we only raised input font-size; the
viewport meta tag is untouched and `user-scalable` is not disabled).

### 3. Drawer height

Open each drawer and confirm the header (with its action buttons) is visible and
the body scrolls within the visible area — with the Safari toolbars **shown**,
not just after they retract:

- [ ] Entry drawer (new + edit) — Save (✓) and Close (✕) always reachable
- [ ] Project drawer
- [ ] Client drawer
- [ ] Tag drawer
- [ ] Delete-confirm drawer — Delete and Close always reachable
- [ ] Scroll up/down inside a tall drawer; the header stays pinned
- [ ] Rotate to landscape (short viewport): the drawer still fits

## Regression baseline

Before shipping a mobile-affecting change, re-run:

```sh
cd e2e && npm test -- --project=mobile-safari   # automated layer
```

and walk the three manual sections above on a real iPhone. The fixes these
cover landed in:

- Settings mobile NavLink — `fix(app): expose Settings as a mobile NavLink …`
- Settings mobile layout — `fix(app): stack Settings cards vertically on mobile …`
- Input font-size — `fix(app): bump input font-size to 16px on touch devices …`
- Drawer height — `fix(app): size drawers with dvh …`

If a future XMLUI upgrade changes drawer portaling, input rendering, or NavPanel
behaviour, treat all three sections as required re-tests.
