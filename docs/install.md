# Installing Animo

Animo is a self-hosted, single-user time tracker. The desktop builds are
currently unsigned, so the OS will warn on first launch — the per-platform
guides walk through the one-time approval.

All downloads come from the [GitHub releases page][releases]. Every release
also publishes `SHA256SUMS.txt`; the install scripts verify the checksum
before installing.

## One-liner (recommended)

### macOS / Linux

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh
```

Pin a specific version:

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh -s -- --version <version>
```

### Windows (PowerShell)

```powershell
irm https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex
```

Pin a version:

```powershell
& { iwr -useb https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex } -Version <version>
```

## Manual install

Per-platform walkthroughs (DMG / MSI / AppImage / DEB, Gatekeeper handling,
checksums, uninstall):

- [macOS](install-macos.md)
- [Windows](install-windows.md)
- [Linux](install-linux.md)

## Verifying checksums manually

```sh
curl -fLO https://github.com/captaaint/animo/releases/latest/download/SHA256SUMS.txt
sha256sum --check --ignore-missing SHA256SUMS.txt        # Linux
shasum -a 256 -c SHA256SUMS.txt --ignore-missing         # macOS
```

On Windows:

```powershell
$expected = (Get-Content SHA256SUMS.txt | Select-String "Animo_<version>_x64.msi").ToString().Split()[0]
$actual = (Get-FileHash Animo_<version>_x64.msi -Algorithm SHA256).Hash.ToLower()
$expected -eq $actual
```

## Where Animo stores data

The desktop app keeps its SQLite database under the OS-standard application
support path:

| Platform | Location |
|----------|----------|
| macOS    | `~/Library/Application Support/app.getanimo.timetracker/data.db` |
| Linux    | `~/.local/share/app.getanimo.timetracker/data.db` |
| Windows  | `%APPDATA%\app.getanimo.timetracker\data.db` |

Back up this file to keep your time entries, projects, clients, and tags.
Schema migrations run automatically at startup, so the new build picks up
where the old one left off.

## Running just the API server

The headless `animo-api` server is shipped alongside the desktop bundles
(see `animo-api_<version>_<platform>.tar.gz` / `.zip` on the release page).
Unpack and run the binary; configuration is via `DATABASE_URL` and the
other env vars documented in `api/.env.example`.

[releases]: https://github.com/captaaint/animo/releases
