# In-App Feedback and Tauri Auto-Update

## Goal

Animo should add two user-facing desktop capabilities that improve the feedback loop and long-term retention:

- In-app feedback submission through a structured form that sends bug reports, feature requests, and questions to a developer-owned HTTP endpoint.
- Desktop auto-update support through Tauri's updater plugin, with signed release artifacts and a custom in-app update UI.

The feedback feature should ship first as version `0.2.0`. The updater infrastructure and UI should follow in later releases, targeting `0.3.0` for the user-facing auto-update experience.

## Background

Animo is a local-first desktop app. Users currently need an external channel to send feedback, and installed desktop builds require manual replacement when a new version is released.

The website already runs on Netlify at `getanimo.app`, so feedback should be implemented as a Netlify Function under the same origin. The function should create GitHub issues using a server-side token so no secret is exposed to the app.

Tauri supports auto-updates through signed release artifacts and an update manifest. The app should use that foundation, but display update status through Animo's own UI rather than Tauri's built-in dialog.

Code signing with Apple Developer ID or Windows EV certificates is not part of this PRD. The updater artifact signatures are still required and separate from OS-level code signing.

## Product Requirements

### 1. Add In-App Feedback UX

Add a feedback flow available from Settings.

Requirements:

- Add a `Help & feedback` area in Settings with a `Send feedback` action.
- Show a feedback modal on desktop.
- Provide a mobile-friendly drawer variant if the app's existing responsive patterns require it.
- Collect feedback category, title, description, optional contact email, and diagnostics opt-in.
- Support the categories `bug`, `feature`, and `question`.
- Require title and description.
- Limit title to 120 characters.
- Limit description to 8000 characters.
- Show clear loading, success, and error states.
- Preserve unsent draft feedback in `localStorage` so the user does not lose typed content after a timeout, close, or retry.
- Hide feedback entry points in demo mode when `VITE_ANIMO_DEMO=true`.

The diagnostics checkbox must default to off.

When diagnostics are enabled, the form must show the exact diagnostics payload before submission. The user should be able to review literally what will be sent.

### 2. Define Feedback Payload

The client should send a structured JSON payload to the feedback endpoint.

Required payload shape:

```jsonc
{
  "category": "bug | feature | question",
  "title": "string, max 120",
  "body": "string, max 8000",
  "contact_email": "optional string",
  "diagnostics_opt_in": true,
  "diagnostics": {
    "app_version": "0.2.0",
    "platform": "darwin-aarch64",
    "os_version": "14.4.1",
    "locale": "hu-HU",
    "tauri": true,
    "recent_log_tail": "string"
  },
  "turnstile_token": "string"
}
```

Requirements:

- Include `diagnostics` only when `diagnostics_opt_in === true`.
- Mark browser or non-Tauri submissions with `tauri: false`.
- Include a Turnstile token with every real submission.
- Keep the request body under 16 KB.

### 3. Implement Feedback Endpoint

Add a Netlify Function at `website/netlify/functions/feedback.ts` exposed as `/api/feedback`.

Requirements:

- Accept only `POST` requests with JSON bodies.
- Allow CORS only from `https://getanimo.app` and the Tauri app origin.
- Validate payload shape, required fields, category values, and field lengths.
- Reject bodies over 16 KB.
- Verify Cloudflare Turnstile tokens server-side.
- Rate-limit by IP to 5 submissions per hour.
- Create a GitHub issue through the GitHub REST API.
- Apply `feedback` and `from-app` labels to created issues.
- Prefix issue titles with the category, for example `[bug] Crash on timer start`.
- Render the issue body as markdown.
- Put diagnostics in a fenced code block when present.
- Return `{ "ok": true, "issue_url": "https://github.com/..." }` on success.
- Return clear non-2xx responses for validation, Turnstile, rate-limit, and upstream GitHub failures.

Secrets such as GitHub tokens and Turnstile secret keys must live only in Netlify environment variables.

### 4. Preserve No-Telemetry Privacy Expectations

The feedback feature must remain explicit and user-initiated.

Requirements:

- Do not add automatic telemetry.
- Do not send diagnostics unless the user explicitly opts in for that submission.
- Add a Settings toggle named along the lines of `Allow sending feedback to getanimo.app`.
- Default the toggle to on, while still requiring explicit form submission.
- If the toggle is off, hide or disable feedback sending in the app.
- Add `docs/privacy.md` explaining what the feedback form sends, where it is stored, and how users can request deletion.
- Update the README so users are directed to in-app feedback and still have an issue-link fallback.

