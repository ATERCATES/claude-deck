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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClaudeSessionCard } from "./ClaudeSessionCard";
import { DeleteWorktreeDialog } from "./DeleteWorktreeDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { RenameWorktreeDialog } from "./RenameWorktreeDialog";
import {
  useClaudeSessionsQuery,
  useHideItem,
  useUnhideItem,
  useExternalEditors,
  useOpenInEditor,
} from "@/data/claude";
import { useProjectExpansion } from "@/hooks/useProjectExpansion";
import type { ClaudeProject, WorktreeSummary } from "@/data/claude";
import { Pencil } from "lucide-react";

const ABANDONED_MS = 14 * 24 * 60 * 60 * 1000;

interface ClaudeProjectCardProps {
  project: ClaudeProject;
  worktreeChildren?: ClaudeProject[];
  worktreeStatuses?: Map<string, WorktreeSummary>;
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
  worktreeStatuses,
  showHidden,
  onSelectSession,
  onNewSession,
}: ClaudeProjectCardProps) {
  const { expansion, toggleMaster, toggleSessions, toggleWorktrees } =
    useProjectExpansion(project.name);
  const hasWorktrees = worktreeChildren.length > 0 && !project.isWorktree;
  const sessionCount = project.sessionCount;
  const worktreeCount = worktreeChildren.length;

  // Without worktrees the Sessions sub-header is noise — the master chevron
  // expands sessions directly. So when there are no worktrees, treat master
  // open as sessions open.
  const sessionsOpen = hasWorktrees ? expansion.sessions : expansion.master;
  const sessionsQueryEnabled = expansion.master && sessionsOpen;

  const { data: sessionsData, isPending: isSessionsPending } =
    useClaudeSessionsQuery(sessionsQueryEnabled ? project.name : null);
  const hideItem = useHideItem();
  const unhideItem = useUnhideItem();
  const { data: editors } = useExternalEditors();
  const openInEditor = useOpenInEditor();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);

  const summary =
    project.isWorktree && project.directory
      ? worktreeStatuses?.get(project.directory)
      : undefined;
  const isAbandoned =
    !!summary &&
    summary.activeSessions === 0 &&
    Date.now() - summary.createdAt > ABANDONED_MS;

  const sessions = sessionsData?.sessions || [];
  const filteredSessions = showHidden
    ? sessions
    : sessions.filter((s) => !s.hidden);

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

  const countLabel = hasWorktrees
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
          <ContextMenuItem onClick={() => setShowRenameDialog(true)}>
            <Pencil className="mr-2 h-3 w-3" />
            Renombrar rama…
          </ContextMenuItem>
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
          Show project
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={handleHideProject}>
          <EyeOff className="mr-2 h-3 w-3" />
          Hide project
        </ContextMenuItem>
      )}
      {!project.isWorktree && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setShowDeleteProjectDialog(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-3 w-3" />
            Eliminar proyecto…
          </ContextMenuItem>
        </>
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
        project.hidden && "opacity-40",
        isAbandoned && !project.hidden && "opacity-60"
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
      {summary && (
        <span className="flex flex-shrink-0 items-center gap-0.5">
          {summary.dirty && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              title="Cambios sin commitear"
            />
          )}
          {summary.ahead > 0 && (
            <span className="font-mono text-[9px] text-blue-500">
              ↑{summary.ahead}
            </span>
          )}
          {summary.behind > 0 && (
            <span className="font-mono text-[9px] text-rose-400">
              ↓{summary.behind}
            </span>
          )}
        </span>
      )}
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

  const tooltipContent =
    project.isWorktree && summary ? (
      <div className="space-y-0.5 text-xs">
        <div className="font-mono font-medium">{summary.branchName}</div>
        {summary.lastCommitSubject && (
          <div className="text-muted-foreground max-w-[260px] truncate">
            {summary.lastCommitSubject}
            {summary.lastCommitRelative && ` · ${summary.lastCommitRelative}`}
          </div>
        )}
        <div className="text-muted-foreground">
          Creado {new Date(summary.createdAt).toLocaleDateString()}
        </div>
        {isAbandoned && (
          <div className="text-amber-500">
            Sin sesiones recientes (14+ días)
          </div>
        )}
      </div>
    ) : null;

  const triggerRow = tooltipContent ? (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>{masterRow}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-[300px]">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </div>
  ) : (
    masterRow
  );

  return (
    <div className="space-y-0.5">
      <ContextMenu>
        <ContextMenuTrigger asChild>{triggerRow}</ContextMenuTrigger>
        <ContextMenuContent>{menuContent}</ContextMenuContent>
      </ContextMenu>

      {expansion.master && (
        <div className="border-border/30 ml-3 space-y-0.5 border-l pl-1.5">
          {hasWorktrees && (
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
          )}
          {sessionsOpen && (
            <div className={hasWorktrees ? "space-y-px pl-3" : "space-y-px"}>
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
                      worktreeStatuses={worktreeStatuses}
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
      {showRenameDialog && (
        <RenameWorktreeDialog
          open={showRenameDialog}
          onOpenChange={setShowRenameDialog}
          worktree={project}
        />
      )}
      {showDeleteProjectDialog && (
        <DeleteProjectDialog
          open={showDeleteProjectDialog}
          onOpenChange={setShowDeleteProjectDialog}
          project={project}
          worktreeChildren={worktreeChildren}
        />
      )}
    </div>
  );
}
