# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- feat(download): implement download grid for latest release artifacts and sync script (7ea27f5)
- feat(download): enhance DownloadGrid styling and add platform icons (0913447)
- feat: add animo-blocks extension with shared components (2390850)

### Fixed

- fix(release): update macOS version from 13 to 14 for compatibility (c041479)

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

[Unreleased]: https://github.com/captaaint/animo/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/captaaint/animo/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/captaaint/animo/releases/tag/v0.1.0
