# Worktree UI Improvements — Implementation Plan

> Source spec (approved): `docs/superpowers/specs/2026-04-24-worktree-ui-improvements-design.md` (commit `2d2c3eb`).

## Context

The ClaudeDeck sidebar currently groups worktrees under their parent project visually but has three UX gaps:

1. **The parent's chevron cannot collapse worktree children** — they stay on screen even when the parent "folds".
2. **Worktrees can only be created from UI; deleting requires dropping to the CLI.** `deleteWorktree()` already exists in `src/lib/worktrees.ts` but no `DELETE` endpoint exposes it.
3. **No quick actions on a worktree card** (open in editor, copy path).

This plan implements Phase 1 (collapse structure + persistence) and Phase 2 (delete + open-in-editor + copy path) in a single integrated effort. Phases 3 (git-status badges, abandoned indicator, tooltips) and 4 (rename) are explicitly out of scope for this plan.

## Approach (high level)

- **`ClaudeProjectCard` becomes self-sufficient** — it receives `worktreeChildren` as a prop and renders two independently-collapsible sub-sections ("Sesiones", "Worktrees") plus its own master collapse.
- **Persistence** lives in a new `useProjectExpansion(projectName)` hook backed by `localStorage`.
- **Context menu** on worktree cards gains Open in VS Code / Cursor / Finder, Copy path, Delete. Availability of editors is detected server-side at startup via a new `src/lib/external-editors.ts`.
- **Delete flow** uses a new `DeleteWorktreeDialog` that first fetches `GET /api/worktrees/status?path=…` to show dirty / active-session warnings, then calls a new `DELETE /api/worktrees` that reuses the existing `deleteWorktree()` library function.
- **Zero new library code** for core deletion — reuse what exists. **Zero new dialogs** for worktree creation — the existing `NewClaudeSessionDialog` already auto-enables the worktree toggle when the target is a git repo, so a second `+` in the Worktrees subsection just calls the same `onNewSession` with the same args.

## Critical files (created or modified)

**Created:**

- `src/hooks/useProjectExpansion.ts` — three-boolean expansion state + localStorage persistence.
- `src/lib/external-editors.ts` — detect `code` / `cursor` binaries in `PATH`, cache in module scope.
- `src/app/api/external-editors/route.ts` — `GET` returns `{ vscode, cursor, finder }`.
- `src/app/api/open/route.ts` — `POST { path, editor }`, validates path and spawns the editor.
- `src/app/api/worktrees/status/route.ts` — `GET ?path=…`, returns `{ dirty, branchName, activeSessions, isClaudeDeckManaged }`.
- `src/components/ClaudeProjects/DeleteWorktreeDialog.tsx` — confirmation dialog with warnings and "delete branch" checkbox.

**Modified:**

- `src/components/ClaudeProjects/ClaudeProjectCard.tsx` — accept `worktreeChildren`, render sub-sections, extend context menu.
- `src/components/ClaudeProjects/ClaudeProjectsSection.tsx` — stop rendering children outside the card, pass them as a prop.
- `src/app/api/worktrees/route.ts` — add `DELETE` handler.
- `src/data/claude/queries.ts` — add `useExternalEditors`, `useOpenInEditor`, `useWorktreeStatus`, `useDeleteWorktree`.

## Existing code to reuse (do not reimplement)

- `deleteWorktree(worktreePath, projectPath, deleteBranch)` at `src/lib/worktrees.ts:166` — the delete library function. Reuse as-is from the new `DELETE` route.
- `isClaudeDeckWorktree(path)` at `src/lib/worktrees.ts:281` — path safety check for `/api/open` and `/api/worktrees/status`.
- `getGitStatus(workingDir)` at `src/lib/git-status.ts:44` — used to compute `dirty`. `(status.staged.length + status.unstaged.length + status.untracked.length) > 0`.
- `getCachedProjects()` at `src/lib/claude/jsonl-cache.ts:131` — used inside `/api/open` to validate that a path belongs to a known project (when not inside `WORKTREES_DIR`) and inside `/api/worktrees/status` to count active sessions.
- `invalidateAllProjects()` at `src/lib/claude/jsonl-cache.ts:162` — call after `DELETE` succeeds so sidebar refreshes.
- `sonner.toast` — already configured app-wide via `src/app/layout.tsx:3`. Use `toast.success`, `toast.error`.
- Existing `<ContextMenu>` primitives in `src/components/ui/context-menu.tsx` — `ContextMenuSeparator` available for section dividers.

## File-by-file changes

### 1. `src/hooks/useProjectExpansion.ts` (new)

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export interface ProjectExpansion {
  master: boolean;
  sessions: boolean;
  worktrees: boolean;
}

