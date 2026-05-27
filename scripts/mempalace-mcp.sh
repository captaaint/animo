#!/usr/bin/env bash
#
# scripts/mempalace-mcp.sh — start the MemPalace MCP server from the installed
# CLI environment.
#
# This wrapper avoids assuming that `python` or `mempalace-mcp` is on PATH.
# It works with pipx/uv-style installs where the `mempalace` executable has a
# shebang pointing at the environment that contains the mempalace Python module.

set -euo pipefail

MEMPALACE_BIN="${MEMPALACE_BIN:-$(command -v mempalace || true)}"
PALACE="${MEMPALACE_PALACE:-$HOME/.mempalace-animo}"

if [ -z "$MEMPALACE_BIN" ]; then
  echo "error: mempalace CLI not found on PATH" >&2
  echo "install it with: uv tool install mempalace" >&2
  exit 127
fi

PYTHON_BIN="$(head -n 1 "$MEMPALACE_BIN" | sed 's/^#!//')"

if [ -z "$PYTHON_BIN" ]; then
  echo "error: could not find executable Python from $MEMPALACE_BIN" >&2
  echo "run 'mempalace mcp' and put its command in your local .mcp.json" >&2
  exit 1
fi

case "$PYTHON_BIN" in
  /usr/bin/env\ *)
    # shellcheck disable=SC2086
    exec $PYTHON_BIN -m mempalace.mcp_server --palace "$PALACE" "$@"
    ;;
  *)
    if [ ! -x "$PYTHON_BIN" ]; then
      echo "error: Python from $MEMPALACE_BIN is not executable: $PYTHON_BIN" >&2
      echo "run 'mempalace mcp' and put its command in your local .mcp.json" >&2
      exit 1
    fi
    exec "$PYTHON_BIN" -m mempalace.mcp_server --palace "$PALACE" "$@"
    ;;
esac
