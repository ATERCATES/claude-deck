# Group worktrees under their parent repo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group git worktrees as visual children of their parent repo in the Claude Projects sidebar, and ensure every Claude session is counted under exactly one project.

**Architecture:** Server-side, `resolveRepoIdentity()` uses `git rev-parse --git-common-dir` to classify every project directory as standalone or worktree, then `buildProjects()` enriches `CachedProject` with `parentRoot` / `isWorktree` and deduplicates sessions across projects by `sessionId`. Client-side, `ClaudeProjectsSection` groups the flat list by `parentRoot` and renders worktrees indented beneath their parent.

**Tech Stack:** Next.js 15 (App Router), React 19, TanStack Query, TypeScript, `git` CLI, Radix UI, Tailwind.

**Branch:** `feat/group-worktrees-by-parent` (already created from `main`).

**Testing strategy:** This codebase has no unit test runner. Each task ends with (a) `pnpm typecheck`, (b) `pnpm lint`, and (c) a manual verification step executed in the running dev server or via a `curl` request against a known project directory. Commits are frequent, one per task.

---

## File Structure

Files created:

- `src/lib/worktrees.ts` — extend with `resolveRepoIdentity()` and a memoised cache. Also export types.
- `docs/superpowers/specs/2026-04-17-group-worktrees-by-parent-design.md` — already committed with the spec.

Files modified:

- `src/lib/claude/jsonl-cache.ts` — enrich `CachedProject`, dedupe sessions, use repo identity.
- `src/lib/claude/jsonl-reader.ts` — tighten `getSessions()` to filter by `cwd` equality when possible.
- `src/app/api/claude/projects/route.ts` — propagate new fields in the response.
- `src/data/claude/queries.ts` — extend `ClaudeProject` type with `parentRoot` and `isWorktree`.
- `src/components/ClaudeProjects/ClaudeProjectsSection.tsx` — group rendering.
- `src/components/ClaudeProjects/ClaudeProjectCard.tsx` — accept `isWorktree` and render a `GitBranch` badge.

---

### Task 1: Add `resolveRepoIdentity` helper with in-memory cache

**Files:**

- Modify: `src/lib/worktrees.ts`

- [ ] **Step 1: Add the helper and its cache**

Append to `src/lib/worktrees.ts`:

```ts
export interface RepoIdentity {
  repoRoot: string;
  parentRoot: string | null;
  isWorktree: boolean;
}

const repoIdentityCache = new Map<string, RepoIdentity | null>();

/**
 * Detect whether a directory is a plain git repo or a worktree, and
 * return its parent repo root when applicable. Returns null if git is
 * unavailable or the path is not a git working tree.
 */
export async function resolveRepoIdentity(
  cwd: string
): Promise<RepoIdentity | null> {
  const cached = repoIdentityCache.get(cwd);
  if (cached !== undefined) return cached;

  try {
    const [{ stdout: topStdout }, { stdout: commonStdout }] = await Promise.all(
      [
        execAsync(
          `git -C "${cwd}" rev-parse --path-format=absolute --show-toplevel`,
          { timeout: 2000 }
        ),
        execAsync(
          `git -C "${cwd}" rev-parse --path-format=absolute --git-common-dir`,
          { timeout: 2000 }
        ),
      ]
    );

    const repoRoot = topStdout.trim();
    const commonDir = commonStdout.trim();
    if (!repoRoot || !commonDir) {
      repoIdentityCache.set(cwd, null);
      return null;
    }

    const standaloneGitDir = path.join(repoRoot, ".git");
    const isWorktree = commonDir !== standaloneGitDir;
    const parentRoot = isWorktree ? commonDir.replace(/\/\.git\/?$/, "") : null;

    const identity: RepoIdentity = { repoRoot, parentRoot, isWorktree };
    repoIdentityCache.set(cwd, identity);
    return identity;
  } catch {
    repoIdentityCache.set(cwd, null);
    return null;
  }
}

/**
 * Clear the resolveRepoIdentity cache. Called when the Claude projects
 * cache is invalidated.
 */
export function invalidateRepoIdentityCache(): void {
  repoIdentityCache.clear();
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Start a node REPL to sanity-check resolution against a known worktree:

```bash
pnpm exec tsx -e '
import { resolveRepoIdentity } from "./src/lib/worktrees";
resolveRepoIdentity(process.cwd()).then((r) => console.log(JSON.stringify(r, null, 2)));
'
```

Expected: an object with `repoRoot = <current repo absolute path>`, `parentRoot = null`, `isWorktree = false`. If you have a worktree at hand, re-run with its path as `process.cwd()` and expect `isWorktree: true` and a non-null `parentRoot`.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/worktrees.ts
git commit -m "feat(worktrees): add resolveRepoIdentity helper"
```