const STORAGE_PREFIX = "claudedeck:expanded:";
const DEFAULT: ProjectExpansion = {
  master: false,
  sessions: false,
  worktrees: false,
};

function read(projectName: string): ProjectExpansion {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + projectName);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      master: Boolean(parsed.master),
      sessions: Boolean(parsed.sessions),
      worktrees: Boolean(parsed.worktrees),
    };
  } catch {
    return DEFAULT;
  }
}

function write(projectName: string, value: ProjectExpansion): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + projectName,
      JSON.stringify(value)
    );
  } catch {
    // quota / disabled storage — silently ignore
  }
}

export function useProjectExpansion(projectName: string) {
  const [expansion, setExpansion] = useState<ProjectExpansion>(DEFAULT);

  useEffect(() => {
    setExpansion(read(projectName));
  }, [projectName]);

  const update = useCallback(
    (patch: Partial<ProjectExpansion>) => {
      setExpansion((prev) => {
        const next = { ...prev, ...patch };
        write(projectName, next);
        return next;
      });
    },
    [projectName]
  );

  return {
    expansion,
    toggleMaster: () => update({ master: !expansion.master }),
    toggleSessions: () => update({ sessions: !expansion.sessions }),
    toggleWorktrees: () => update({ worktrees: !expansion.worktrees }),
  };
}
```

### 2. `src/components/ClaudeProjects/ClaudeProjectCard.tsx` (rewrite)

Key changes:

- Add prop `worktreeChildren: ClaudeProject[]` (default `[]`).
- Replace `useState(expanded)` with `useProjectExpansion(project.name)`.
- Split the body into a master row + two subsection rows (Sesiones, Worktrees), each rendered conditionally.
- The sessions subsection is hidden if the project has zero sessions AND it is a worktree (inner card rendered as child).
- The worktrees subsection only renders when `worktreeChildren.length > 0` AND `!project.isWorktree` (worktrees don't contain other worktrees in this UI).
- Context menu items for worktree cards: Open in VS Code / Cursor / Finder (conditional on availability), Copy path, separator, Delete worktree…, separator, Hide/Show (existing).

Full replacement content (exact file):

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  GitBranch,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  Copy,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TruncatedText } from "@/components/ui/truncated-text";
import { ClaudeSessionCard } from "./ClaudeSessionCard";
import { DeleteWorktreeDialog } from "./DeleteWorktreeDialog";
import {
  useClaudeSessionsQuery,
  useHideItem,
  useUnhideItem,
  useExternalEditors,
  useOpenInEditor,
} from "@/data/claude";
import { useProjectExpansion } from "@/hooks/useProjectExpansion";
import type { ClaudeProject } from "@/data/claude";

interface ClaudeProjectCardProps {
  project: ClaudeProject;
  worktreeChildren?: ClaudeProject[];
  showHidden: boolean;
  onSelectSession?: (
    sessionId: string,
    directory: string,
    summary: string,
    projectName: string
  ) => void;
  onNewSession?: (cwd: string, projectName: string) => void;
}

export function ClaudeProjectCard({
  project,
  worktreeChildren = [],
  showHidden,
  onSelectSession,
  onNewSession,
}: ClaudeProjectCardProps) {
  const { expansion, toggleMaster, toggleSessions, toggleWorktrees } =
    useProjectExpansion(project.name);
  const { data: sessionsData, isPending: isSessionsPending } =
    useClaudeSessionsQuery(
      expansion.master && expansion.sessions ? project.name : null
    );
  const hideItem = useHideItem();
  const unhideItem = useUnhideItem();
  const { data: editors } = useExternalEditors();
  const openInEditor = useOpenInEditor();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const sessions = sessionsData?.sessions || [];
  const filteredSessions = showHidden
    ? sessions
    : sessions.filter((s) => !s.hidden);

  const hasWorktrees = worktreeChildren.length > 0 && !project.isWorktree;
  const sessionCount = project.sessionCount;
  const worktreeCount = worktreeChildren.length;

  const handleHideProject = () =>
    hideItem.mutate({ itemType: "project", itemId: project.name });
  const handleUnhideProject = () =>
    unhideItem.mutate({ itemType: "project", itemId: project.name });

  const handleCopyPath = async () => {
    if (!project.directory) return;
    try {
      await navigator.clipboard.writeText(project.directory);
      toast.success("Path copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const handleOpenInEditor = (editor: "vscode" | "cursor" | "finder") => {
    if (!project.directory) return;
    openInEditor.mutate({ path: project.directory, editor });
  };

  const countLabel = project.isWorktree
    ? `${sessionCount}`
    : hasWorktrees
      ? `${sessionCount} ses · ${worktreeCount} wt`
      : `${sessionCount}`;

  const menuContent = (
    <>
      {project.isWorktree && (
        <>
          {editors?.vscode && (
            <ContextMenuItem onClick={() => handleOpenInEditor("vscode")}>
              <ExternalLink className="mr-2 h-3 w-3" />
              Abrir en VS Code
            </ContextMenuItem>
          )}
          {editors?.cursor && (
            <ContextMenuItem onClick={() => handleOpenInEditor("cursor")}>
              <ExternalLink className="mr-2 h-3 w-3" />
              Abrir en Cursor
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => handleOpenInEditor("finder")}>
            <ExternalLink className="mr-2 h-3 w-3" />
            Abrir en Finder
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyPath}>
            <Copy className="mr-2 h-3 w-3" />
            Copiar path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-3 w-3" />
            Eliminar worktree…
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {project.hidden ? (
        <ContextMenuItem onClick={handleUnhideProject}>
          <Eye className="mr-2 h-3 w-3" />
          Mostrar
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={handleHideProject}>
          <EyeOff className="mr-2 h-3 w-3" />
          Ocultar
        </ContextMenuItem>
      )}
    </>
  );

  const masterRow = (
    <div
      onClick={toggleMaster}
      className={cn(
        "group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        "min-h-[36px] md:min-h-[28px]",
        "hover:bg-accent/50",
        project.hidden && "opacity-40"
      )}
    >
      <button className="flex-shrink-0 p-0.5">
        {expansion.master ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        )}
      </button>
      {project.isWorktree ? (
        <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
      ) : (
        <FolderOpen className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
      )}
      <TruncatedText
        text={project.displayName}
        className="min-w-0 flex-1 text-sm font-medium"
      />
      <span className="text-muted-foreground flex-shrink-0 text-[10px]">
        {countLabel}
      </span>
      {onNewSession && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 flex-shrink-0 opacity-100 md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onNewSession(project.directory || "~", project.name);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 flex-shrink-0 opacity-100 md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          if (project.hidden) handleUnhideProject();
          else handleHideProject();
        }}
      >
        {project.hidden ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );

  return (
    <div className="space-y-0.5">
      <ContextMenu>
        <ContextMenuTrigger asChild>{masterRow}</ContextMenuTrigger>
        <ContextMenuContent>{menuContent}</ContextMenuContent>
      </ContextMenu>

      {expansion.master && (
        <div className="border-border/30 ml-3 space-y-0.5 border-l pl-1.5">
          {/* Sesiones subsection */}
          <div
            onClick={toggleSessions}
            className="hover:bg-accent/30 flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs"
          >
            {expansion.sessions ? (
              <ChevronDown className="text-muted-foreground h-3 w-3" />
            ) : (
              <ChevronRight className="text-muted-foreground h-3 w-3" />
            )}
            <span className="text-muted-foreground font-medium">
              Sesiones ({sessionCount})
            </span>
          </div>
          {expansion.sessions && (
            <div className="space-y-px pl-3">
              {isSessionsPending ? (
                <div className="flex items-center gap-2 px-2 py-2">
                  <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                  <span className="text-muted-foreground text-xs">
                    Loading sessions...
                  </span>
                </div>
              ) : filteredSessions.length === 0 ? (
                <p className="text-muted-foreground px-2 py-2 text-xs">
                  No sessions
                </p>
              ) : (
                filteredSessions.map((session) => (
                  <ClaudeSessionCard
                    key={session.sessionId}
                    session={session}
                    projectName={project.name}
                    onSelect={onSelectSession}
                    onHide={() =>
                      hideItem.mutate({
                        itemType: "session",
                        itemId: session.sessionId,
                      })
                    }
                    onUnhide={() =>
                      unhideItem.mutate({
                        itemType: "session",
                        itemId: session.sessionId,
                      })
                    }
                  />
                ))
              )}
            </div>
          )}

          {/* Worktrees subsection */}
          {hasWorktrees && (
            <>
              <div
                onClick={toggleWorktrees}
                className="hover:bg-accent/30 group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs"
              >
                {expansion.worktrees ? (
                  <ChevronDown className="text-muted-foreground h-3 w-3" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-3 w-3" />
                )}
                <span className="text-muted-foreground flex-1 font-medium">
                  Worktrees ({worktreeCount})
                </span>
                {onNewSession && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewSession(project.directory || "~", project.name);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {expansion.worktrees && (
                <div className="space-y-0.5 pl-3">
                  {worktreeChildren.map((child) => (
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
            </>
          )}
        </div>
      )}

      {showDeleteDialog && (
        <DeleteWorktreeDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          worktree={project}
        />
      )}
    </div>
  );
}
```

