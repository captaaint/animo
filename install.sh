#!/bin/sh
# Animo installer (POSIX) — macOS + Linux.
#
# Usage:
#   curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh
#   curl -fsSL https://github.com/captaaint/animo/releases/latest/download/install.sh | sh -s -- --version 0.1.0
#
# Flags:
#   --version <N.N.N>   pin a specific version (default: latest)
#   --prefix <dir>      override install prefix (Linux only)
#   --no-verify         skip SHA256 verification (NOT recommended)
#   --help              show this help

set -eu

REPO="captaaint/animo"
RELEASE_BASE="https://github.com/${REPO}/releases"
VERSION=""
PREFIX=""
VERIFY=1

log()  { printf '%s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --version=*) VERSION="${1#--version=}"; shift ;;
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    --prefix=*) PREFIX="${1#--prefix=}"; shift ;;
    --no-verify) VERIFY=0; shift ;;
    -h|--help) usage ;;
    *) die "unexpected argument: $1 (try --help)" ;;
  esac
done

OS_NAME="$(uname -s)"
ARCH="$(uname -m)"

case "$OS_NAME" in
  Darwin) OS=macos ;;
  Linux)  OS=linux ;;
  *) die "unsupported OS: $OS_NAME (Windows: use install.ps1)" ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH_TAG_MAC=aarch64; ARCH_TAG_LINUX=arm64 ;;
  x86_64|amd64)  ARCH_TAG_MAC=x64;     ARCH_TAG_LINUX=amd64 ;;
  *) die "unsupported architecture: $ARCH" ;;
esac

if [ "$OS" = "macos" ]; then
  ASSET_NAME_TEMPLATE="Animo_VERSION_${ARCH_TAG_MAC}.dmg"
elif [ "$OS" = "linux" ]; then
  ASSET_NAME_TEMPLATE="Animo_VERSION_${ARCH_TAG_LINUX}.AppImage"
fi

# Resolve tag: pinned --version, or follow GitHub's latest API.
if [ -n "$VERSION" ]; then
  case "$VERSION" in
    v*) TAG="$VERSION" ;;
    *)  TAG="v${VERSION}" ;;
  esac
else
  log "Resolving latest release tag ..."
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
  [ -z "$TAG" ] && die "could not resolve latest tag (rate-limited? network?)"
fi
VER="${TAG#v}"
BASE_URL="${RELEASE_BASE}/download/${TAG}"
SUMS_URL="${BASE_URL}/SHA256SUMS.txt"
ASSET_NAME="$(printf '%s' "$ASSET_NAME_TEMPLATE" | sed "s/VERSION/${VER}/")"
ASSET_URL="${BASE_URL}/${ASSET_NAME}"

need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }
need curl
SHA_CMD=""
if [ "$VERIFY" -eq 1 ]; then
  if command -v sha256sum >/dev/null 2>&1; then SHA_CMD="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then SHA_CMD="shasum -a 256"
  else die "no sha256 tool found (need sha256sum or shasum); rerun with --no-verify if you accept the risk."
  fi
fi

TMP="$(mktemp -d -t animo-install.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT INT TERM

log "Downloading ${ASSET_NAME} ..."
curl -fL --retry 3 -o "$TMP/asset" "$ASSET_URL" \
  || die "download failed: $ASSET_URL"

if [ "$VERIFY" -eq 1 ]; then
  log "Verifying SHA256 ..."
  curl -fL --retry 3 -o "$TMP/SHA256SUMS.txt" "$SUMS_URL" \
    || die "could not fetch SHA256SUMS.txt — rerun with --no-verify to bypass."

  EXPECTED=$(grep -E "[[:space:]]\\*?${ASSET_NAME}\$" "$TMP/SHA256SUMS.txt" \
    | awk '{print $1}' | head -n1)
  [ -z "$EXPECTED" ] && die "no checksum entry for ${ASSET_NAME}"

  ACTUAL=$($SHA_CMD "$TMP/asset" | awk '{print $1}')
  [ "$EXPECTED" = "$ACTUAL" ] || die "checksum mismatch — expected $EXPECTED, got $ACTUAL"
  log "Checksum OK"
fi

install_macos() {
  log "Mounting DMG ..."
  MOUNT_OUTPUT=$(hdiutil attach -nobrowse -quiet -plist "$TMP/asset")
  MOUNT_POINT=$(printf '%s\n' "$MOUNT_OUTPUT" \
    | grep -A1 '<key>mount-point</key>' | tail -n1 \
    | sed -e 's|.*<string>||' -e 's|</string>.*||' | head -n1)
  [ -z "$MOUNT_POINT" ] && die "could not determine DMG mount point"

  APP_SRC=$(find "$MOUNT_POINT" -maxdepth 2 -name 'Animo.app' -print -quit)
  if [ -z "$APP_SRC" ]; then
    hdiutil detach -quiet "$MOUNT_POINT" || true
    die "Animo.app not found in DMG"
  fi

  APP_DST="/Applications/Animo.app"
  log "Installing to $APP_DST ..."
  if [ -d "$APP_DST" ]; then
    rm -rf "$APP_DST" 2>/dev/null || sudo rm -rf "$APP_DST"
  fi
  cp -R "$APP_SRC" "$APP_DST" 2>/dev/null || sudo cp -R "$APP_SRC" "$APP_DST"

  hdiutil detach -quiet "$MOUNT_POINT" || true

  log "Clearing macOS quarantine ..."
  xattr -dr com.apple.quarantine "$APP_DST" 2>/dev/null \
    || sudo xattr -dr com.apple.quarantine "$APP_DST" 2>/dev/null \
    || log "warning: could not clear quarantine — see docs/install-macos.md for the manual Gatekeeper steps."

  log ""
  log "Installed: $APP_DST"
  log "Launch:    open -a Animo"
}

install_linux() {
  TARGET_DIR="${PREFIX:-$HOME/.local/bin}"
  TARGET="$TARGET_DIR/Animo"

  mkdir -p "$TARGET_DIR"
  cp "$TMP/asset" "$TARGET"
  chmod +x "$TARGET"

  log ""
  log "Installed: $TARGET"
  case ":$PATH:" in
    *":$TARGET_DIR:"*) ;;
    *) log "note: $TARGET_DIR is not in PATH — add it to your shell profile to launch from terminal." ;;
  esac
  log "Launch:    Animo"
}

case "$OS" in
  macos) install_macos ;;
  linux) install_linux ;;
esac

log ""
log "Docs: https://github.com/${REPO}/blob/main/docs/install.md"
