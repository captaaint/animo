# Animo

> A self-hosted, single-user time tracker.
> XMLUI frontend, Rust + axum backend, SQLite storage, Tauri desktop shell.
> Your data stays on your machine — no cloud, no telemetry, no accounts to manage.

[![latest release](https://img.shields.io/github/v/release/captaaint/animo?include_prereleases&sort=semver)](https://github.com/captaaint/animo/releases/latest)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![demo](https://img.shields.io/badge/demo-getanimo.app-blue)](https://getanimo.app)

Track work against projects and clients, either by typing start/end times
or by running the live header stopwatch. View entries on a weekly calendar
grid or as a list grouped by day, slice them with project / client / tag /
date-range filters, and export a styled PDF report.

→ **Live demo:** <https://getanimo.app>
→ **Releases:** <https://github.com/captaaint/animo/releases>

---

## Install

### macOS / Linux

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh
```

### Windows (PowerShell)

```powershell
irm https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex
```

The install scripts pick the right bundle for your platform, verify SHA256
against `SHA256SUMS.txt`, and install in one step. For manual installs,
Gatekeeper / SmartScreen handling, and per-platform notes, see:

- [docs/install.md](docs/install.md) — overview and one-liner reference
- [docs/install-macos.md](docs/install-macos.md)
- [docs/install-windows.md](docs/install-windows.md)
- [docs/install-linux.md](docs/install-linux.md)

> The desktop builds are currently unsigned. First-launch warnings
> (macOS Gatekeeper, Windows SmartScreen) are handled in the platform
> docs and are a one-time confirmation.

---

## Stack

| Layer       | Choice                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Frontend    | [XMLUI](https://docs.xmlui.org) 0.12 + custom React extensions in [`web/`](web/)                        |
| Backend     | Rust + [axum](https://docs.rs/axum/) + [sqlx](https://docs.rs/sqlx/) in [`api/`](api/)                  |
| Database    | SQLite (single file, embedded migrations)                                                               |
| Auth        | HttpOnly cookie session, Argon2id password hash, SHA-256 token hash                                     |
| PDF export  | Client-side via [pdfmake](https://pdfmake.github.io/) — [`app/src/helpers/reportPdf.ts`](app/src/helpers/reportPdf.ts) |
| Desktop     | [Tauri 2](https://tauri.app) shell in [`desktop/`](desktop/) — embeds the axum server in-process        |
| E2E tests   | [Playwright](https://playwright.dev/) in [`e2e/`](e2e/)                                                 |

---

## Build from source

### Prerequisites

- Rust stable (`rustup toolchain install stable`)
- Node.js 20+
- Platform Tauri deps (Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`,
  `librsvg2-dev`, `libxdo-dev`; macOS and Windows pick them up via Xcode /
  Visual Studio Build Tools).

### Browser dev mode

```sh
npm install --ignore-scripts
cd app && npm install --ignore-scripts && cd ..

npm run dev          # boots animo-api on :8080 and the XMLUI dev server on :5173
```

Open the Vite URL. On first run you'll see the onboarding screen — pick a
display name and username and you're in (the profile lives in the local DB,
no email or password). Useful extras:

```sh
npm run api          # just the Rust API
npm run web          # just the XMLUI dev server
npm run seed:demo    # populate demo.db with the "Demo User" (@demo) profile
npm run dev:demo     # dev mode against demo.db
```

### Tauri desktop

```sh
npm run tauri:dev    # boots the API in-process and opens the webview
npm run tauri:dev:demo # same desktop shell, backed by demo.db
npm run tauri:build  # produces a DMG / MSI / DEB / AppImage in desktop/target/release/bundle/
```

### Public demo bundle (no backend, MSW-mocked)

```sh
npm run build:demo       # builds app/dist/ with VITE_ANIMO_DEMO=true baked in
npm run preview:demo     # build + preview locally
```