### 3. `src/components/ClaudeProjects/ClaudeProjectsSection.tsx` (modify)

Remove the children indentation wrapper; pass `children` into `ClaudeProjectCard` via `worktreeChildren`.

Replace the rendering block (lines 116-138 in the current file) with:

```tsx
<div className="space-y-0.5">
  {groups.map((group) => (
    <ClaudeProjectCard
      key={group.parent.name}
      project={group.parent}
      worktreeChildren={group.children}
      showHidden={showHidden}
      onSelectSession={onSelectSession}
      onNewSession={onNewSession}
    />
  ))}
</div>
```

No changes to `groupByParent` — the grouping logic stays as-is.

### 4. `src/lib/external-editors.ts` (new)

```ts
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ExternalEditorAvailability {
  vscode: boolean;
  cursor: boolean;
  finder: boolean;
}

let cached: ExternalEditorAvailability | null = null;

async function hasBinary(name: string): Promise<boolean> {
  try {
    await execFileAsync("which", [name], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function detectExternalEditors(): Promise<ExternalEditorAvailability> {
  if (cached) return cached;
  const [vscode, cursor] = await Promise.all([
    hasBinary("code"),
    hasBinary("cursor"),
  ]);
  cached = { vscode, cursor, finder: true };
  return cached;
}

export function getNativeOpenCommand(): "open" | "xdg-open" {
  return process.platform === "darwin" ? "open" : "xdg-open";
}
```

