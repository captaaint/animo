#!/usr/bin/env bash
#
# scripts/install-hooks.sh — point this repo at .githooks/ for git hooks.
#
# Run once after cloning:
#   ./scripts/install-hooks.sh
#
# This sets `core.hooksPath` to the in-tree `.githooks/` directory so the
# versioned pre-commit hook (and any future hooks) are picked up by git.
# Re-running is idempotent.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d .githooks ]; then
  echo "error: .githooks/ directory not found in $(pwd)" >&2
  exit 1
fi

git config core.hooksPath .githooks

echo "Git hooks installed."
echo "  core.hooksPath = $(git config core.hooksPath)"
echo
echo "Active hooks:"
ls -1 .githooks | sed 's/^/  - /'
