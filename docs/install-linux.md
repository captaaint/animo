# Installing Animo — Linux

Animo is a single-user, on-premise time tracker. Your data stays on your
machine — no cloud, no external services.

## System requirements

- A modern x86_64 distro (tested on Ubuntu 22.04 / 24.04, Debian 12,
  Fedora 40, Arch).
- A working WebKitGTK runtime (`libwebkit2gtk-4.1-0`) for the desktop UI.
  On Debian/Ubuntu:

  ```sh
  sudo apt-get install -y libwebkit2gtk-4.1-0
  ```

  Most desktop environments install it as part of the standard webview /
  GNOME stack.

## Option A — install script (recommended)

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh
```

The script downloads the AppImage for your architecture, verifies SHA256
against `SHA256SUMS.txt`, copies it to `~/.local/bin/Animo`, and marks it
executable. If `~/.local/bin` isn't in your `PATH`, add this to your
shell profile:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Pin a specific version:

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh -s -- --version 0.1.0
```

Custom install directory:

```sh
curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh -s -- --prefix /usr/local/bin
```

## Option B — manual install

### AppImage (portable, no root)

```sh
curl -fLO https://github.com/captaaint/animo/releases/latest/download/Animo_0.1.0_amd64.AppImage
chmod +x Animo_0.1.0_amd64.AppImage
./Animo_0.1.0_amd64.AppImage
```

To integrate it with the desktop menu, use an AppImage integration tool
such as [AppImageLauncher][appimagelauncher].

### .deb (Debian / Ubuntu)

```sh
curl -fLO https://github.com/captaaint/animo/releases/latest/download/Animo_0.1.0_amd64.deb
sudo apt install ./Animo_0.1.0_amd64.deb
```

This drops `Animo` into `/usr/bin/` and adds a `.desktop` entry to the
application menu. Uninstall with `sudo apt remove animo`.

## Verifying the SHA256 manually

```sh
curl -fLO https://github.com/captaaint/animo/releases/latest/download/SHA256SUMS.txt
sha256sum --check --ignore-missing SHA256SUMS.txt
```

## Where is the data stored?

```text
~/.local/share/app.getanimo.timetracker/data.db
```

Standard SQLite file. Back it up to keep your time entries, projects,
clients, and tags. Schema migrations run automatically at startup.

## Updating

Run the install script again — it overwrites the previous AppImage in
place. For the `.deb` flow, run `sudo apt install ./Animo_<new>_amd64.deb`
and your database in `~/.local/share/` stays untouched.

## Uninstalling completely

```sh
# AppImage path:
rm -f "$HOME/.local/bin/Animo"

# .deb path:
sudo apt remove animo

# Wipe data (irreversible):
rm -rf "$HOME/.local/share/app.getanimo.timetracker"
```

The wipe step **permanently deletes all your time entries, projects,
clients, and user data**.

## Troubleshooting

If the AppImage fails to launch, run it from a terminal to see startup
logs:

```sh
~/.local/bin/Animo
```

Common failures:

- *"cannot find libwebkit2gtk-4.1.so.0"* — install
  `libwebkit2gtk-4.1-0` (see "System requirements" above).
- *"AppImages require FUSE"* — install `fuse` /  `libfuse2` for your distro.

If you see other errors, save the output and open an issue at
<https://github.com/captaaint/animo/issues>.

[appimagelauncher]: https://github.com/TheAssassin/AppImageLauncher