### 5. `src/app/api/external-editors/route.ts` (new)

```ts
import { NextResponse } from "next/server";
import { detectExternalEditors } from "@/lib/external-editors";

export async function GET() {
  const editors = await detectExternalEditors();
  return NextResponse.json(editors);
}
```

### 6. `src/app/api/open/route.ts` (new)

```ts
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import {
  detectExternalEditors,
  getNativeOpenCommand,
} from "@/lib/external-editors";
import { isClaudeDeckWorktree } from "@/lib/worktrees";
import { getCachedProjects } from "@/lib/claude/jsonl-cache";

const execFileAsync = promisify(execFile);

type Editor = "vscode" | "cursor" | "finder";

async function isAllowedPath(path: string): Promise<boolean> {
  let resolved: string;
  try {
    resolved = await fs.promises.realpath(path);
  } catch {
    return false;
  }
  if (isClaudeDeckWorktree(resolved)) return true;
  const projects = await getCachedProjects();
  return projects.some((p) => p.directory && p.directory === resolved);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string; editor?: Editor };
    const { path, editor } = body;
    if (!path || !editor) {
      return NextResponse.json(
        { error: "path and editor are required" },
        { status: 400 }
      );
    }
    if (!["vscode", "cursor", "finder"].includes(editor)) {
      return NextResponse.json({ error: "invalid editor" }, { status: 400 });
    }
    if (!(await isAllowedPath(path))) {
      return NextResponse.json({ error: "path not allowed" }, { status: 400 });
    }

    const availability = await detectExternalEditors();
    if (editor === "vscode" && !availability.vscode) {
      return NextResponse.json(
        { error: "vscode not available" },
        { status: 500 }
      );
    }
    if (editor === "cursor" && !availability.cursor) {
      return NextResponse.json(
        { error: "cursor not available" },
        { status: 500 }
      );
    }

    const bin =
      editor === "vscode"
        ? "code"
        : editor === "cursor"
          ? "cursor"
          : getNativeOpenCommand();

    await execFileAsync(bin, [path], { timeout: 5000 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      { error: `open failed: ${message}` },
      { status: 500 }
    );
  }
}
```

### 7. `src/app/api/worktrees/status/route.ts` (new)

```ts
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { isClaudeDeckWorktree } from "@/lib/worktrees";
import { getGitStatus } from "@/lib/git-status";
import { getCachedProjects, getCachedSessions } from "@/lib/claude/jsonl-cache";

const execFileAsync = promisify(execFile);

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  let dirty = false;
  let branchName = "";
  try {
    const status = getGitStatus(path);
    dirty =
      status.staged.length + status.unstaged.length + status.untracked.length >
      0;
    branchName = status.branch;
  } catch {
    // Path may no longer be a git worktree — leave defaults.
  }

  if (!branchName) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
        { timeout: 2000 }
      );
      branchName = stdout.trim();
    } catch {
      // keep empty
    }
  }

  let activeSessions = 0;
  try {
    const projects = await getCachedProjects();
    const match = projects.find((p) => p.directory === path);
    if (match) {
      const sessions = await getCachedSessions(match.name);
      const cutoff = Date.now() - ACTIVE_WINDOW_MS;
      activeSessions = sessions.filter((s) => {
        const ts = new Date(s.lastModified).getTime();
        return ts >= cutoff;
      }).length;
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({
    dirty,
    branchName,
    activeSessions,
    isClaudeDeckManaged: isClaudeDeckWorktree(path),
  });
}
```

