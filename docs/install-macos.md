# Installing Animo — macOS

Animo is a single-user, local-first time tracker. Your work data stays on
your machine; the app has no telemetry or hosted account service.

## System requirements

- macOS 11 (Big Sur) or newer
- Apple Silicon (M1/M2/M3/M4) for the `aarch64` build, or Intel for the `x64` build

## Option A — install script (recommended)

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh
```

The script picks the right DMG for your architecture, verifies SHA256
against `SHA256SUMS.txt`, copies `Animo.app` to `/Applications/`, and
clears the macOS quarantine attribute so Gatekeeper doesn't block first
launch. If `xattr -dr com.apple.quarantine` fails for any reason, follow
the manual Gatekeeper steps below.

## Option B — manual DMG install

1. Download the DMG for your CPU from the [releases page][releases]:
   - Apple Silicon: `Animo_<version>_aarch64.dmg`
   - Intel: `Animo_<version>_x64.dmg`
2. Double-click the DMG to open it.
3. Drag the **Animo** icon onto the **Applications** folder.
4. Eject the DMG.

### First launch — handling Gatekeeper

The app isn't signed with an Apple Developer ID (Animo is on-prem
distribution, not App Store), so on first launch macOS shows one of two
warnings depending on your macOS version and how you downloaded the DMG.

#### Case 1 (most common on Sonoma+): *"Animo.app is damaged and can't be opened. You should move it to the Trash."*

This is **not** an actual corruption — it's macOS's hard-block for
unsigned apps downloaded via a browser (the `com.apple.quarantine`
extended attribute). **Don't move it to Trash.** Run this once in
**Terminal**:

```sh
xattr -dr com.apple.quarantine /Applications/Animo.app
```

Then double-click **Animo** — it launches normally.

> If the app is still in `~/Downloads` (not yet copied to Applications),
> point the command there instead, e.g.
> `xattr -dr com.apple.quarantine ~/Downloads/Animo.app`.

#### Case 2: *"Animo cannot be opened because the developer cannot be verified"*

On some macOS versions you get the milder "unidentified developer"
dialog with an **Open Anyway** path through System Settings. This
happens **once** — the system remembers your decision.

1. Double-click **Animo** to try launching it. A dialog appears saying
   the system couldn't verify the developer. Click **Done** / **Cancel**.
2. Open **Apple menu → System Settings → Privacy & Security**.
3. Scroll to the "Security" section. You'll see a message like
   *"Animo was blocked to protect your Mac"* with an **Open Anyway**
   button — click it.
4. In the confirmation dialog, choose **Open Anyway** and authenticate
   with your password / Touch ID.

After this the app launches normally — just double-click.

> On macOS Sonoma 14 or earlier, **Finder → Applications → right-click
> Animo → Open** also works for Case 2. Since Sequoia (macOS 15) the
> Privacy & Security panel is the only path. For Case 1 the `xattr`
> command above is always the cleanest fix on every version.

## First use

On first launch you'll see the setup screen. Add a display name and
username to create the first local profile. This happens in the embedded
SQLite database — no hosted account is created.

## Where is the data stored?

```text
~/Library/Application Support/app.getanimo.timetracker/data.db
```

This is a standard SQLite file. To back up your data, copy this file —
it contains all your time entries, projects, clients, tags, and user
profile.

## Verifying the SHA256 manually

```sh
curl -fLO https://github.com/captaaint/animo/releases/latest/download/SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

## Updating

1. Quit the app (`Cmd+Q`).
2. Move the old `Animo.app` from **Applications** to the Trash.
3. Install the new DMG following the steps above.

Your database stays in `~/Library/Application Support/`, so the new
version picks up where the old one left off. Schema migrations run
automatically at startup.

## Uninstalling completely

```sh
rm -rf /Applications/Animo.app
rm -rf "$HOME/Library/Application Support/app.getanimo.timetracker"
```

The second command **permanently deletes all your time entries, projects,
clients, tags, and local profile data**. Only run it if you really want to discard
everything.

## Troubleshooting

If the app fails to launch, run the binary from the terminal to see
startup logs:

```sh
/Applications/Animo.app/Contents/MacOS/animo-desktop
```

You should see lines like:

```text
INFO animo_desktop_lib: app data dir: /Users/.../Library/Application Support/app.getanimo.timetracker
INFO animo_api: migrations applied
INFO animo_desktop_lib: api bound on http://127.0.0.1:<random-port>
```

If you see errors, save the output and open an issue at
<https://github.com/captaaint/animo/issues>.

[releases]: https://github.com/captaaint/animo/releases
