# Privacy

Animo is a local-first time tracker. By default the app keeps your data on
your machine. The two paths that send anything off-device are listed
below; both are explicit and user-initiated, and the app ships with no
automatic telemetry or analytics.

Last updated: 2026-05-26.

## In-app feedback

The **Help & feedback** section in Settings opens a form that submits a
structured message to a developer-owned endpoint
(`https://getanimo.app/api/feedback`). Each submission creates a GitHub
issue in the public Animo repository so it can be triaged in the open.

### What you always send

- The feedback category (`bug`, `feature`, or `question`).
- The title and description you typed.

### What is optional and off by default

- Your contact email — only included if you fill in the optional email
  field. Leave it blank to stay anonymous.
- Diagnostics — only attached when you flip the **Attach diagnostics**
  switch *for that submission*. The exact payload is shown in the modal
  before you send.

The diagnostics payload, when included, contains:

- App version (`__ANIMO_VERSION__`).
- Operating system, OS version, and platform architecture.
- System locale.
- Whether the request originated from the Tauri desktop shell.
- The last few KB of the in-memory log tail.

Diagnostics never include client/project/tag names, time entries, or any
content from your tracked work.

### Where the data lives

- Submitted feedback becomes a public GitHub issue. Anyone with a GitHub
  account can read it.
- Unsent drafts and your feedback enable/disable preference are stored in
  the browser's `localStorage`. They never leave your device unless you
  press **Send feedback**.
- Spam protection is handled by Cloudflare Turnstile. Turnstile receives
  the verification token only — none of the feedback content.

### Disabling and deletion

- Settings → Help & feedback exposes an **Allow sending feedback to
  getanimo.app** toggle. When off, the Send button is disabled and no
  feedback can leave the app.
- To delete a submitted issue or remove personal data, email
  [privacy@getanimo.app](mailto:privacy@getanimo.app) with the issue URL
  or a description of what to remove.

## Desktop auto-updates

The Tauri desktop build periodically checks
`https://getanimo.app/updates/latest.json` for newer releases. The
network request includes only the standard HTTP headers (e.g. `User-Agent`
and `Accept`) — no identifiers and no telemetry payload.

- You can disable the daily background check from Settings → Updates.
- Manual **Check for updates** in Settings makes the same request on
  demand.
- Update bundles are signed; the desktop shell verifies the ed25519
  signature against an embedded public key before installing anything.

## Contact

Questions, deletion requests, or anything else privacy-related:
[privacy@getanimo.app](mailto:privacy@getanimo.app).