Note: `SessionInfo.lastModified` is a number (epoch ms) per `jsonl-reader.ts`. If during implementation the field is actually a Date or ISO string, adjust accordingly — the exact shape must be verified with one look at `SessionInfo` before committing Task 9.

### 8. `src/app/api/worktrees/route.ts` (modify — add DELETE)

Add after the existing `POST` export:

```ts
import { deleteWorktree } from "@/lib/worktrees";
import { invalidateAllProjects } from "@/lib/claude/jsonl-cache";

export async function DELETE(request: NextRequest) {
  try {
    const { worktreePath, projectPath, deleteBranch } = await request.json();
    if (!worktreePath || !projectPath) {
      return NextResponse.json(
        { error: "worktreePath and projectPath are required" },
        { status: 400 }
      );
    }
    await deleteWorktree(worktreePath, projectPath, Boolean(deleteBranch));
    invalidateAllProjects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      { error: `Failed to delete worktree: ${message}` },
      { status: 400 }
    );
  }
}
```

If the existing file only imports `createWorktree`, extend the import to include `deleteWorktree`.

### 9. `src/components/ClaudeProjects/DeleteWorktreeDialog.tsx` (new)

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  useWorktreeStatus,
  useDeleteWorktree,
  type ClaudeProject,
} from "@/data/claude";

interface DeleteWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: ClaudeProject;
}

export function DeleteWorktreeDialog({
  open,
  onOpenChange,
  worktree,
}: DeleteWorktreeDialogProps) {
  const { data: status, isPending } = useWorktreeStatus(
    open ? worktree.directory : null
  );
  const deleteMutation = useDeleteWorktree();
  const [deleteBranch, setDeleteBranch] = useState(true);

  const parentPath = worktree.parentRoot || worktree.directory || "";

  const handleDelete = () => {
    if (!worktree.directory) return;
    deleteMutation.mutate(
      {
        worktreePath: worktree.directory,
        projectPath: parentPath,
        deleteBranch,
      },
      {
        onSuccess: () => {
          toast.success("Worktree eliminado");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message || "No se pudo eliminar");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar worktree</DialogTitle>
          <DialogDescription>
            Esta acción borra la carpeta del worktree y puede borrar la rama
            local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Rama</div>
            <div className="font-mono">
              {status?.branchName || worktree.displayName}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Path</div>
            <div className="font-mono text-xs break-all">
              {worktree.directory}
            </div>
          </div>

          {isPending && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Comprobando estado…
            </div>
          )}

          {status?.dirty && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <span>Tiene cambios sin commitear. Se perderán.</span>
            </div>
          )}

          {!!status?.activeSessions && status.activeSessions > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <span>
                {status.activeSessions} sesión(es) de Claude apuntan a este
                worktree en las últimas 24h.
              </span>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={deleteBranch}
              onChange={(e) => setDeleteBranch(e.target.checked)}
              className="border-border bg-background accent-primary h-4 w-4 rounded"
            />
            Borrar también la rama local
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 10. `src/data/claude/queries.ts` (modify — add hooks)

Append four hooks at the end of the file. Keep `ClaudeProject` type re-exported as-is (already exported from the module).

```ts
export interface ExternalEditorAvailability {
  vscode: boolean;
  cursor: boolean;
  finder: boolean;
}

async function fetchExternalEditors(): Promise<ExternalEditorAvailability> {
  const res = await fetch("/api/external-editors");
  if (!res.ok) throw new Error("Failed to fetch editors");
  return res.json();
}

export function useExternalEditors() {
  return useQuery({
    queryKey: ["external-editors"],
    queryFn: fetchExternalEditors,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useOpenInEditor() {
  return useMutation({
    mutationFn: async ({
      path,
      editor,
    }: {
      path: string;
      editor: "vscode" | "cursor" | "finder";
    }) => {
      const res = await fetch("/api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, editor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to open");
      }
      return res.json();
    },
  });
}

export interface WorktreeStatus {
  dirty: boolean;
  branchName: string;
  activeSessions: number;
  isClaudeDeckManaged: boolean;
}

async function fetchWorktreeStatus(path: string): Promise<WorktreeStatus> {
  const res = await fetch(
    `/api/worktrees/status?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export function useWorktreeStatus(path: string | null) {
  return useQuery({
    queryKey: ["worktree-status", path],
    queryFn: () => fetchWorktreeStatus(path!),
    enabled: !!path,
    staleTime: 10_000,
    retry: false,
  });
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      worktreePath,
      projectPath,
      deleteBranch,
    }: {
      worktreePath: string;
      projectPath: string;
      deleteBranch: boolean;
    }) => {
      const res = await fetch("/api/worktrees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktreePath, projectPath, deleteBranch }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete worktree");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claudeKeys.projects() });
      queryClient.invalidateQueries({ queryKey: claudeKeys.all });
    },
  });
}
```

Also ensure the top-level imports include `useQuery, useMutation, useQueryClient` (already there — line 1).

## Ordered task list (bite-sized, TDD-adapted)

There is no automated test harness in the repo today — no `vitest`/`jest` config, no `*.test.*` files. TDD is adapted to **manual smoke-test each task in the dev server** (`pnpm dev`) before commit. Each task ends with typecheck + lint + manual check + commit.

Commit style: conventional commits (`feat:`, `refactor:`, etc.), no emojis in messages.

### Task 1 — Git worktree for isolated work

- [ ] Create a fresh worktree off `main` under the standard ClaudeDeck worktrees dir:

```bash
git worktree add -b feature/worktree-ui-improvements \
  ~/.claude-deck/worktrees/claude-deck-worktree-ui-improvements main