---

### Task 2: Enrich `CachedProject` with `parentRoot` / `isWorktree`

**Files:**

- Modify: `src/lib/claude/jsonl-cache.ts`

- [ ] **Step 1: Extend the type and `buildProjects()`**

Replace the body of `src/lib/claude/jsonl-cache.ts` with:

```ts
import { listSessions as sdkListSessions } from "@anthropic-ai/claude-agent-sdk";
import {
  extractProjectDirectory,
  getSessions,
  getClaudeProjectNames,
  type SessionInfo,
} from "./jsonl-reader";
import { resolveRepoIdentity, invalidateRepoIdentityCache } from "../worktrees";

export interface CachedProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
  parentRoot: string | null;
  isWorktree: boolean;
}

function deriveDisplayName(directory: string | null, encoded: string): string {
  if (directory) {
    const parts = directory.split("/");
    return parts[parts.length - 1] || directory;
  }
  const decoded = encoded.replace(/^-/, "/").replace(/-/g, "/");
  const parts = decoded.split("/");
  return parts[parts.length - 1] || decoded;
}

let projectsData: CachedProject[] | null = null;
let projectsBuilding: Promise<CachedProject[]> | null = null;

async function buildProjects(): Promise<CachedProject[]> {
  const projectNames = getClaudeProjectNames();

  const allSessions = await sdkListSessions();
  const cwdToDir = new Map<string, string>();
  for (const s of allSessions) {
    if (s.cwd) {
      const encoded = s.cwd.replace(/\//g, "-");
      if (!cwdToDir.has(encoded)) cwdToDir.set(encoded, s.cwd);
    }
  }

  const projectsWithDir = await Promise.all(
    projectNames.map(async (name) => {
      const directory =
        cwdToDir.get(name) || (await extractProjectDirectory(name));
      return { name, directory };
    })
  );

  // Resolve repo identity for every project that has a directory.
  const identities = await Promise.all(
    projectsWithDir.map(({ directory }) =>
      directory ? resolveRepoIdentity(directory) : Promise.resolve(null)
    )
  );

  // Deduplicate sessions across projects: a session belongs to the
  // project whose directory equals its cwd. Sessions whose cwd does
  // not match any project directory are attached to the project whose
  // encoded name matches the SDK's default encoding of that cwd.
  const directoryToName = new Map<string, string>();
  for (const { name, directory } of projectsWithDir) {
    if (directory) directoryToName.set(directory, name);
  }

  const sessionsByProject = new Map<string, typeof allSessions>();
  const seenSessionIds = new Set<string>();

  for (const s of allSessions) {
    if (seenSessionIds.has(s.sessionId)) continue;
    seenSessionIds.add(s.sessionId);

    let target: string | null = null;
    if (s.cwd && directoryToName.has(s.cwd)) {
      target = directoryToName.get(s.cwd)!;
    } else if (s.cwd) {
      const encoded = s.cwd.replace(/\//g, "-");
      if (projectsWithDir.some((p) => p.name === encoded)) target = encoded;
    }
    if (!target) continue;

    const list = sessionsByProject.get(target) ?? [];
    list.push(s);
    sessionsByProject.set(target, list);
  }

  return projectsWithDir.map(({ name, directory }, idx) => {
    const identity = identities[idx];
    const projectSessions = (sessionsByProject.get(name) ?? []).sort(
      (a, b) => b.lastModified - a.lastModified
    );
    return {
      name,
      directory,
      displayName: deriveDisplayName(directory, name),
      sessionCount: projectSessions.length,
      lastActivity: projectSessions[0]
        ? new Date(projectSessions[0].lastModified).toISOString()
        : null,
      parentRoot: identity?.parentRoot ?? null,
      isWorktree: identity?.isWorktree ?? false,
    };
  });
}

export async function getCachedProjects(): Promise<CachedProject[]> {
  if (projectsData) return projectsData;
  if (projectsBuilding) return projectsBuilding;

  projectsBuilding = buildProjects();
  try {
    projectsData = await projectsBuilding;
  } finally {
    projectsBuilding = null;
  }
  return projectsData;
}

export async function getCachedSessions(
  projectName: string
): Promise<SessionInfo[]> {
  const { sessions } = await getSessions(projectName, 200, 0);
  return sessions;
}

export function invalidateAllProjects(): void {
  projectsData = null;
  invalidateRepoIdentityCache();
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification via the API**

Start the dev server in another terminal: `pnpm dev`. Then:

```bash
curl -s http://localhost:3011/api/claude/projects | jq '.projects[] | {name, isWorktree, parentRoot, sessionCount}'
```

Expected: response contains the new fields; projects that are ClaudeDeck worktrees (paths under `~/.claude-deck/worktrees/`) show `isWorktree: true` and `parentRoot` pointing to the parent repo. No session count drops to zero for projects that genuinely own sessions.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/jsonl-cache.ts
git commit -m "feat(claude): dedupe sessions per project and expose worktree metadata"
```

