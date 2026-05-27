# MemPalace for Animo development workflow

Date reviewed: 2026-05-27

Source reviewed:

- https://github.com/MemPalace/mempalace
- https://mempalaceofficial.com/
- https://mempalaceofficial.com/reference/cli
- https://mempalaceofficial.com/guide/mcp-integration.html
- https://mempalaceofficial.com/guide/hooks.html
- https://mempalaceofficial.com/concepts/knowledge-graph.html
- https://mempalaceofficial.com/reference/mcp-tools.html

## Summary

MemPalace is a local-first AI memory system for development agents. It stores
verbatim text chunks, indexes them with a local vector backend, exposes search
and write operations through a CLI and MCP server, and optionally keeps a local
SQLite knowledge graph for time-scoped relationships.

For Animo, MemPalace should be used as a personal development accelerator, not
as part of the shipped app. The useful fit is in the maintainer workflow:

- persist architectural decisions across Codex/Claude sessions;
- search old implementation discussions before changing behavior;
- index repo docs, issue notes, release notes, and important conversations;
- keep a lightweight knowledge graph of decisions, ownership, and feature state.

Recommended starting point: treat MemPalace as optional local memory for
Codex/Claude sessions while working on Animo. It should help recover prior
context, decisions, debugging trails, and conventions without turning the repo
or product into a MemPalace-dependent system.

## What MemPalace provides

Core capabilities:

- Local storage under a palace directory, defaulting to `~/.mempalace`.
- Verbatim storage rather than summary-only memories.
- Semantic search over stored drawers, with optional `wing` and `room` filters.
- CLI commands such as `init`, `mine`, `search`, `wake-up`, `status`, `repair`,
  `mcp`, and `hook`.
- MCP server exposing palace search, drawer read/write, navigation, tunnel,
  diary, hook-status, and knowledge-graph tools.
- Temporal knowledge graph backed by SQLite, with facts that can be valid for a
  date range and later invalidated.
- Optional auto-save hooks for Claude Code and Codex-style workflows.

Important caveats:

- The package is Python-based and currently marked beta in its package metadata.
- Default dependencies include ChromaDB, NumPy, tokenizers, Hugging Face tooling,
  and a lazily downloaded embedding model. This belongs in developer tooling, not
  Animo's desktop bundle.
- The project has a history of corrected benchmark claims. Use it because the
  workflow is useful, not because of headline benchmark marketing.
- The MemPalace README explicitly warns about impostor domains. Use only the
  GitHub repository, PyPI package, and `mempalaceofficial.com`.

## Development goals for Animo

Using MemPalace during development should help answer questions like:

- Why did Animo choose XMLUI plus custom React extensions?
- How does the Tauri shell discover the embedded API port?
- What release-signing or installer caveats were already discussed?
- Which files are sensitive when changing time-entry filtering, exports, or
  local-user bootstrap behavior?
- What decisions were made in previous agent sessions but never promoted into
  permanent docs?

It should not:

- upload user or maintainer data to a third-party service;
- index `.env`, local databases, generated bundles, or dependency directories;
- become required for building, testing, developing, or releasing Animo;
- store secrets from MCP config, environment files, or private transcripts.

The operating principle is simple: durable project memory lives in docs and
code; MemPalace is a fast local recall layer that helps the assistant and
maintainer find that memory again.

## Recommended memory structure

Use one MemPalace wing for the Animo repository:

```text
wing: animo
```

Use rooms that mirror durable areas of the project:

```text
architecture
xmlui
rust-api
sqlite
tauri
desktop-release
installers
demo-mode
e2e
decisions
bugs
security
agent-sessions
```

Use the knowledge graph only for facts that benefit from time:

```text
Animo -> uses_frontend -> XMLUI
Animo -> uses_backend -> Rust axum
Animo -> packages_desktop_with -> Tauri 2
Demo mode -> uses -> MSW-style fetch interception
Desktop app -> embeds -> axum API
```

When a fact changes, invalidate the old relationship instead of overwriting the
history. That makes the graph useful when investigating regressions.