```

- [ ] `cd` into the worktree.
- [ ] `pnpm install` (in case anything differs).
- [ ] Start dev server (`pnpm dev`, port 3011) in a separate terminal and leave it running for subsequent manual checks.

### Task 2 — `useProjectExpansion` hook

**Files:** Create `src/hooks/useProjectExpansion.ts`.

- [ ] Paste the hook implementation from §1 above.
- [ ] `pnpm typecheck` — expect: no errors.
- [ ] Commit: `feat(sidebar): add useProjectExpansion hook with localStorage persistence`.

### Task 3 — Refactor `ClaudeProjectCard` (sub-sections + master collapse)

**Files:** Rewrite `src/components/ClaudeProjects/ClaudeProjectCard.tsx` with the content from §2 (partial — omit context-menu open/delete entries; they are added in Task 7).

- [ ] Replace file content. For this task, keep the context menu with only Hide/Show (identical to today). Imports for `DeleteWorktreeDialog`, `useExternalEditors`, `useOpenInEditor`, `toast`, `Copy`, `ExternalLink`, `Trash2` are **not yet added**.
- [ ] Also temporarily pass `worktreeChildren?: ClaudeProject[]` as a new optional prop with default `[]`, rendering the "Worktrees (N)" subsection. Recursive `ClaudeProjectCard` render for children is fine.
- [ ] Update `src/components/ClaudeProjects/ClaudeProjectsSection.tsx` (§3) to pass `worktreeChildren={group.children}` and remove the outer indentation wrapper.
- [ ] `pnpm typecheck`, `pnpm lint` — expect: pass.
- [ ] Manual: open the app, pick a project that has worktrees. Verify:
  - Click chevron → master expands; two subsection headers appear with counts.
  - Click "Sesiones" → sessions list appears.
  - Click "Worktrees" → children appear (use `GitBranch` icon).
  - Fully collapse master → both subsections disappear.
  - Reload page → previous expansion state restored.
  - Collapse "Sesiones" but keep "Worktrees" open, reload → only Worktrees remains open.
- [ ] Commit: `feat(sidebar): independently collapsible Sesiones/Worktrees subsections`.

### Task 4 — `src/lib/external-editors.ts` + `GET /api/external-editors`

**Files:** Create `src/lib/external-editors.ts` (§4), create `src/app/api/external-editors/route.ts` (§5).

- [ ] Paste both files.
- [ ] `pnpm typecheck`.
- [ ] Manual: `curl http://localhost:3011/api/external-editors` — expect JSON like `{"vscode":true,"cursor":false,"finder":true}` (varies by machine).
- [ ] Commit: `feat(editors): detect external editors and expose via API`.

### Task 5 — `POST /api/open`

**Files:** Create `src/app/api/open/route.ts` (§6).

- [ ] Paste content.
- [ ] `pnpm typecheck`.
- [ ] Manual (replace `<WT>` with a real worktree absolute path under `~/.claude-deck/worktrees/`):

```bash
curl -X POST http://localhost:3011/api/open \
  -H "Content-Type: application/json" \
  -d '{"path":"<WT>","editor":"finder"}'
```

Expect: Finder opens at that path; response `{"ok":true}`.

- [ ] Manual negative test:

```bash
curl -X POST http://localhost:3011/api/open \
  -H "Content-Type: application/json" \
  -d '{"path":"/tmp/bogus","editor":"finder"}'
```

Expect: `{"error":"path not allowed"}`, HTTP 400.

- [ ] Commit: `feat(editors): POST /api/open with path allowlist`.

### Task 6 — Client hooks for editors

**Files:** Append to `src/data/claude/queries.ts` (first half of §10 — `useExternalEditors`, `useOpenInEditor`, plus the `ExternalEditorAvailability` interface).

- [ ] Paste content.
- [ ] `pnpm typecheck`.
- [ ] Commit: `feat(data): add useExternalEditors and useOpenInEditor hooks`.

### Task 7 — Extend context menu (Open in editor + Copy path)

**Files:** Modify `src/components/ClaudeProjects/ClaudeProjectCard.tsx` — add imports for `useExternalEditors`, `useOpenInEditor`, `toast`, `Copy`, `ExternalLink`, and the `handleCopyPath` / `handleOpenInEditor` handlers. Extend `menuContent` with the worktree-only entries from §2 **except** the Delete entry.

- [ ] Apply the changes.
- [ ] `pnpm typecheck`, `pnpm lint`.
- [ ] Manual: right-click a worktree card. Verify:
  - "Abrir en Finder" present; clicking opens Finder at that path.
  - "Abrir en VS Code" present only if `code` is on PATH.
  - "Copiar path" copies the directory to clipboard (paste elsewhere to verify) and shows a success toast.
  - Right-click a non-worktree project: no new entries, only Hide/Show.
- [ ] Commit: `feat(sidebar): open in editor and copy path context actions for worktrees`.

### Task 8 — `GET /api/worktrees/status`

**Files:** Create `src/app/api/worktrees/status/route.ts` (§7).

- [ ] Before pasting, open `src/lib/claude/jsonl-reader.ts` and verify the shape of `SessionInfo.lastModified` (expected: `number` in epoch ms). If it is a Date or ISO string, tweak the filter accordingly in the route.
- [ ] Paste route content.
- [ ] `pnpm typecheck`.
- [ ] Manual:

```bash
curl "http://localhost:3011/api/worktrees/status?path=<WT>"
```

Expect: `{"dirty":false,"branchName":"...","activeSessions":N,"isClaudeDeckManaged":true}`.

- [ ] Manually create a dirty change in the worktree (`echo x > x.tmp` inside it) → call again → `dirty:true`. Remove the file.
- [ ] Commit: `feat(api): worktree status endpoint with dirty and active-session info`.

### Task 9 — `DELETE /api/worktrees`

**Files:** Modify `src/app/api/worktrees/route.ts` to add `DELETE` (§8). Extend import of `@/lib/worktrees` with `deleteWorktree`, add import of `invalidateAllProjects`.

- [ ] Apply edits.
- [ ] `pnpm typecheck`.
- [ ] Manual test end-to-end against a throwaway worktree created by the app UI:

```bash
# In a disposable worktree:
curl -X DELETE http://localhost:3011/api/worktrees \
  -H "Content-Type: application/json" \
  -d '{"worktreePath":"<WT>","projectPath":"<PARENT>","deleteBranch":true}'
```

Expect: `{"ok":true}`. Folder gone. `git -C <PARENT> branch` no longer lists the feature branch.

- [ ] Commit: `feat(api): DELETE /api/worktrees reuses deleteWorktree()`.

### Task 10 — Client hooks for status and delete

**Files:** Append to `src/data/claude/queries.ts` — second half of §10 (`WorktreeStatus` interface, `useWorktreeStatus`, `useDeleteWorktree`).

- [ ] Paste content.
- [ ] `pnpm typecheck`.
- [ ] Commit: `feat(data): add useWorktreeStatus and useDeleteWorktree hooks`.

### Task 11 — `DeleteWorktreeDialog` component

**Files:** Create `src/components/ClaudeProjects/DeleteWorktreeDialog.tsx` (§9).

- [ ] Paste content.
- [ ] `pnpm typecheck`.
- [ ] Commit: `feat(sidebar): DeleteWorktreeDialog with dirty/active-session warnings`.

### Task 12 — Wire Delete entry into context menu

**Files:** Modify `src/components/ClaudeProjects/ClaudeProjectCard.tsx` — import `DeleteWorktreeDialog`, add `showDeleteDialog` state, add the "Eliminar worktree…" `ContextMenuItem` (text-red), and render the dialog at the end of the component per §2.

