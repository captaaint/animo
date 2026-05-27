# Installing Animo — Windows

Animo is a single-user, local-first time tracker. Your work data stays on
your machine; the app has no telemetry or hosted account service.

## System requirements

- Windows 10 (1809) or newer, 64-bit
- WebView2 runtime (present by default on Windows 11; on Windows 10 the
  installer prompts to install it if missing)

## Option A — install script (recommended)

In a PowerShell prompt (the default Windows Terminal profile is fine):

```powershell
irm https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex
```

The script downloads the MSI for the latest release, verifies SHA256
against `SHA256SUMS.txt`, and runs `msiexec` to install. The MSI takes
care of the install directory, the Start Menu shortcut, and the
uninstaller entry — no manual PATH editing is needed.

Pin a specific version:

```powershell
& { iwr -useb https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex } -Version <version>
```

Silent (no UI, scripted installs):

```powershell
& { iwr -useb https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex } -Silent
```

## Option B — manual MSI install

1. Download `Animo_<version>_x64.msi` from the
   [releases page](https://github.com/captaaint/animo/releases).
2. Double-click the MSI. SmartScreen will warn about an "unrecognized app"
   because the MSI isn't code-signed yet — click **More info → Run anyway**.
3. Step through the installer. The default install path is
   `C:\Program Files\Animo\`.

After install you can launch Animo from the Start Menu.

## SmartScreen / Defender warnings

The MSI is currently unsigned, so:

- **SmartScreen** prompts "Windows protected your PC" — click **More info**,
  then **Run anyway**. This is a one-time confirmation per binary hash.
- **Windows Defender** very occasionally false-positives Tauri apps;
  whitelisting `C:\Program Files\Animo\` should clear it.

If your organisation blocks unsigned MSIs by policy, you'll need a signed
build — open an issue and let me know it's a blocker.

## Where is the data stored?

```text
%APPDATA%\app.getanimo.timetracker\data.db
```

In Explorer that resolves to roughly
`C:\Users\<you>\AppData\Roaming\app.getanimo.timetracker\data.db`. Back
up this file to keep your time entries, projects, clients, and tags.
Schema migrations run automatically at startup.

## Verifying the SHA256 manually

```powershell
iwr https://github.com/captaaint/animo/releases/latest/download/SHA256SUMS.txt -OutFile SHA256SUMS.txt
$expected = (Get-Content SHA256SUMS.txt | Select-String "Animo_<version>_x64.msi").ToString().Split()[0]
$actual = (Get-FileHash Animo_<version>_x64.msi -Algorithm SHA256).Hash.ToLower()
$expected -eq $actual
```

The expression should print `True`.

## Updating

Run the same install script — it overwrites the previous version in place.
For a fully manual update, uninstall the old version via
**Settings → Apps → Animo → Uninstall**, then install the new MSI.

Your database in `%APPDATA%` stays put, so the new version picks up your
data automatically.

## Uninstalling completely

1. **Settings → Apps → Installed apps → Animo → Uninstall.**
2. To also wipe your data:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\app.getanimo.timetracker"
```

The second step **permanently deletes all your time entries, projects,
clients, tags, and local profile data**.

## Troubleshooting

If the app fails to launch, start it from a terminal to see startup logs:

```powershell
& "C:\Program Files\Animo\Animo.exe"
```

If you see errors, save the output and open an issue at
<https://github.com/captaaint/animo/issues>.
