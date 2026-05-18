# Animo

> A self-hosted, single-user time-tracking app inspired by [Kimai](https://www.kimai.org/) — XMLUI frontend, Rust + axum backend, SQLite storage, optional Tauri desktop shell. Domain: [getanimo.app](https://getanimo.app).

Track work against projects and clients, either by typing start/end times manually or by running the live header stopwatch. View entries on a weekly calendar grid or as a list grouped by day, slice them with project / tag / date-range filters, and export a styled PDF report.

---

## Stack

| Layer       | Choice                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Frontend    | [XMLUI](https://docs.xmlui.org) 0.12 + custom React extensions in [`web/`](web/)                        |
| Backend     | Rust + [axum](https://docs.rs/axum/) + [sqlx](https://docs.rs/sqlx/) in [`api/`](api/)                  |
| Database    | SQLite (single file, embedded migrations)                                                               |
| Auth        | HttpOnly cookie session, Argon2id password hash, SHA-256 token hash                                     |
| PDF export  | Client-side via [pdfmake](https://pdfmake.github.io/) — [`web/src/helpers/reportPdf.ts`](web/src/helpers/reportPdf.ts) |
| Desktop     | Optional Tauri 2 shell in [`desktop/`](desktop/) — embeds the axum server in-process                    |
| E2E tests   | Playwright in [`e2e/`](e2e/)                                                                            |

---

## Quick start (browser dev mode)

```bash
# 1. install JS deps for the workspace (skips scripts to bypass an upstream xmlui-pdf postinstall quirk)
npm install --ignore-scripts
cd web && npm install --ignore-scripts && cd ..

# 2. boot the API and the Vite dev server in parallel
npm run dev
```

This starts:

- `cargo run -p animo-api` on `http://127.0.0.1:8080`
- `xmlui start` on `http://localhost:5173`

Open the Vite URL, register a new account, and you're in.

### Optional helpers

```bash
npm run api         # just the Rust API
npm run web         # just the XMLUI dev server
npm run seed:demo   # populate a demo.db with a sample user + ~1 month of entries
npm run dev:demo    # dev mode against demo.db (login: demo@example.com / demo1234)
```

---

## Public demo (Netlify)

The frontend can be built as a fully static, no-backend demo — handy for
sharing a working link without exposing the Rust API.

```bash
npm run build:demo      # builds web/dist/ with the demo flag baked in
npm run preview:demo    # build + preview locally on http://localhost:4173
```

What that gives you:

- The bundle ships a hand-written `/api/*` fetch handler
  ([`web/src/demoApi.ts`](web/src/demoApi.ts)) that monkey-patches
  `window.fetch` before XMLUI mounts. Every request that would normally
  hit the Rust backend is served in-browser instead.
- Authentication is bypassed — `GET /auth/me` always returns a "Demo User",
  so visitors land directly on the Calendar.
- Seed data covers the past four work-weeks (~50 time entries across
  2 clients × 2 projects × 5 tags), regenerated relative to "today" on
  first launch.
- All CRUD persists in `localStorage` (key `tt-demo-state-v1`). Clearing
  the site's storage resets the demo to its initial seed.

### Deploying to Netlify

The repo ships a `netlify.toml` that points Netlify at `web/` as the base
directory and runs `npm run build:demo`. Once the repository is connected
to Netlify, the default settings produce a working deployment — nothing
else to configure.

`NPM_FLAGS=--ignore-scripts` is set in `netlify.toml` to skip a broken
upstream `xmlui-pdf` postinstall step; the package still works for the
demo's use case.

---

## Desktop app (Tauri)

```bash
# one-time: install the Tauri CLI as a workspace devDependency
npm install --ignore-scripts

# launch the desktop shell — boots the API in-process and opens the webview
npm run tauri:dev
```

A bundled installer (DMG / MSI / DEB / AppImage) is produced by:

```bash
npm run tauri:build
```

Notes:

- The desktop shell stores its SQLite DB under the platform per-user data dir
  (macOS: `~/Library/Application Support/app.getanimo.timetracker/data.db`).
- On first launch in a dev build, the shell seeds that DB from `api/data.db`
  if it exists — handy when porting an existing browser session over.
- The placeholder icon at `desktop/icons/icon.png` is a 32×32 colored square.
  Before publishing a release bundle, replace it with a real logo and run
  `cargo tauri icon path/to/source.png` to generate the rest of the sizes.

---

## Architecture overview

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

The Tauri desktop shell embeds the same axum router in-process: at startup it
binds a TCP listener on `127.0.0.1:0`, hands the resolved port back to the
webview via the `api_base` invoke command, and the XMLUI frontend uses that
URL as its `apiBase` global. See [`desktop/src/lib.rs`](desktop/src/lib.rs).

---

## Repository layout

```text
animo/
├── api/             Rust crate — axum router, sqlx pool, migrations
│   ├── src/
│   │   ├── lib.rs              build_state, build_app, bind, run_server
│   │   ├── main.rs             standalone binary entry
│   │   ├── config.rs           env-driven and Tauri desktop config flavors
│   │   ├── auth/               cookie-based session + Argon2 password hashing
│   │   ├── {clients,projects,tags,entries,reports}.rs   route handlers
│   │   ├── state.rs            shared AppState (pool + config)
│   │   └── error.rs            unified AppError → IntoResponse
│   ├── migrations/             *.sql, embedded at compile time
│   └── assets/fonts/           DejaVu Sans for the server-side genpdf path
├── web/             XMLUI frontend
│   ├── index.ts                bootstrap (resolves apiBase, calls startApp)
│   ├── src/
│   │   ├── Main.xmlui          App shell, NavPanel, Pages
│   │   ├── components/         per-screen XMLUI markup
│   │   ├── extensions/         AuthGate, WeekCalendar, charts, …
│   │   └── helpers/            reportPdf (pdfmake), timerBus
│   └── public/                 static assets served by Vite/build
├── desktop/         Tauri 2 shell — embeds the axum server
│   ├── src/lib.rs              setup hook: bootstraps DB, binds listener, hands port to webview
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── icons/                  placeholder PNG (replace before release)
├── e2e/             Playwright tests (browser dev mode)
│   ├── playwright.config.ts    spins up api + web before running specs
│   └── tests/*.spec.ts
├── Cargo.toml       workspace root (members = api, desktop)
└── package.json     npm scripts that tie everything together
```

---

## Auth flow

1. The XMLUI frontend mounts the [`AuthGate`](web/src/extensions/AuthGate/) extension. On boot it calls `GET /api/auth/me`. If the session cookie is present and valid, the user goes straight to the Calendar; otherwise to `/login`.
2. On register/login, the API issues a fresh 256-bit random token, stores only its SHA-256 hash in the `sessions` table, and sets the plaintext as an `HttpOnly` cookie (`tt_session`).
3. Every protected handler depends on the `AuthUser` extractor, which reads the cookie, looks up the session, validates idle/absolute expiry, and slides the idle window forward.
4. Logout revokes the row server-side and clears the cookie client-side.

Cookie attributes vary by deployment:

| Mode                       | SameSite | Secure | Why                                                          |
| -------------------------- | -------- | ------ | ------------------------------------------------------------ |
| Browser dev (`npm run dev`)| `None`   | `true` | Vite (5173) + API (8080) are cross-origin; `None` is required and the loopback exception lets `Secure` work over plain HTTP. |
| Desktop (Tauri webview)    | `Lax`    | `false`| Webview and API share the `localhost` site so `Lax` suffices; WKWebView silently rejects `Secure` cookies over `http://localhost`, hence Secure is off. |

The mapping lives in [`api/src/config.rs`](api/src/config.rs) (`Config::from_env` vs `Config::for_desktop`).

---

## Running the tests

```bash
npm run e2e:install   # one-time: install the e2e package + browser
npm run e2e           # run the full Playwright suite
npm run e2e:ui        # open the Playwright UI runner
```

Playwright boots its own `api` and `web` servers (see
[`e2e/playwright.config.ts`](e2e/playwright.config.ts)), so the suite is
self-contained.

Unit tests live next to the code they cover; run them via cargo:

```bash
cargo test --workspace
```

---

## Configuration reference

The API reads its config from environment variables — see
[`api/.env.example`](api/.env.example):

| Variable        | Default                              | Notes                                                  |
| --------------- | ------------------------------------ | ------------------------------------------------------ |
| `BIND_ADDR`     | `127.0.0.1:8080`                     | API listen address.                                    |
| `DATABASE_URL`  | `sqlite:data.db?mode=rwc`            | sqlx connection string.                                |
| `JWT_SECRET`    | `dev-secret-change-me` (dev default) | Override in any non-dev deployment.                    |
| `CORS_ORIGINS`  | `http://localhost:5173..5176`        | Comma-separated allow-list for the Vite dev ports.     |
| `RUST_LOG`      | `animo_api=info`                     | Standard `tracing-subscriber` filter.                  |

The Tauri shell ignores most of these and builds its `Config` programmatically
via `Config::for_desktop(app_data_dir)`.

---

## License

[MIT](LICENSE) © Tamas Kapitany
