# Group worktrees under their parent repo — Design

**Status:** approved in conversation on 2026-04-17.

## Problem

ClaudeDeck lists one sidebar entry per Claude Code project directory
(`~/.claude/projects/<encoded-path>/`). A git worktree has a distinct
`cwd` so Claude Code creates a separate directory for it, producing a
second "project" entry in the sidebar. The user perceives the worktree
as the same logical project.

Two concrete defects follow from this:

1. **Inflated project list** — each ClaudeDeck-managed worktree shows
   as a peer of the parent repo with no visual relation.
2. **Duplicated sessions** — the session count and the expanded list
   can double-count the same `sessionId` across the parent entry and
   one or more worktree entries, because `buildProjects()` in
   `src/lib/claude/jsonl-cache.ts` filters by `s.cwd === directory`
   against a session's single `cwd` value while the JSONL file may
   live in either directory, and `getSessions()` in
   `src/lib/claude/jsonl-reader.ts` uses a different filtering
   criterion (SDK `listSessions({ dir })` — physical folder).

## Goal

Present worktrees as **children of their parent repo** in the sidebar,
with sessions attached to exactly one project (no duplicates).

## Non-goals

- Deep auto-detection for foreign worktrees (those created outside
  ClaudeDeck). Best-effort via `git rev-parse --git-common-dir`; if it
  fails we fall back to flat rendering.
- Merging sessions across worktrees into a unified view.
- Any change to session creation or deletion flows.

## Architecture

### Repo identity resolution

New helper `resolveRepoIdentity(cwd)` in `src/lib/worktrees.ts`.

- Runs `git -C <cwd> rev-parse --git-common-dir` (timeout 2 s).
- If the common dir equals `<cwd>/.git` → standalone repo.
- Otherwise → worktree. The parent repo root is the directory
  containing the common dir (typically the repo where `.git` lives).
- Returns `{ repoRoot, parentRoot, isWorktree }` or `null` on any
  error (non-git dir, missing path, git not installed).

Results are cached in-memory keyed by `cwd`, invalidated together with
the existing `projectsData` cache in `jsonl-cache.ts`.

### Project enrichment

`CachedProject` gains:

```ts
parentRoot: string | null; // absolute path of the parent repo, or null
isWorktree: boolean; // true if this project is a git worktree
```

`buildProjects()`:

1. Resolves `repoIdentity` for each project's `directory`.
2. Populates `parentRoot` / `isWorktree`.
3. **Deduplicates sessions across projects** by `sessionId` before
   computing `sessionCount` and `lastActivity`. A session is assigned
   to the project whose `directory` equals its `s.cwd`. If no
   project matches (stale `cwd`), it falls back to the project whose
   folder physically contains the JSONL (resolved via the SDK's
   default encoding).

### API shape

`GET /api/claude/projects` response gains the two new fields per
project. Existing consumers that only read `name`, `directory`,
`displayName`, `sessionCount`, `lastActivity`, `hidden` stay working.

### Session listing unification

`getSessions(projectName)` in `jsonl-reader.ts` adds a post-filter on
the SDK result: only keep `s.cwd === dir` (where `dir` is the resolved
project directory) unless `s.cwd` is null. This aligns both flows
(projects list and expanded sessions) on the same criterion and
matches what the UI already visually groups by.

### Sidebar rendering

`ClaudeProjectsSection.tsx`:

1. Build a grouping map `parentRoot → ClaudeProject[]` from the flat
   list.
2. Render groups:
   - If a group has exactly one project and no worktrees → render as
     today.
   - If a group has worktrees → render parent first, then indented
     children below, with a small `GitBranch` icon as badge.
   - Orphan worktrees (no matching parent in the list) render at the
     top level with the badge only.

Nesting is purely visual; `ClaudeProjectCard` is reused. The parent
visual already has an expand chevron — we do not add another level of
expansion, the worktree children render inline under it.

## Data migration

None. `CachedProject` lives in-memory and is rebuilt on demand.

## Edge cases

- `git` binary missing → `resolveRepoIdentity` returns `null`; project
  is rendered flat.
- Parent repo not in the project list (never opened in Claude) →
  worktree renders with the badge at the top level, no grouping.
- Multiple worktrees of the same parent → all render as siblings under
  the same parent node.
- The parent repo is itself hidden by the user → we still group under
  it, but the hidden filter decides whether the parent visually
  appears.
