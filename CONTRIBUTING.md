# Contributing to Animo

Thanks for your interest. Animo is currently in a **private preview**
phase — the repo will be made public soon, and broader community
contribution is welcome at that point. Until then, this document
captures the conventions I already follow internally so the public
opening is a smooth transition.

## Status

- **Repo visibility:** private (going public — see project board)
- **Stability:** alpha; breaking changes can happen on any release
- **Issue tracking:** GitHub Issues
- **Discussion:** open an issue with the `discussion` label

## Reporting bugs

Open a GitHub Issue using the **Bug report** template (when public).
Until then, include:

- Animo version (footer of the web app, or `Animo > About` in the desktop app)
- Platform (macOS / Linux / Windows + version)
- Reproduction steps
- Expected vs. actual behaviour
- Relevant logs (`~/Library/Application Support/animo/` on macOS,
  XDG equivalent on Linux, `%APPDATA%\animo\` on Windows)

## Requesting features

Open a GitHub Issue using the **Feature request** template.
Describe the user-facing problem before proposing a solution.

## Development setup

### Prerequisites

- Node.js 20+ (for `web/` and tooling)
- Rust toolchain (stable, for `api/` and `desktop/`)
- macOS / Linux / Windows — all platforms supported

### Layout

```text
animo/
├── web/         # XMLUI SPA (Vite + XMLUI standalone)
├── api/         # Rust HTTP API (axum + SQLite)
├── desktop/    # Tauri 2.x shell wrapping the web build
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
npm run dev          # API + Web dev servers concurrently
npm run dev:demo     # Web only, with bundled demo data (no API)
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