## Daily workflow

At the start of a work session:

```sh
mempalace wake-up --wing animo
mempalace search "current release constraints" --wing animo
```

Before touching an area with historical decisions:

```sh
mempalace search "why React 18 override" --wing animo --room xmlui
mempalace search "Tauri embedded API port" --wing animo --room tauri
mempalace search "installer signing warnings" --wing animo --room desktop-release
```

After finishing meaningful work, file a short summary through MCP or CLI. Good
memory entries are concise but concrete:

```text
Room: decisions
Content: On 2026-05-27 we decided MemPalace is only for Animo developer
workflow, not app runtime integration. Keep it optional and local.
Source: docs/mempalace-integration.md
```

Use MemPalace to preserve:

- architectural decisions and tradeoffs;
- known XMLUI quirks and workarounds;
- release/build constraints;
- debugging trails that took time to discover;
- cross-file relationships that are easy to forget;
- agent-session summaries that are not yet worth permanent docs.

Do not use MemPalace as the only place for:

- canonical architecture decisions;
- release procedures;
- user-facing behavior;
- security requirements;
- anything another contributor must know without your local palace.

Those belong in repo documentation, comments, tests, or code.

## Setup for local development

Install MemPalace in an isolated tool environment:

```sh
uv tool install mempalace
```

This repo includes a small helper script that keeps the wing name consistent,
uses a dedicated Animo palace at `~/.mempalace-animo`, and centralizes the
safety reminder:

```sh
scripts/mempalace-animo.sh help
```

Initialize a palace from the Animo repo:

```sh
scripts/mempalace-animo.sh init
```

Mine the repository, keeping the wing explicit:

```sh
scripts/mempalace-animo.sh mine-dry-run
scripts/mempalace-animo.sh mine
```

Before running `mine`, inspect `mine-dry-run` output and confirm that
MemPalace respects `.gitignore`. The Animo repo contains local config and local
databases that must not be mined. Do not include:

```text
.env
.mcp.json
*.db
node_modules/
target/
app/dist/
website/dist/
desktop/target/
```

If a local file must be included despite `.gitignore`, use
`--include-ignored` only with a narrow path and only after checking that it
contains no secrets.

Useful commands:

```sh
scripts/mempalace-animo.sh status
scripts/mempalace-animo.sh search "Tauri embedded API port"
scripts/mempalace-animo.sh search "XMLUI React 18 override"
scripts/mempalace-animo.sh wake-up
```

If `status` fails with a ChromaDB traceback ending in `too many SQL variables`,
the palace is probably large enough to hit ChromaDB's SQLite variable limit in
MemPalace's status aggregation. This does not necessarily mean the palace is
unusable. Try `wake-up` or a targeted `search`; if those fail too, run
`mempalace repair`.

To use a custom palace directory or wing name:

```sh
MEMPALACE_PALACE="$HOME/.mempalace-animo-experiment" scripts/mempalace-animo.sh status
MEMPALACE_WING="animo-local" scripts/mempalace-animo.sh mine-dry-run
```

## MCP integration

For Animo development, MCP is the most useful integration path because it lets
Codex/Claude search and file memory while staying inside the normal coding
conversation. The repo's `.mcp.example.json` includes an optional `mempalace`
server:

```json
{
  "mcpServers": {
    "mempalace": {
      "type": "stdio",
      "command": "./scripts/mempalace-mcp.sh",
      "args": []
    }
  }
}
```

Copy that entry into your local ignored `.mcp.json` if you want the agent to
use MemPalace in this workspace. The wrapper resolves the Python environment
from the installed `mempalace` CLI, which works better for pipx/uv-style installs
than assuming `python -m mempalace.mcp_server` is globally importable. It also
uses the dedicated Animo palace at `~/.mempalace-animo` by default.

If the wrapper does not fit your local install, prefer the command printed by:

```sh
mempalace mcp
```

Recommended agent behavior:

- Start Animo sessions by calling MemPalace status or `wake-up` equivalent.
- Search the `animo` wing before answering questions about old decisions.
- Store durable decisions, tradeoffs, and debugging conclusions.
- Avoid filing raw secrets, local access tokens, or private customer data.
- Prefer permanent repo docs for canonical decisions. MemPalace is recall, not
  the source of truth.
- When an answer depends on recalled context, mention that it came from local
  memory and check the repo before changing code.

## Hook integration for long sessions

MemPalace documents hooks for save checkpoints and pre-compaction. For Animo
development, hooks are useful when sessions are long and context-heavy, as long
as they stay personal and local.

Good use:

- save important decisions every N human messages;
- force a pre-compaction save before a long coding session loses context;
- keep agent diary entries per project.

Avoid:

- committing hook state;
- adding hooks to required repo setup;
- making CI, release, or pre-commit depend on MemPalace;
- indexing generated transcripts without checking for secrets.

If hooks are adopted, keep them in a local, ignored config first. A sanitized
example can be promoted later if the workflow proves useful, but the repo should
not require hooks for normal development.

## Knowledge graph usage

Use graph facts for durable relationships:

```text
subject: Animo desktop
predicate: embeds
object: animo-api
valid_from: 2026-05-27
```

```text
subject: Animo frontend
predicate: depends_on
object: React 18.2.0 override
valid_from: 2026-05-27
```

Use drawers for richer context:

- why a decision was made;
- alternatives considered;
- debugging notes;
- migration plans;
- release constraints.

This split keeps the graph small and queryable while preserving real narrative
context in verbatim drawers.

## Suggested personal rollout

1. Pilot locally.
   - Install with `uv tool install mempalace`.
   - Run `scripts/mempalace-animo.sh init`.
   - This creates or updates the dedicated Animo palace at `~/.mempalace-animo`.
   - Mine only repo docs and selected session notes at first.

2. Add a local MCP server.
   - Copy the `mempalace` entry from `.mcp.example.json` into local `.mcp.json`.
   - Use `mempalace mcp` to generate an alternate command if needed.
   - Keep credentials out of both `.mcp.example.json` and memories.
   - Verify search results are useful before enabling write tools in routine
     sessions.

3. Establish filing conventions.
   - Wing: `animo`.
   - Rooms: use the room list in this document.
   - Store decisions in `decisions`, bugs in `bugs`, and agent summaries in
     `agent-sessions`.

4. Backfill important project knowledge.
   - README architecture sections.
   - Install and release docs.
   - XMLUI bug notes.
   - Changelog entries.
   - High-value historical conversations, only after secret review.

5. Make it part of the personal coding loop.
   - Wake up memory at session start.
   - Search memory before changing historically sensitive areas.
   - File a short summary after meaningful implementation or investigation.
   - Promote stable knowledge into repo docs when it becomes broadly useful.

## Where this helps most

High-value Animo areas for MemPalace recall:

- XMLUI behavior, limitations, and extension workarounds.
- Tauri desktop startup and API-port handshake.
- Installer and release-process decisions.
- Demo mode and mocked API behavior.
- Time-entry filtering, reports, and export behavior.
- SQLite schema and migration decisions.
- Playwright trace investigation notes.
- Local-user/bootstrap assumptions.

Low-value areas:

- generated build output;
- dependency directories;
- one-off command output;
- secrets or local credentials;
- large raw databases.

## Security and privacy checklist

- Never mine `.env`, `.mcp.json`, local database files, build output, or
  dependency directories.
- Treat transcripts as sensitive unless reviewed.
- Keep `~/.mempalace` out of the repository.
- Do not paste MCP API keys into memories.
- Prefer dry runs before mining new directories.
- Use official MemPalace sources only.
- Re-run `mempalace sync` or equivalent cleanup if source files are deleted or
  become gitignored.

## Recommendation

Adopt MemPalace experimentally as a local developer-memory layer for Animo.
Keep it optional, personal, and outside build/test/release paths. The practical
target is simple: when starting a new session, Codex/Claude should be able to
recover relevant Animo history in seconds, then verify against the repo before
making changes.
