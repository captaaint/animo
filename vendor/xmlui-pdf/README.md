# xmlui-pdf (vendored)

Local fork of the [`xmlui-pdf`](https://github.com/xmlui-org/xmlui/tree/main/packages/xmlui-pdf)
extension, copied from `xmlui-org/xmlui` at commit `d7290f62` (package version 0.1.14).

## Why

The npm release `xmlui-pdf@0.1.13` was built against an older xmlui API and imports
the `d` metadata helper, which `xmlui` no longer exports (removed upstream in #3546).
Any `xmlui` ≥ 0.12.30 therefore fails to bundle it. The fix is merged upstream
(xmlui-org/xmlui#3939) and versioned as 0.1.14, but that version has not been
published to npm yet. Building the package from source here unblocks the xmlui upgrade.

## What changed compared to upstream

- `package.json`: private workspace package; `exports` point at the built `dist/`
  (same shape as the published package), so `import xmluiPdf from "xmlui-pdf"`
  keeps working unchanged in `app/`.
- Dropped the upstream demo app, docs, unit tests and `Pdf.spec.ts` (they depend on
  the xmlui monorepo's test infrastructure).
- `src/` and `vite.config-overrides.ts` are unmodified.

Built by `npm run build:extension` (turbo runs it before the app builds, like `animo-blocks`).

It lives in `vendor/` (listed explicitly in the root `workspaces`) rather than
`extensions/*` on purpose: `xmlui ssg` aliases every package found under a `<dir>/*`
workspace pattern to its `src/index.tsx` for the SSR build, and this package's source
loads pdf.js eagerly, which crashes in Node (`DOMMatrix is not defined`). Kept out of
the pattern, SSR resolves it through `exports` to the built `dist/`, exactly like the
npm package.

## Going back to npm

Once `xmlui-pdf` ≥ 0.1.14 is on npm: delete this directory, remove `vendor/xmlui-pdf` from
the root `workspaces`, set `"xmlui-pdf"` in
`app/package.json` to the npm version, and run `npm install`.
