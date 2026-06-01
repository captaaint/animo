# Mobile web UX — fixes & maintenance guidelines

Animo's web UI is responsive and is used from phones, where iOS Safari exercises
behaviours desktop Chrome never does. This page records the mobile UX fixes that
landed, the rationale behind each, and the guidelines to keep future work
mobile-friendly. For how to *test* mobile UX, see [mobile-testing.md](mobile-testing.md).

## The fixes

| # | Problem (mobile) | Fix | Where | Commit |
| --- | --- | --- | --- | --- |
| 1 | Settings was unreachable: the footer **DropdownMenu** opened *behind* the nav drawer (both portal to `body` at `z-index: auto`; the drawer mounts later and paints on top). | Expose Settings as a first-class **NavLink** on mobile (`appVp.value.isMobile`); keep the dropdown on desktop. | `app/src/Main.xmlui` | `9d01906` |
| 2 | Settings cards sat side-by-side and overflowed horizontally on a phone. | Outer container switches to **vertical** orientation on mobile (`Stack orientation=…`), so cards stack Local profile → Profile → Appearance; `height="*"` fills drop to `auto` on mobile. | `app/src/components/SettingsScreen.xmlui` | `fec428e` |
| 3 | Focusing any input **auto-zoomed** the page (theme base font is 13px; iOS zooms when a focused control is < 16px). | Suppress the focus auto-zoom with **`maximum-scale=1`** in the viewport meta instead of enlarging the font, so inputs stay at 13px and match desktop. iOS 10+ still allows manual pinch-zoom. (Superseded the earlier 16px bump from `d26c04b`.) | `app/index.html` viewport `<meta>` | — |
| 4 | Bottom drawers were sized in `vh`, which on iOS is the *large* viewport — the pinned header (with Save/Delete) could be pushed off-screen behind the browser chrome. | Size drawers in **`dvh`**; set `height-Drawer: auto` + `maxHeight-Drawer: 92dvh` once in the theme so all (and future) drawers inherit it; EntryDrawer keeps an explicit `95dvh`. | `app/src/themes/tracker-theme.ts`, the 5 `*Drawer.xmlui` | `24dc214` |
| 5 | Viewport meta tuning to complement the above. | Add `interactive-widget=resizes-content` (keyboard shrinks the dvh drawers so a focused field stays above it); keep `width=device-width, initial-scale=1` with **no** `user-scalable=no`. | `app/index.html` meta | `a85761a` |

Automated + manual mobile test suite: `4896678`, `a85761a` (see
[mobile-testing.md](mobile-testing.md)).

## Maintenance guidelines

Follow these when building or changing mobile-facing UI:

### Responsive layout
- Detect mobile with the headless **`Viewport`** probe: declare `<Viewport id="vp" />`
  and branch on `vp.value.isMobile` in `when` expressions (it is true when the
  viewport width is **≤ 640px**). The app-level probe is `appVp` in `Main.xmlui`.
- Prefer toggling layout (`orientation`, `when`) over duplicating large blocks of
  markup, so desktop and mobile stay in sync.

### Inputs (no auto-zoom)
- Inputs render at the theme base size (**13px**) on touch too, so mobile text
  matches desktop. Don't reintroduce a mobile-only font bump.
- iOS Safari's focus auto-zoom is blocked by **`maximum-scale=1`** in the
  viewport meta (`app/index.html`), not by font-size. iOS 10+ ignores
  `maximum-scale` for *manual* pinch gestures, so pinch-zoom-to-read stays
  available — only the automatic focus-zoom is stopped. Don't remove
  `maximum-scale=1`, and don't add `user-scalable=no` (that disables manual
  zoom entirely and breaks accessibility).

### Drawers
- Don't set drawer height in `vh`. The theme already caps every Drawer at
  `92dvh` (`height-Drawer: auto`) — new drawers inherit it; only override for a
  deliberately taller sheet, and then use **`dvh`** (e.g. `95dvh`).
- Put primary actions (save/confirm/close) in the Drawer's **`headerTemplate`** —
  it's a sticky header, so the buttons stay on screen while the body scrolls.

### Viewport meta (`app/index.html`)
- Keep `width=device-width, initial-scale=1, maximum-scale=1`. The
  `maximum-scale=1` blocks iOS Safari's focus auto-zoom while iOS 10+ still
  allows manual pinch-zoom; don't add `user-scalable=no` (that fully disables
  manual zoom and breaks accessibility).
- Don't add `viewport-fit=cover` without adding `env(safe-area-inset-*)` padding
  on every edge surface — otherwise bottom-drawer content slides under the iOS
  home indicator.

### Theme considerations
- The base `fontSize` is `13px` (`tracker-theme.ts`) and applies on mobile too;
  inputs are not enlarged on touch, so mobile and desktop density match.
- Drawer sizing lives in the theme (`height-Drawer`, `maxHeight-Drawer`) — change
  it there, not per-component, so the constraint stays global.

## XMLUI version compatibility

- Pinned to **xmlui `0.12.27`** (`app/package.json`).
- The Settings fix works around an XMLUI behaviour: a `DropdownMenu` popover and
  the mobile `NavPanel` drawer both portal to `body` at `z-index: auto`, so a
  dropdown placed inside the nav footer renders behind the drawer on mobile. If a
  future XMLUI upgrade changes drawer/popover portaling or stacking, re-verify
  Settings navigation and the drawer header pinning.
- No upstream XMLUI changes were required — every fix is in app code/theme/CSS.

## Testing

Before shipping a mobile-affecting change, run the automated mobile suite and
walk the manual checklist in [mobile-testing.md](mobile-testing.md):

```sh
cd e2e && npm test -- --project=mobile-safari
```