---

### Task 3: Align `getSessions()` filter with the new project assignment

**Files:**

- Modify: `src/lib/claude/jsonl-reader.ts`

- [ ] **Step 1: Tighten the filter**

Replace the body of `getSessions()` (lines 143-165) with:

```ts
export async function getSessions(
  projectName: string,
  limit = 20,
  offset = 0
): Promise<{ sessions: SessionInfo[]; total: number }> {
  const dir = await extractProjectDirectory(projectName);
  const sdkSessions = await sdkListSessions(dir ? { dir } : undefined);

  const sessions: SessionInfo[] = sdkSessions
    .filter((s) => !s.summary?.startsWith('{ "'))
    .filter((s) => !dir || !s.cwd || s.cwd === dir)
    .map((s) => ({
      sessionId: s.sessionId,
      summary: s.customTitle || s.summary || "New Session",
      lastActivity: new Date(s.lastModified).toISOString(),
      messageCount: (s.fileSize ?? 0) > 500 ? 3 : 0,
      cwd: s.cwd || dir || null,
    }));

  return {
    sessions: sessions.slice(offset, offset + limit),
    total: sessions.length,
  };
}
```

The new `.filter((s) => !dir || !s.cwd || s.cwd === dir)` drops sessions that physically live in this project folder but whose most recent `cwd` points elsewhere — the typical "resumed from a worktree" case — so they only surface under the project that currently owns them.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the dev server running, expand a project known to have sessions in the sidebar. Expected: the listed sessions match the ones under that project's cwd. If you previously saw the same session under both the parent repo and a worktree, it now appears in exactly one of them (the one whose `directory` equals the session's `cwd`).

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/jsonl-reader.ts
git commit -m "fix(claude): filter getSessions by cwd equality to match project assignment"
```

---

### Task 4: Propagate the new fields through the API and client types

**Files:**

- Modify: `src/app/api/claude/projects/route.ts`
- Modify: `src/data/claude/queries.ts`

- [ ] **Step 1: Update the server response type**

In `src/app/api/claude/projects/route.ts` replace the `ClaudeProject` interface and the mapping block:

```ts
export interface ClaudeProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
  hidden: boolean;
  parentRoot: string | null;
  isWorktree: boolean;
}
```

The existing `projects.map` already spreads `...p`, so the new fields are carried automatically — no code change needed inside the mapper.

- [ ] **Step 2: Update the client type**

In `src/data/claude/queries.ts` replace the `ClaudeProject` interface:

```ts
export interface ClaudeProject {
  name: string;
  directory: string;
  displayName: string;
  sessionCount: number;
  lastActivity: string;
  hidden: boolean;
  parentRoot: string | null;
  isWorktree: boolean;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors. If a consumer relied on the old shape, resolve the error by passing the new fields (they are optional from the consumer's perspective — existing logic ignores them).

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/claude/projects/route.ts src/data/claude/queries.ts
git commit -m "feat(claude): expose parentRoot and isWorktree to the client"
```

---

### Task 5: Visual badge for worktree projects

**Files:**

- Modify: `src/components/ClaudeProjects/ClaudeProjectCard.tsx`

- [ ] **Step 1: Swap folder icon for worktrees**

At the top of `ClaudeProjectCard.tsx`, change the lucide-react import to include `GitBranch`:

```tsx
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  GitBranch,
  Plus,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
```

Then replace the `<FolderOpen ... />` line inside `cardContent` with:

```tsx
{
  project.isWorktree ? (
    <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
  ) : (
    <FolderOpen className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the dev server running, open the sidebar. Expected: projects that are worktrees (e.g. ClaudeDeck-managed ones under `~/.claude-deck/worktrees/`) show a green `GitBranch` icon instead of the folder. Regular projects keep the folder icon.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ClaudeProjects/ClaudeProjectCard.tsx
git commit -m "feat(projects): mark worktree projects with a branch icon"
```

---

### Task 6: Group worktrees under their parent in the sidebar

**Files:**

- Modify: `src/components/ClaudeProjects/ClaudeProjectsSection.tsx`

- [ ] **Step 1: Implement grouping**

Replace the body of `src/components/ClaudeProjects/ClaudeProjectsSection.tsx` with:

```tsx
"use client";

import { useState, useMemo } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  useClaudeProjectsQuery,
  useClaudeUpdates,
  type ClaudeProject,
} from "@/data/claude";
import { ClaudeProjectCard } from "./ClaudeProjectCard";

interface ClaudeProjectsSectionProps {
  onSelectSession?: (
    sessionId: string,
    directory: string,
    summary: string,
    projectName: string
  ) => void;
  onNewSession?: (cwd: string, projectName: string) => void;
}

function ProjectsSkeleton() {
  return (
    <div className="space-y-1 px-2 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="bg-muted h-4 w-4 animate-pulse rounded" />
          <div
            className="bg-muted h-3.5 animate-pulse rounded"
            style={{ width: `${60 + Math.random() * 60}px` }}
          />
          <div className="flex-1" />
          <div className="bg-muted h-3 w-4 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

interface ProjectGroup {
  parent: ClaudeProject | null; // null = orphan worktree or non-worktree with unseen parent
  children: ClaudeProject[];
}

function groupByParent(projects: ClaudeProject[]): ProjectGroup[] {
  const byDirectory = new Map<string, ClaudeProject>();
  for (const p of projects) {
    if (p.directory) byDirectory.set(p.directory, p);
  }

  const groups: ProjectGroup[] = [];
  const consumed = new Set<string>();

  // First pass: every non-worktree project becomes a group anchor.
  for (const p of projects) {
    if (p.isWorktree) continue;
    groups.push({ parent: p, children: [] });
    consumed.add(p.name);
  }

  // Second pass: attach worktrees to their parent if present; otherwise
  // render them as their own top-level group.
  for (const p of projects) {
    if (!p.isWorktree) continue;
    const parent = p.parentRoot ? byDirectory.get(p.parentRoot) : undefined;
    if (parent && consumed.has(parent.name)) {
      const group = groups.find((g) => g.parent?.name === parent.name);
      group?.children.push(p);
    } else {
      groups.push({ parent: p, children: [] });
      consumed.add(p.name);
    }
  }

  return groups;
}

export function ClaudeProjectsSection({
  onSelectSession,
  onNewSession,
}: ClaudeProjectsSectionProps) {
  useClaudeUpdates();
  const { data: projects = [], isPending } = useClaudeProjectsQuery();
  const [showHidden, setShowHidden] = useState(false);

  const groups = useMemo(() => {
    const visible = showHidden ? projects : projects.filter((p) => !p.hidden);
    return groupByParent(visible);
  }, [projects, showHidden]);

  const hiddenCount = projects.filter((p) => p.hidden).length;

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-muted-foreground text-xs font-medium">
          Projects
        </span>
        <div className="flex items-center gap-1">
          {isPending && (
            <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
          )}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      </div>

      {isPending && projects.length === 0 && <ProjectsSkeleton />}

      <div className="space-y-0.5">
        {groups.map((group) => (
          <div key={group.parent?.name ?? "orphan"}>
            {group.parent && (
              <ClaudeProjectCard
                project={group.parent}
                showHidden={showHidden}
                onSelectSession={onSelectSession}
                onNewSession={onNewSession}
              />
            )}
            {group.children.length > 0 && (
              <div className="border-border/30 ml-3 space-y-0.5 border-l pl-1.5">
                {group.children.map((child) => (
                  <ClaudeProjectCard
                    key={child.name}
                    project={child}
                    showHidden={showHidden}
                    onSelectSession={onSelectSession}
                    onNewSession={onNewSession}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the dev server running, confirm in the sidebar:

- A repo that has ClaudeDeck worktrees renders once at the top level, with each worktree nested underneath and prefixed by the indented left border.
- Worktrees whose parent repo is not in the list (never opened in Claude) render at the top level with the `GitBranch` badge.
- Expanding a parent still shows only its own sessions, and expanding each worktree shows only its own sessions (no duplicates across nodes).

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ClaudeProjects/ClaudeProjectsSection.tsx
git commit -m "feat(projects): group worktrees beneath their parent repo in the sidebar"
```

---

### Task 7: Final verification sweep

**Files:** none modified.

- [ ] **Step 1: Full typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both commands succeed with no output beyond the banner lines.

- [ ] **Step 2: Manual smoke test across surfaces**

With `pnpm dev` running:

- Expand a parent project → sessions listed belong to it.
- Expand one of its worktrees → sessions listed belong to the worktree only.
- Kill an active session from the Active Sessions panel (regression check for the previous feature).
- Hover over long project or session names → tooltip shows the full text (regression check for the tooltips feature).
- Hide then show a worktree via its context menu → visibility toggles correctly.

- [ ] **Step 3: No commit needed**

This task is verification only. If any check fails, open a fix task and iterate.
