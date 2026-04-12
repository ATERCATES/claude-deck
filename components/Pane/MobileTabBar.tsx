"use client";

import { Button } from "@/components/ui/button";
import { OpenInVSCode } from "./OpenInVSCode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  Terminal as TerminalIcon,
  FolderOpen,
  GitBranch,
  Users,
  ChevronDown,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/db";
import { useClaudeSessionsQuery } from "@/data/claude";
import type { LucideIcon } from "lucide-react";

type ViewMode = "terminal" | "files" | "git" | "workers";

interface ViewModeButtonProps {
  mode: ViewMode;
  currentMode: ViewMode;
  icon: LucideIcon;
  onClick: (mode: ViewMode) => void;
  badge?: React.ReactNode;
}

function ViewModeButton({
  mode,
  currentMode,
  icon: Icon,
  onClick,
  badge,
}: ViewModeButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(mode);
      }}
      className={cn(
        "rounded p-1.5 transition-colors",
        badge && "flex items-center gap-0.5",
        currentMode === mode
          ? "bg-secondary text-foreground"
          : "text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {badge}
    </button>
  );
}

interface MobileTabBarProps {
  session: Session | null | undefined;
  claudeProjectName: string | null;
  viewMode: ViewMode;
  isConductor: boolean;
  workerCount: number;
  onMenuClick?: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onResumeClaudeSession?: (
    sessionId: string,
    cwd: string,
    summary: string,
    projectName: string
  ) => void;
}

export function MobileTabBar({
  session,
  claudeProjectName,
  viewMode,
  isConductor,
  workerCount,
  onMenuClick,
  onViewModeChange,
  onResumeClaudeSession,
}: MobileTabBarProps) {
  const { data: claudeSessions } = useClaudeSessionsQuery(
    claudeProjectName || ""
  );
  const sessionList = claudeProjectName ? claudeSessions?.sessions || [] : [];

  return (
    <div
      className="bg-muted flex items-center gap-2 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Menu button */}
      {onMenuClick && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick();
          }}
          className="h-8 w-8 shrink-0"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}

      {/* Session selector */}
      <div className="flex min-w-0 flex-1 items-center">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-accent active:bg-accent flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1"
            >
              <span className="truncate text-sm font-medium">
                {session?.name || "No session"}
              </span>
              {sessionList.length > 0 && (
                <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
              )}
            </button>
          </DropdownMenuTrigger>
          {sessionList.length > 0 && (
            <DropdownMenuContent
              align="center"
              className="max-h-[280px] w-[240px] overflow-y-auto p-1"
            >
              {sessionList.map((s) => {
                const isActive = s.sessionId === session?.id;
                return (
                  <DropdownMenuItem
                    key={s.sessionId}
                    onSelect={() => {
                      if (s.cwd && claudeProjectName) {
                        onResumeClaudeSession?.(
                          s.sessionId,
                          s.cwd,
                          s.summary,
                          claudeProjectName
                        );
                      }
                    }}
                    className={cn(
                      "gap-2 rounded px-2 py-1.5",
                      isActive && "bg-accent"
                    )}
                  >
                    <Circle
                      className={cn(
                        "h-1.5 w-1.5 shrink-0",
                        isActive
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/50"
                      )}
                    />
                    <span className="truncate text-xs">{s.summary}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </div>

      {/* View mode toggle */}
      {session?.working_directory && (
        <div className="bg-accent/50 flex shrink-0 items-center rounded-md p-0.5">
          <ViewModeButton
            mode="terminal"
            currentMode={viewMode}
            icon={TerminalIcon}
            onClick={onViewModeChange}
          />
          <ViewModeButton
            mode="files"
            currentMode={viewMode}
            icon={FolderOpen}
            onClick={onViewModeChange}
          />
          <ViewModeButton
            mode="git"
            currentMode={viewMode}
            icon={GitBranch}
            onClick={onViewModeChange}
          />
          {isConductor && (
            <ViewModeButton
              mode="workers"
              currentMode={viewMode}
              icon={Users}
              onClick={onViewModeChange}
              badge={
                <span className="bg-primary/20 text-primary rounded px-1 text-[10px]">
                  {workerCount}
                </span>
              }
            />
          )}
        </div>
      )}
      {session?.working_directory && session.working_directory !== "~" && (
        <OpenInVSCode
          workingDirectory={session.working_directory}
          className="h-7 w-7"
        />
      )}
    </div>
  );
}
