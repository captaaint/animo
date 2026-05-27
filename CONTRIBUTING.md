# Contributing to Animo

Thanks for your interest in Animo. This document captures the project
conventions so issues, discussions, and pull requests stay easy to review.

## Status

- **Repo visibility:** public
- **Stability:** alpha; breaking changes can happen on any release
- **Product focus:** desktop app first; mobile apps and on-premise web app
  packaging are planned
- **Issue tracking:** GitHub Issues
- **Discussion:** open an issue with the `discussion` label

## Reporting bugs

Open a GitHub Issue using the **Bug report** template. Include:

- Animo version (Settings, the download filename, or the issue template field)
- Platform (macOS / Linux / Windows + version)
- Reproduction steps
- Expected vs. actual behaviour
- Relevant logs from launching the app binary in a terminal; see
  `docs/install-*.md` troubleshooting sections

## Requesting features

Open a GitHub Issue using the **Feature request** template.
Describe the user-facing problem before proposing a solution.

## Development setup

### Prerequisites

- Node.js 20+ (for `app/`, `website/`, and tooling)
- Rust toolchain (stable, for `api/` and `desktop/`)
- macOS / Linux / Windows — all platforms supported

### Layout

```text
animo/
├── app/         # XMLUI app (Vite + XMLUI standalone)
├── extensions/  # shared XMLUI extension package(s)
├── website/     # marketing/download site
├── demo/        # static demo build wrapper
├── api/         # Rust HTTP API (axum + SQLite)
├── desktop/     # Tauri 2.x shell wrapping the app build
├── e2e/        # Playwright end-to-end tests
└── scripts/    # release & maintenance scripts
```

### First-time setup

```bash
./scripts/install-hooks.sh   # enable in-tree git hooks (cargo fmt + secret scan on commit)
```

This points `core.hooksPath` at `.githooks/` so the versioned `pre-commit`
hook runs locally. It's idempotent — re-running is safe.

### Running locally

```bash
npm run dev          # API + app dev servers concurrently
npm run dev:demo     # API + app dev servers against demo.db
npm run app:demo     # app dev server with bundled demo data (no API)
npm run tauri:dev    # Desktop shell (Tauri webview)
```

### Running tests

```bash
cd api && cargo test
cd e2e && npm test
```

## Pull request flow

1. **Branch from `main`** with a topical name (`feat/...`, `fix/...`, `docs/...`).
2. **Keep PRs focused** — one concern per PR. Smaller PRs are easier to review.
3. **Conventional Commits** in commit messages: `feat:`, `fix:`, `chore:`,
   `docs:`, `refactor:`, `perf:`, `test:`. The first line is the changelog
   entry seed.
4. **Update `CHANGELOG.md`** under `[Unreleased]` for any user-facing change.
   The release script enforces a section per version; if your change is
   user-invisible (test, internal refactor, doc-only), skip the entry.
5. **Add tests** for behaviour changes. I don't enforce coverage thresholds,
   but a bug fix without a regression test is rare to land.
6. **CI must pass**: typecheck, `cargo clippy`, smoke tests.
7. **Squash on merge** unless the history is intentionally structured.

## XMLUI conventions

The web app is built with [XMLUI](https://xmlui.org). When touching `.xmlui` files:

- **No `testId` props** in new markup — locate via roles/text/labels in tests
- **Minimal markup** — let theme + layout engine do the work, don't inline styles
- **Theme-first** — use semantic tokens (`$textColor-secondary`, `$borderColor`)
  rather than hardcoded surface colors that don't adapt to dark tone
- **Cite docs** when picking non-obvious component patterns:
  `https://www.xmlui.org/docs/reference/components/<Name>`
- **No raw browser JS** in event handlers (no `setTimeout`, `fetch` outside
  `DataSource`, no `async/await`) — stay within XMLUI abstractions

## Mobile web UX

The web UI ships to phones, where iOS Safari has its own quirks. Before changing
inputs, drawers, navigation, or the viewport meta, read
[docs/mobile-ux.md](docs/mobile-ux.md) — it documents the mobile fixes and the
do/don't guidelines (≥16px inputs, `dvh`-sized drawers, no `user-scalable=no`,
`Viewport`-based responsive `when`). Test mobile changes with the
`mobile-safari` Playwright project and the manual checklist in
[docs/mobile-testing.md](docs/mobile-testing.md).

## Coding style

- **Rust** (`api/`, `desktop/`): `cargo fmt`, `cargo clippy -- -D warnings`
- **TypeScript / JS**: 2-space indent, single quotes, no semicolons in `.xs`
- **XMLUI**: attributes on separate lines for multi-prop components; expression
  braces `{...}` for any non-literal value

## Releases

Releases are tagged `vN.N.N` and follow Semantic Versioning. The release flow
is documented in `scripts/bump.sh` — operators run it with either an explicit
`N.N.N` target or a `patch` / `minor` / `major` keyword (resolved against the
current root `package.json`), and the script handles version sync + atomic
push + CI dispatch.

## Code of Conduct

Be respectful, assume good faith, and keep discussions on-topic. Personal
attacks, harassment, or discriminatory language are not tolerated — issues
or PRs containing such content will be closed without merge.

## License

By contributing, you agree that your contributions will be licensed under
the project's MIT License (see `LICENSE`).
