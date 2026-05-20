# Animo — Installation Guide (macOS)

Single-user, on-premise time tracker. Your data stays on your machine — no cloud, no external services.

## System requirements

- macOS 11 (Big Sur) or newer
- Apple Silicon (M1/M2/M3/M4) — this build is native arm64

> For Intel Macs, a separate x86_64 build is required (`cargo tauri build --target x86_64-apple-darwin`).

## Installation

1. Download `Animo_0.1.0_aarch64.dmg`.
2. Double-click the DMG to open it.
3. In the window that appears, drag the **Animo** icon onto the **Applications** folder.
4. Eject the DMG.

## First launch — handling Gatekeeper

The app isn't signed with an Apple Developer ID (it's an on-prem build, not App Store distribution), so on first launch macOS Gatekeeper will warn you about an "unidentified developer." You only need to handle this **once** — the system remembers it.

1. Double-click **Animo** to try launching it. A dialog will appear saying the system couldn't verify the developer. Click **Done** / **Cancel**.
2. Open **Apple menu → System Settings → Privacy & Security**.
3. Scroll down to the "Security" section. You'll see a message like *"Animo was blocked to protect your Mac"* with an **Open Anyway** button — click it.
4. In the confirmation dialog, choose **Open Anyway** and authenticate with your password / Touch ID.

After this, the app will launch normally from then on — just double-click.

> On older macOS versions (Sonoma 14 or earlier) the shortcut **Finder → Applications → right-click Animo → Open** also works. Since Sequoia (macOS 15) only the Privacy & Security panel approach works.

## First use

On first launch you'll see the sign-in screen. Since this is a fresh install with no user, click the **"No account? Register"** link and provide an email and password. Registration happens locally (in the embedded SQLite database) — no external API is contacted.

## Where is the data stored?

```text
~/Library/Application Support/app.getanimo.timetracker/data.db
```

This is a standard SQLite file. To back up your data, copy this file — it contains all your time entries, projects, clients, tags, and user accounts.

## Updating

1. Quit the app (`Cmd+Q`).
2. Move the old `Animo.app` from the **Applications** folder to the Trash.
3. Install the new DMG following the steps above.

Your database stays in `~/Library/Application Support/`, so the new version picks up where the old one left off. Schema migrations run automatically at startup.

## Uninstalling completely

```bash
rm -rf /Applications/Animo.app
rm -rf "$HOME/Library/Application Support/app.getanimo.timetracker"
```

The second command **permanently deletes all your time entries, projects, clients, and user data**. Only run it if you really want to discard everything.

## Troubleshooting

If the app fails to launch:

```bash
# Run the binary from the terminal to see startup logs:
/Applications/Animo.app/Contents/MacOS/animo-desktop
```

On startup you should see lines like these on stdout:

```text
INFO animo_desktop_lib: app data dir: /Users/.../Library/Application Support/app.getanimo.timetracker
INFO animo_api: migrations applied
INFO animo_desktop_lib: api bound on http://127.0.0.1:<random-port>
```

If you see errors in the log, save the output and open an issue.
