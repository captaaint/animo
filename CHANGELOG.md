# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- feat(app): show feedback form in demo mode (2728659)

### Fixed

- fix(desktop): never seed the installed app DB during dev runs (44e356b)

## [0.2.8] - 2026-05-27

### Fixed

- fix(app): use whole-page scroll so the desktop list renders correctly

## [0.2.7] - 2026-05-27

### Added

- feat(app): drop contact-email field from feedback form (5d68173)

### Fixed

- fix(app): clip WeekCalendar to its card's rounded corners (955e985)
- fix(app): align entry modal columns to the same bottom edge (bd45733)

## [0.2.6] - 2026-05-27

### Fixed

- Fixed feedback submission routing, updater status messaging, and stale website release metadata.
- fix(app): refresh updater and website release metadata handling (e2b19ea)

## [0.2.5] - 2026-05-27

### Fixed

- fix(desktop): harden feedback diagnostics and updater checks (3105808)

## [0.2.4] - 2026-05-27

### Fixed

- fix(app): expose Settings as a mobile NavLink (dropdown hid behind nav drawer) (9d01906)
- fix(app): stack Settings cards vertically on mobile so they don't overflow (fec428e)
- fix(app): bump input font-size to 16px on touch devices to stop iOS auto-zoom (d26c04b)
- fix(app): size drawers with dvh so mobile browser chrome can't hide the header (24dc214)

## [0.2.3] - 2026-05-27

### Fixed

- fix(desktop): configure updater signing from release secrets (2a8b7fc)

## [0.2.2] - 2026-05-26

### Added

- feat(app): redesign settings, integrate invisible Turnstile, extract import page (5d1ca2c)

### Fixed

- fix(app): inject app version in dev mode (66b7a19)
- fix(desktop): grant updater/process capabilities and register process plugin (d636042)
- fix(desktop): embed actual updater pubkey to unblock release signing (1200412)

## [0.2.1] - 2026-05-26

### Added

- feat(app): add diagnostics collection helper (2340bd1)
- feat(app): add feedback submission helper (3c3fd25)
- feat(app): add feedback modal (d6efad8)
- feat(desktop): configure updater plugin (cbad650)
- feat(app): add Help & feedback section to Settings (cfe0253)
- feat(desktop): host Tauri update manifest at /updates/latest.json (5309775)
- feat(app): add Tauri updater check helper with retry (bcfb95a)
- feat(app): add Updates section to Settings with auto-check toggle (0f3b4bd)

### Fixed

- fix(desktop): read updater public key from env (45d2048)

## [0.2.0] - 2026-05-26

### Added

- feat(api): add CSV export endpoint and import parser infrastructure (c928dfc)
- feat(api): add CSV export endpoint and import parser infrastructure (eab3284)
- feat(desktop): add system tray with stopwatch controls (a03c29d)
- feat(desktop): add Cmd/Ctrl+Shift+T global hotkey for stopwatch toggle (55d3daa)
- feat(api): add CSV import preview and commit endpoints (b727d73)
- feat(app): bridge stopwatch state with Tauri tray and global hotkey (3d67bfc)
- feat(api): add XLSX import preview and commit endpoints (a491bb2)
- feat(app): add CSV/XLSX import UI to Settings (2427b24)
- feat(app): add themed empty project state (adc825e)
- feat(desktop): native notifications on stopwatch transitions (dbef25f)
- feat(app): illustrated empty state for time-entry lists (2a9d71a)
- feat(app): illustrated empty state for time-entry lists (9f24568)

### Fixed

- fix(api): drop needless borrows in XLSX summary writes (f93a503)

## [0.1.3] - 2026-05-23

### Fixed

- Windows desktop release build: app npm scripts now use `cross-env` so
  the `VITE_USED_COMPONENTS_*` env-var prefixes work under cmd.exe, not
  just POSIX shells. v0.1.2's Windows MSI was missing for this reason.
- Release workflow's `Install workspace dependencies` step now pins
  `shell: bash` so `rm -rf node_modules package-lock.json` runs under
  Git Bash on Windows runners instead of PowerShell.
- `scripts/bump.sh` points at `app/package.json` after the `web/` → `app/`
  directory rename, so version bumps no longer ENOENT on the SPA manifest.

### Changed

- Release workflow's per-platform desktop/api jobs now short-circuit at
  a gate step when the expected artifact is already attached to the
  release — re-dispatching after a partial failure only rebuilds the
  missing platforms.

## [0.1.2] - 2026-05-23

### Added

- Drawer-based mobile editor for time entries (EntryDrawer) — bottom-sheet
  with sticky header, Time picker with the new Lucide timer icon for
  Duration, and full-width Save/Cancel/Delete actions. (a596d38)
- Reusable DeleteConfirmModal (desktop) and DeleteConfirmDrawer (mobile)
  components with an optional entity-detail card. (a596d38)
