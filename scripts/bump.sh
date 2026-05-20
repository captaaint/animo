#!/usr/bin/env bash
set -euo pipefail

# scripts/bump.sh — atomic release flow for animo.
#
# Synchronises a single version across four manifests:
#   - package.json                (root, source of truth)
#   - web/package.json            (XMLUI SPA)
#   - api/Cargo.toml              (animo-api server)
#   - desktop/Cargo.toml          (Tauri shell)
#   - desktop/tauri.conf.json     (Tauri bundle metadata)
#
# Standard release (preflight → edit → build → commit → tag → push → dispatch):
#   scripts/bump.sh 0.2.0
#
# Local-only (commit + tag locally; skip push and workflow dispatch):
#   scripts/bump.sh 0.2.0 --no-push

usage() {
  cat <<'EOF' >&2
usage: bump.sh <version> [--no-push] [--branch=<name>]

  <version>       N.N.N (e.g. 0.2.0; leading v is stripped)
  --no-push       stop after commit+tag locally; don't push or dispatch
  --branch=NAME   expected current branch (default: main)
EOF
  exit 1
}

# --- Parse args -------------------------------------------------------

VERSION=""
PUSH=1
BRANCH="main"
for arg in "$@"; do
  case "$arg" in
    --no-push) PUSH=0 ;;
    --branch=*) BRANCH="${arg#--branch=}" ;;
    -h|--help) usage ;;
    *)
      if [ -z "$VERSION" ]; then
        VERSION="${arg#v}"
      else
        echo "error: unexpected argument: $arg" >&2
        usage
      fi
      ;;
  esac
done

[ -z "$VERSION" ] && usage

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must be N.N.N or vN.N.N (got: $VERSION)" >&2
  exit 1
fi

TAG="v${VERSION}"
cd "$(dirname "$0")/.."

# --- Preflight --------------------------------------------------------

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "error: expected branch '$BRANCH' but HEAD is on '$CURRENT_BRANCH'" >&2
  echo "       (override with --branch=<name> if this is intentional)" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree is dirty — commit or stash first" >&2
  git status --short >&2
  exit 1
fi

if [ $PUSH -eq 1 ]; then
  if ! command -v gh >/dev/null; then
    echo "error: gh CLI not found (required for workflow dispatch); use --no-push to skip" >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "error: gh CLI not authenticated; run 'gh auth login' or use --no-push" >&2
    exit 1
  fi
fi

echo "Fetching origin..."
git fetch origin --quiet

AHEAD_OF_LOCAL=$(git rev-list "HEAD..origin/$BRANCH" --count 2>/dev/null || echo "0")
if [ "$AHEAD_OF_LOCAL" -ne 0 ]; then
  echo "error: local '$BRANCH' is $AHEAD_OF_LOCAL commit(s) behind origin/$BRANCH" >&2
  echo "       pull or rebase before releasing" >&2
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists locally" >&2
  exit 1
fi

if [ -n "$(git ls-remote --tags origin "$TAG")" ]; then
  echo "error: tag $TAG already exists on origin" >&2
  exit 1
fi

# CHANGELOG must mention this version (Keep a Changelog convention).
if ! grep -qE "^##\s*\[?${VERSION}\]?" CHANGELOG.md 2>/dev/null; then
  echo "error: CHANGELOG.md has no entry for ${VERSION}" >&2
  echo "       add a '## [${VERSION}] - YYYY-MM-DD' section before bumping" >&2
  exit 1
fi

PRE_SHA=$(git rev-parse HEAD)

# --- Rollback helpers -------------------------------------------------

TOUCHED_FILES=(
  "package.json"
  "web/package.json"
  "api/Cargo.toml"
  "desktop/Cargo.toml"
  "desktop/tauri.conf.json"
  "api/Cargo.lock"
  "desktop/Cargo.lock"
)

rollback_disk() {
  echo "  rolling back disk changes..." >&2
  for f in "${TOUCHED_FILES[@]}"; do
    git checkout -- "$f" 2>/dev/null || true
  done
}

rollback_commit() {
  echo "  rolling back commit + tag..." >&2
  git tag -d "$TAG" 2>/dev/null || true
  git reset --hard "$PRE_SHA"
}

# --- Edit -------------------------------------------------------------

echo "Bumping to ${VERSION}..."

# JSON manifests: use Node for safe parse+stringify.
node -e "
  const fs = require('fs');
  for (const p of ['package.json', 'web/package.json', 'desktop/tauri.conf.json']) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '${VERSION}';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  }
"

# Cargo.toml: top-level [package] version only, not deps.
for cargo in api/Cargo.toml desktop/Cargo.toml; do
  awk -v new="${VERSION}" '
    /^\[package\]/ { in_pkg=1 }
    /^\[/ && !/^\[package\]/ { in_pkg=0 }
    in_pkg && /^version[[:space:]]*=/ { sub(/"[^"]*"/, "\"" new "\""); in_pkg=0 }
    { print }
  ' "$cargo" > "$cargo.tmp" && mv "$cargo.tmp" "$cargo"
done

# Refresh Cargo.lock files so the new version lands in them.
echo "Refreshing api/Cargo.lock..."
if ! (cd api && cargo build --quiet); then
  echo "error: api cargo build failed" >&2
  rollback_disk
  exit 1
fi

echo "Refreshing desktop/Cargo.lock..."
if ! (cd desktop && cargo build --quiet); then
  echo "error: desktop cargo build failed" >&2
  rollback_disk
  exit 1
fi

# --- Commit + tag (rollback commit on tag failure) --------------------

echo "Committing + tagging..."
git add "${TOUCHED_FILES[@]}"
if ! git commit -m "Release ${TAG}"; then
  echo "error: commit failed" >&2
  rollback_disk
  exit 1
fi
if ! git tag "$TAG"; then
  echo "error: tag creation failed" >&2
  rollback_commit
  exit 1
fi

echo "Local: $(git rev-parse --short HEAD) tagged as ${TAG}"

if [ $PUSH -eq 0 ]; then
  echo
  echo "Skipped push and workflow dispatch (--no-push)."
  echo "To finish manually:"
  echo "  git push --atomic origin $BRANCH $TAG"
  echo "  gh workflow run release.yml -f tag=$TAG  # (when workflow exists)"
  exit 0
fi

# --- Atomic push (commit + tag together) ------------------------------

echo "Pushing $BRANCH + $TAG (atomic)..."
if ! git push --atomic origin "$BRANCH" "$TAG"; then
  echo "error: push failed" >&2
  echo "       local commit + tag are intact; retry with:" >&2
  echo "         git push --atomic origin $BRANCH $TAG" >&2
  exit 1
fi

# --- Workflow dispatch ------------------------------------------------
# Only attempt if release.yml exists in the repo.

if gh workflow list --json path -q '.[].path' 2>/dev/null | grep -q "release.yml"; then
  echo "Dispatching release workflow with tag ${TAG}..."
  if ! gh workflow run release.yml -f tag="$TAG"; then
    echo "warning: workflow dispatch failed (push succeeded); retry with:" >&2
    echo "  gh workflow run release.yml -f tag=$TAG" >&2
  fi
else
  echo "note: release.yml workflow not found; skipping dispatch."
fi

# --- Summary ----------------------------------------------------------

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "<owner>/<repo>")
echo
echo "Released ${TAG}."
echo "  Actions: https://github.com/${REPO}/actions"
