"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ClaudeSessionCard } from "./ClaudeSessionCard";
import {
  useClaudeSessionsQuery,
  useHideItem,
  useUnhideItem,
} from "@/data/claude";
import type { ClaudeProject } from "@/data/claude";

interface ClaudeProjectCardProps {
  project: ClaudeProject;
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
  showHidden,
  onSelectSession,
  onNewSession,
}: ClaudeProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: sessionsData, isPending: isSessionsPending } =
    useClaudeSessionsQuery(expanded ? project.name : null);
  const hideItem = useHideItem();
  const unhideItem = useUnhideItem();

  const sessions = sessionsData?.sessions || [];
  const filteredSessions = showHidden
    ? sessions
    : sessions.filter((s) => !s.hidden);

  const handleHideProject = () => {
    hideItem.mutate({ itemType: "project", itemId: project.name });
  };

  const handleUnhideProject = () => {
    unhideItem.mutate({ itemType: "project", itemId: project.name });
  };

  const menuContent = project.hidden ? (
    <ContextMenuItem onClick={handleUnhideProject}>
      <Eye className="mr-2 h-3 w-3" />
      Show project
    </ContextMenuItem>
  ) : (
    <ContextMenuItem onClick={handleHideProject}>
      <EyeOff className="mr-2 h-3 w-3" />
      Hide project
    </ContextMenuItem>
  );

  const cardContent = (
    <div
      onClick={() => setExpanded(!expanded)}
      className={cn(
        "group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        "min-h-[36px] md:min-h-[28px]",
        "hover:bg-accent/50",
        project.hidden && "opacity-40"
      )}
    >
      <button className="flex-shrink-0 p-0.5">
        {expanded ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        )}
      </button>
      <FolderOpen className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {project.displayName}
      </span>
      <span className="text-muted-foreground flex-shrink-0 text-[10px]">
        {project.sessionCount}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 flex-shrink-0 opacity-100 md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {project.hidden ? (
            <DropdownMenuItem onClick={handleUnhideProject}>
              <Eye className="mr-2 h-3 w-3" />
              Show project
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleHideProject}>
              <EyeOff className="mr-2 h-3 w-3" />
              Hide project
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="space-y-0.5">
      <ContextMenu>
        <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
        <ContextMenuContent>{menuContent}</ContextMenuContent>
      </ContextMenu>

      {expanded && (
        <div className="border-border/30 ml-3 space-y-px border-l pl-1.5">
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
    </div>
  );
}