### 5. Add Tauri Updater Configuration

Configure the desktop app for Tauri updater support.

Requirements:

- Add `tauri-plugin-updater = "2"` to `desktop/Cargo.toml`.
- Register the updater plugin in `desktop/src/lib.rs`.
- Add an updater plugin block to `desktop/tauri.conf.json`.
- Use `dialog: false` so Animo controls the update UI.
- Use `https://getanimo.app/updates/latest.json` as the stable update endpoint.
- Store the ed25519 public key in Tauri config.
- Keep the private signing key only in secure local backup and GitHub Actions secrets.

The signing keypair must be generated once with Tauri's signer tooling. The private key must be backed up in two independent offline locations before it is used for production releases.

### 6. Publish Update Manifest

Host the Tauri update manifest at `https://getanimo.app/updates/latest.json`.

Requirements:

- Add a placeholder manifest file under `website/public/updates/latest.json`.
- Ensure the release workflow overwrites the manifest during release publication.
- Use a 5-minute cache policy for the manifest.
- Include version, notes, publication date, platform download URLs, and signatures.
- Support at least `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, and `windows-x86_64` when those release artifacts exist.

Expected manifest shape:

```jsonc
{
  "version": "0.3.0",
  "notes": "See CHANGELOG.md",
  "pub_date": "2026-06-15T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "base64-signature",
      "url": "https://github.com/captaaint/animo/releases/download/v0.3.0/Animo_0.3.0_aarch64.dmg"
    }
  }
}
```

### 7. Update Release Workflow

Extend `.github/workflows/release.yml` to produce signed updater artifacts and publish the manifest.

Requirements:

- Sign each Tauri bundle with the Tauri signer.
- Upload each `.sig` file as a GitHub Release asset.
- Extend existing artifact-exists checks to include `.sig` files.
- Add a final manifest publication job that runs only after all platform jobs succeed.
- Generate `latest.json` using the release asset URLs and signatures.
- Publish the manifest to the Netlify-hosted website.
- Use GitHub Actions secrets for `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

The first signed release is a baseline release. Existing unsigned installs will still need to update manually to that baseline before future auto-updates can work.

### 8. Add Update Check Helper

Add a frontend helper for update checks.

Requirements:

- Add `app/src/helpers/updater.ts`.
- Lazy-load Tauri updater APIs so browser and demo mode remain safe.
- Return a no-op result when Tauri internals are unavailable.
- Provide a `checkForUpdates()` helper used by startup, Settings, and background polling.
- Retry failed checks up to 3 times with exponential backoff.
- Avoid blocking the UI thread.
- Support an environment override such as `VITE_ANIMO_UPDATES_URL` for local update-manifest testing.

### 9. Add Update UI

Add an Animo-native update banner and Settings update controls.

Requirements:

- Add `app/src/components/UpdateBanner.xmlui`.
- Mount the banner from `app/src/Main.xmlui`, above the timer bar or equivalent top app content.
- Check for updates about 3 seconds after app startup.
- Show the banner only when an update is available.
- Allow the user to dismiss the banner temporarily.
- Add a manual `Check for updates` action in Settings.
- Show current app version in Settings.
- Show last checked timestamp in Settings.
- Add an `Automatically check for updates` toggle, default on.
- Add a `Channel` select with `stable` as the only working channel for now.
- Run background update checks every 24 hours while the app is open, if automatic checks are enabled.

UI states:

- Up to date in Settings.
- Update available banner with version difference.
- Downloading with progress.
- Ready to install with restart action.
- Non-blocking error toast with retry action.

### 10. Add Diagnostics Helper

Add a diagnostics helper for feedback.

Requirements:

- Add `app/src/helpers/diagnostics.ts`.
- Collect app version.
- Collect platform and OS version where available.
- Collect locale.
- Detect whether the app is running in Tauri.
- Include recent log tail only if available and safe to expose.
- Make the resulting diagnostics object previewable before feedback submission.

### 11. Update Configuration and Documentation

Add or update configuration and public documentation.

Requirements:

- Add feedback endpoint and update endpoint configuration to `app/src/config.ts` or the existing config pattern.
- Update `README.md` to mention in-app feedback.
- Add privacy documentation.
- Update `CHANGELOG.md` under `[Unreleased]` with feedback and updater entries.

## Affected Files

Expected new files:

- `app/src/components/FeedbackModal.xmlui`
- `app/src/components/FeedbackDrawer.xmlui`
- `app/src/components/UpdateBanner.xmlui`
- `app/src/helpers/feedback.ts`
- `app/src/helpers/updater.ts`
- `app/src/helpers/diagnostics.ts`
- `docs/privacy.md`
- `website/netlify/functions/feedback.ts`
- `website/public/updates/latest.json`

Expected modified files:

- `desktop/Cargo.toml`
- `desktop/src/lib.rs`
- `desktop/tauri.conf.json`
- `app/src/Main.xmlui`
- `app/src/components/SettingsScreen.xmlui`
- `app/src/config.ts`
- `README.md`
- `CHANGELOG.md`
- `.github/workflows/release.yml`

Expected untouched areas:

- No SQLite schema migration is required.
- The local Rust API crate should not receive feedback submissions.
- Existing local app data ownership should not change.

## Rollout Plan

### Phase 1: Feedback for 0.2.0

Deliver feedback independently before the updater.

Requirements:

- Publish the Netlify Function at `getanimo.app/api/feedback`.
- Configure GitHub token access for issue creation.
- Configure Cloudflare Turnstile.
- Add feedback UI and Settings integration.
- Add privacy documentation.
- Run manual end-to-end tests for bug, feature, and question submissions.
- Verify diagnostics opt-in and opt-out behavior.

### Phase 2: Signing Infrastructure for 0.2.x

Prepare signed artifacts and manifest publication.

Requirements:

- Generate the Tauri updater signing keypair.
- Store the private key securely and test restore from backups.
- Add GitHub Actions secrets.
- Add updater public key and endpoint to Tauri config.
- Extend release workflow for signing and manifest publication.
- Publish a signed baseline release such as `0.2.1`.

### Phase 3: Auto-Update UI for 0.3.0

Deliver user-facing update checks and installation.

Requirements:

- Add updater helper and banner UI.
- Add Settings update controls.
- Add startup and 24-hour background checks.
- Test against a fake or staging `latest.json`.
- Verify download, signature validation, install, and restart behavior.

## Risks

Critical risks:

- Losing the Tauri private signing key would prevent existing installs from accepting future updater artifacts. Mitigate with two tested offline backups before release.
- Feedback submission failures could cause users to lose typed content. Mitigate by saving drafts locally and offering retry.

Medium risks:

- Feedback endpoint spam or abuse. Mitigate with Turnstile, IP rate limits, payload size limits, and GitHub issue labels.
- Stale update manifest cache. Mitigate with a short cache policy and release-time publish or purge behavior.
- Lack of OS-level code signing may still trigger Gatekeeper or SmartScreen warnings. Document this and treat full code signing as a separate epic.

Low risks:

- Multiple update channels are not implemented yet. Keep the Settings field, but support only stable initially.
- Offline users will not see update checks until connectivity returns.
- Feedback and updater UI copy may need later localization.

## Open Questions

- Should feedback issues be created in the public `captaaint/animo` repository or a private `captaaint/animo-feedback` repository?
- Should phase 1 start with a fine-grained PAT for speed, then move to a GitHub App later?
- Should the feedback and update UI copy remain English for now, matching the app?

## Non-Goals

- Apple Developer ID, Windows EV, or other OS-level code signing.
- Beta, pre-release, or multi-channel updater behavior beyond a stored stable channel field.
- Automatic telemetry, usage analytics, or Sentry-style error reporting.
- A feedback dashboard or multi-tenant feedback product.
- Update rollback support.
- Database schema changes.

## Definition of Done

Feedback is done when:

- The Netlify Function creates a GitHub issue from a real staging or production request.
- Requests without a valid Turnstile token fail.
- The sixth request within an hour from the same IP is rate-limited.
- Feedback drafts survive closing and reopening the app window.
- Diagnostics are absent from the payload when opt-in is off.
- Diagnostics are previewed exactly when opt-in is on.
- Demo mode hides feedback sending.
- Privacy documentation is available publicly.

Signing infrastructure is done when:

- A signed baseline release exists with `.sig` files for every published platform artifact.
- `latest.json` is reachable from `getanimo.app`.
- The manifest validates against Tauri updater expectations.
- Private key backups have been restore-tested.

Auto-update UI is done when:

- A mocked newer manifest shows an update banner after startup.
- Manual Settings checks show up-to-date, update-available, and error states correctly.
- Download progress is visible.
- Invalid signatures are rejected by the updater.
- Restarting after installation runs the new version.
- Settings shows the updated app version after restart.
- The 24-hour background poll does not block normal app interaction.
