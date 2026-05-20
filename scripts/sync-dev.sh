#!/usr/bin/env bash
#
# scripts/sync-dev.sh — pull the latest origin/dev locally after the
# sync-dev workflow has force-reset it to match main.
#
# Run after merging a dev → main PR. The remote sync-dev workflow rewrites
# origin/dev to match origin/main; this script aligns your local dev branch
# with that new tip.
#
# Refuses to run if the working tree has uncommitted changes — stash or
# commit first.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree is dirty — commit or stash first" >&2
  git status --short >&2
  exit 1
fi

echo "Fetching origin..."
git fetch origin

echo "Resetting local dev to origin/dev..."
git checkout dev
git reset --hard origin/dev

echo
echo "Local dev now at: $(git rev-parse --short HEAD)"