- [ ] Apply edits.
- [ ] `pnpm typecheck`, `pnpm lint`.
- [ ] Manual end-to-end:
  - Right-click a worktree → "Eliminar worktree…" → dialog opens.
  - Dialog shows branch + path. Warnings absent on clean worktree.
  - Toggle "Borrar también la rama local" off → confirm → worktree removed, branch still present (`git branch`).
  - Create another worktree, dirty it, try again → amber warning "Tiene cambios sin commitear". Confirm → succeeds.
  - Create another worktree with an active Claude session → warning shows the count. Confirm → succeeds, session remains in its tmux (out of scope).
- [ ] Commit: `feat(sidebar): delete worktree context action and dialog`.

### Task 13 — Aggregate counter polish

**Files:** Already in place from Task 3 via `countLabel`. This task is a **review step**.

- [ ] Manually verify the parent row count label:
  - Non-worktree project with worktrees: `N ses · M wt`.
  - Non-worktree project without worktrees: `N` (unchanged).
  - Worktree card (inner): `N`.
- [ ] If `countLabel` needs tweaking for readability, adjust in `ClaudeProjectCard.tsx`.
- [ ] Commit only if changes made: `style(sidebar): tweak aggregate count label`.

### Task 14 — Final smoke test, then PR

- [ ] Run full pipeline: `pnpm lint && pnpm typecheck && pnpm build`. All pass.
- [ ] Exercise every acceptance item from the spec's Testing section (spec §Testing) in the dev server.
- [ ] Push branch, open PR against `main` with body pointing to spec and plan paths.

## Verification

**How to confirm the feature works end-to-end** (runs against the dev server at port 3011):

1. **Collapse behaviour** — Expand a project with worktrees. Collapse master → everything gone. Expand → subsections back. Toggle each subsection independently. Reload the page → each project's subsection state restored.
2. **Counter** — Parent row shows `N ses · M wt` for projects with worktrees, just the number otherwise.
3. **Create `+` in Worktrees header** — Click it; the existing new-session dialog opens with the project's directory pre-filled and the "Create isolated worktree" toggle auto-enabled (because the directory is a git repo, handled by `useNewSessionForm.checkGitRepo`).
4. **Open in editor** — Right-click worktree → "Abrir en Finder". Verify Finder window opens at the worktree path. If `code` is in `PATH`, "Abrir en VS Code" appears and works.
5. **Copy path** — Right-click worktree → "Copiar path". Paste into a terminal. Matches `project.directory`.
6. **Delete happy path** — Create worktree via UI → right-click → "Eliminar worktree…" → confirm with "Borrar rama" on. Verify:
   - Worktree disappears from sidebar.
   - `git -C <parent> worktree list` does not list it.
   - `git -C <parent> branch` does not list its branch.
7. **Delete with dirty** — Create worktree, add an untracked file inside, delete from UI. Amber warning shows before confirm. Confirm → succeeds.
8. **Delete with active session** — Create worktree, open a Claude session in it (sidebar `+`), close the terminal UI but leave the session, then right-click the worktree → Delete. Warning shows "N sesión(es)…". Confirm → worktree removed; the lingering tmux/session is unaffected (scoped out).
9. **Invalid open request** — `curl -X POST /api/open -d '{"path":"/tmp/bogus","editor":"finder"}'` returns 400 "path not allowed".

## Spec self-review (done by author of this plan)

1. **Spec coverage:** every Phase 1 + Phase 2 requirement from the approved spec has a task:
   - Two collapsible subsections → Task 3.
   - Master chevron collapses both → Task 3.
   - Persistence in localStorage → Task 2 + Task 3.
   - Count label → Task 3 + Task 13.
   - `+` in Worktrees header → Task 3 (reuses existing `onNewSession`).
   - Open in editor (VS Code/Cursor/Finder) with detection → Tasks 4, 5, 6, 7.
   - Copy path → Task 7.
   - Delete dialog with dirty / active-session warnings → Tasks 8, 10, 11, 12.
   - `DELETE /api/worktrees` reusing `deleteWorktree()` → Task 9.
   - Cache invalidation after delete → Task 9 (`invalidateAllProjects()`) + Task 10 (TanStack invalidate).
2. **Placeholder scan:** no TBDs, no "add error handling" — every step has concrete code or a concrete command with expected output.
3. **Type consistency:** `useWorktreeStatus(path: string | null)` matches dialog usage (`open ? worktree.directory : null` — `directory: string | null`). `useDeleteWorktree` payload `{ worktreePath, projectPath, deleteBranch }` matches the DELETE route body. `ExternalEditorAvailability` shape identical in server and client.
4. **Open risk flagged, not hidden:** Task 8 explicitly says to verify `SessionInfo.lastModified` type before committing, in case it differs from assumption. No wishful code.
