#!/usr/bin/env bash
#
# scripts/mempalace-animo.sh — local MemPalace helper for Animo development.
#
# This is optional developer tooling. It never runs as part of build, test, or
# release workflows. Install MemPalace first:
#   uv tool install mempalace

set -euo pipefail

cd "$(dirname "$0")/.."

WING="${MEMPALACE_WING:-animo}"
PALACE="${MEMPALACE_PALACE:-$HOME/.mempalace-animo}"

usage() {
  cat <<EOF
Usage:
  scripts/mempalace-animo.sh init
  scripts/mempalace-animo.sh mine-dry-run
  scripts/mempalace-animo.sh mine
  scripts/mempalace-animo.sh status
  scripts/mempalace-animo.sh wake-up
  scripts/mempalace-animo.sh search "query"

Environment:
  MEMPALACE_WING    Wing name to use (default: animo)
  MEMPALACE_PALACE  Palace directory (default: $HOME/.mempalace-animo)

Safety:
  MemPalace should respect .gitignore by default. Before running "mine",
  inspect "mine-dry-run" output and confirm it does not include .env,
  .mcp.json, local *.db files, node_modules, target, or build output.
EOF
}

require_mempalace() {
  if ! command -v mempalace >/dev/null 2>&1; then
    echo "error: mempalace CLI not found on PATH" >&2
    echo "install it with: uv tool install mempalace" >&2
    exit 127
  fi
}

run_mempalace() {
  mempalace --palace "$PALACE" "$@"
}

cmd="${1:-}"
if [ -z "$cmd" ]; then
  usage
  exit 2
fi
shift || true

case "$cmd" in
  help|-h|--help)
    usage
    ;;
  init)
    require_mempalace
    run_mempalace init . --yes
    ;;
  mine-dry-run)
    require_mempalace
    run_mempalace mine . --wing "$WING" --dry-run
    ;;
  mine)
    require_mempalace
    cat >&2 <<EOF
About to mine this repo into MemPalace wing "$WING".
Palace: $PALACE
Run "scripts/mempalace-animo.sh mine-dry-run" first if you have not checked
which files will be indexed.
EOF
    run_mempalace mine . --wing "$WING"
    ;;
  status)
    require_mempalace
    status_output="$(run_mempalace status 2>&1)" || {
      if printf '%s\n' "$status_output" | grep -q "too many SQL variables"; then
        cat >&2 <<EOF
MemPalace status hit ChromaDB's SQLite variable limit.

Your palace is likely large enough for MemPalace's status aggregation to exceed
ChromaDB's query variable limit. Search and wake-up can still work.

Try:
  scripts/mempalace-animo.sh wake-up
  scripts/mempalace-animo.sh search "Tauri embedded API port"

If search is also broken, try:
  mempalace repair

EOF
      else
        printf '%s\n' "$status_output" >&2
      fi
      exit 1
    }
    printf '%s\n' "$status_output"
    ;;
  wake-up)
    require_mempalace
    run_mempalace wake-up --wing "$WING"
    ;;
  search)
    require_mempalace
    if [ "$#" -eq 0 ]; then
      echo "error: search requires a query" >&2
      usage >&2
      exit 2
    fi
    run_mempalace search "$*" --wing "$WING"
    ;;
  *)
    echo "error: unknown command: $cmd" >&2
    usage >&2
    exit 2
    ;;
esac