The bundle ships a hand-written `/api/*` fetch handler
([`app/src/demoApi.ts`](app/src/demoApi.ts)) that intercepts `window.fetch`
before XMLUI mounts. Auth is bypassed (always returns "Demo User"), data
covers four work-weeks of seed entries, and all CRUD persists in
`localStorage`. The version stamp on the LoginScreen comes from
`VITE_ANIMO_VERSION` — see [`app/scripts/with-version.mjs`](app/scripts/with-version.mjs).

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (or Tauri webview)                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  XMLUI app                                                     │  │
│  │  • Main.xmlui — App + AuthGate + NavPanel + Pages              │  │
│  │  • DataSource / APICall ──── credentials: 'include' ───────┐   │  │
│  │  • Extensions: AuthGate, WeekCalendar, Stopwatch,          │   │  │
│  │    BarChart, PieChart, KeyListener, Viewport, …            │   │  │
│  └─────────────────────────────────────────────────────────────│───┘  │
│                                                                │      │
│  Set-Cookie: tt_session=<random>; HttpOnly; SameSite=Lax|None; │      │
│              Path=/; Max-Age=30 days                           │      │
└────────────────────────────────────────────────────────────────│──────┘
                                                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Rust axum API                                                       │
│  • /api/auth/{register, login, logout, me}                           │
│  • /api/clients, /api/projects, /api/tags, /api/time-entries (CRUD)  │
│  • /api/reports/summary + /api/reports/export.pdf                    │
│  • CORS layer, TraceLayer                                            │
│  • AuthUser extractor: cookie → sha256 → sessions table → user       │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                          SQLite (data.db)
                  users · sessions · clients · projects ·
                       tags · entry_tags · time_entries
```

The Tauri shell embeds the same axum router in-process. At startup it
binds a TCP listener on `127.0.0.1:0`, hands the resolved port back to
the webview via the `api_base` invoke command, and the XMLUI frontend
uses that URL as its `apiBase` global. See
[`desktop/src/lib.rs`](desktop/src/lib.rs).

---

## Repository layout

```text
animo/
├── api/              Rust crate — axum router, sqlx pool, migrations
├── web/              XMLUI frontend (Vite + custom extensions)
├── desktop/          Tauri 2 shell — embeds animo-api in-process
├── e2e/              Playwright tests
├── docs/             User-facing install + ops docs
├── scripts/          bump.sh, install-hooks.sh
├── .githooks/        pre-commit (cargo fmt + secret scan)
├── .github/          workflows (test, release) + issue / PR templates
├── install.sh        macOS + Linux installer
├── install.ps1       Windows installer
└── netlify.toml      Demo deploy config
```

---

## Releasing

Releases are driven by [`scripts/bump.sh`](scripts/bump.sh), which keeps a
single version in sync across `package.json`, `app/package.json`,
`api/Cargo.toml`, `desktop/Cargo.toml`, and `desktop/tauri.conf.json`,
then commits + tags + pushes + dispatches the release workflow.

The target can be an explicit `N.N.N` version or one of `patch` / `minor` /
`major` — in the latter case the script reads the current root
`package.json` version and computes the next one, printing
`Bump kind: <kind> (X.Y.Z → A.B.C)` before applying anything.

```sh
# Standard release (commit + tag + push + workflow dispatch):
scripts/bump.sh patch          # 0.1.0 → 0.1.1
scripts/bump.sh minor          # 0.1.0 → 0.2.0
scripts/bump.sh major          # 0.1.0 → 1.0.0
scripts/bump.sh 0.2.0          # explicit target

# Local-only dry-run:
scripts/bump.sh patch --no-push
```

The release CI ([`.github/workflows/release.yml`](.github/workflows/release.yml))
verifies the tag and CHANGELOG entry, builds desktop bundles on
linux-amd64 / macos-arm64 / macos-intel / windows-amd64, builds the
headless `animo-api` binary on linux-amd64 / macos-arm64 / windows-amd64,
publishes `SHA256SUMS.txt` covering every asset and the install scripts
themselves, and drafts the GitHub release.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local pre-commit hook
(`cargo fmt` + secret pattern scan) and conventional-commits expectations.

---

## Wishlist

Got a feature you'd like to see, or a workflow Animo doesn't fit yet?
Open an issue and tell me about it:
<https://github.com/captaaint/animo/issues/new?template=feature_request.yml>.

---

## License

[MIT](LICENSE) © 2026 Tamas Kapitany