- Unified card-based modal/drawer layout for Tag/Project/Client editors
  with a 16-color palette grid (Sage teal default, named swatches with
  hex preview). (a596d38)
- Cross-tree TimerBar control via shared timerBus helpers. (fc9f630)
- Download grid on the marketing site. (#21)

### Changed

- Viewport-aware modal vs drawer rendering across Tags / Projects /
  Clients / Reports / Calendar — the same breakpoint now drives both the
  layout switch and the editor surface, so the tablet zone no longer
  renders inconsistently. (a596d38)
- Tag / Project / Client delete flow goes through the shared
  DeleteConfirmModal / DeleteConfirmDrawer instead of the legacy
  `confirmTitle` / `confirmMessage` props on `APICall`. (a596d38)
- TimePicker accepts `iconName="timer"` and stretches to fill its
  container when `width="*"`. (a596d38)
- DatePicker now matches the chevron-from-right spacing used by Select
  fields when `width="100%"`. (a596d38)

### Fixed

- Tag list rows truncate long names with ellipsis on mobile. (a596d38)
- Color palette grid stays on a single row on every viewport width.
  (a596d38)
- macOS version markers in release docs updated for compatibility. (#20)

## [0.1.1] - 2026-05-21

### Added

- feat(changelog): automate CHANGELOG updates on dev branch pushes (6f94db6)

## [0.1.0] - 2026-05-20

Initial private preview release. Self-contained on-prem time tracker — XMLUI web SPA,
`animo-api` Rust backend, and Tauri desktop shell.

### Added

#### Web application (XMLUI SPA)
- Calendar view with week-based time-entry editing (`WeekCalendar`).
- List view: per-day grouped entries with description/project/time/duration/billable columns.
- Reports view: date-range filters, project/tag multi-select filters, KPI cards
  (total hours, billable hours, amount, average daily hours), pie-chart breakdown by
  billable / project / client / tag.
- PDF report export with grouped layout, in-app preview modal, and download.
- Projects / Clients / Tags management screens with color indicators and AutoComplete pickers.
- Sign-in / Register / Settings screens with theme tone switch and account info.
- Sign-out confirmation modal.
- Responsive design with separate desktop and mobile layouts across all screens.
- Custom `tracker-theme` (Animo brand palette: Sage Teal primary, Warm Amber warn,
  Soft Coral danger) with light + dark tone support.
- Demo mode (`VITE_ANIMO_DEMO=true`) using MSW handlers against bundled demo data.

#### Backend (`animo-api`)
- Axum-based REST API for projects, clients, tags, and time entries.
- SQLite storage with bundled migrations.
- JWT-based authentication with per-install secret generation (no baked-in defaults).
- Report summary endpoint with date-range and filter support.

#### Desktop (Tauri)
- Tauri 2.x shell wrapping the web SPA with native window controls.
- Per-install configuration directory under the OS-standard application support path.
- macOS arm64 build with installation guide covering Gatekeeper handling.

#### Tooling and infrastructure
- Netlify configuration for SSG demo deployment with SPA fallback.
- E2E test harness with Playwright + trace tooling under `e2e/`.
- Compact duration formatting and shared date helpers in `Globals.xs`.
- Pre-commit hook for local `cargo fmt` + secret pattern checks (`scripts/install-hooks.sh`).

### Changed
- Repository renamed from `time-tracking-app` to `animo`; install / docs paths updated accordingly.
- Dark tone: card and modal surfaces use a neutral palette instead of the warm `#2C2925`.
- Settings screen: removed item borders, section dividers under titles, theme icon swapped to `palette`.
- List and Reports tables: column fonts unified to default `<Text>` (no more secondary/bold mix); description and project columns share proportional star-widths.
- Sign-out menu item: icon + text both use danger color.
- All `&amp;&amp;` HTML-encoded operators in `.xmlui` files replaced with literal `&&` inside expressions.

### Fixed
- Avatar in Settings now has a visible border in dark tone (was blending into the card surface).
- Card hover effect (background flash on dark mode) removed across the app.
- Edit button in Projects/Clients/Tags tables now shows a hover effect (was missing while delete had one).
- WeekCalendar toolbar dark-mode background switched from warm `#2C2925` to neutral `#1E2328` to match the rest of the calendar.
- Dropdown menus and Select/AutoComplete/DatePicker menus have visible borders in dark mode.

### Notes
- Internal preview — not yet publicly released.
- No code signing yet; macOS install requires manual Gatekeeper approval.
- Single-user only at this stage; multi-tenant work deferred to a later release.

[Unreleased]: https://github.com/captaaint/animo/compare/v0.2.8...HEAD
[0.2.8]: https://github.com/captaaint/animo/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/captaaint/animo/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/captaaint/animo/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/captaaint/animo/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/captaaint/animo/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/captaaint/animo/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/captaaint/animo/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/captaaint/animo/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/captaaint/animo/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/captaaint/animo/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/captaaint/animo/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/captaaint/animo/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/captaaint/animo/releases/tag/v0.1.0
