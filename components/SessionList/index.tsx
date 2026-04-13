"use client";

import { useState, useRef, useCallback } from "react";
import { ClaudeProjectsSection } from "@/components/ClaudeProjects";
import { ActiveSessionsSection } from "./ActiveSessionsSection";
import { NewProjectDialog } from "@/components/Projects";
import { FolderPicker } from "@/components/FolderPicker";
import { SelectionToolbar } from "./SelectionToolbar";
import { SessionListHeader } from "./SessionListHeader";
import { KillAllConfirm } from "./KillAllConfirm";
import { useSessionListMutations } from "./hooks/useSessionListMutations";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import type { Session } from "@/lib/db";
import { useViewport } from "@/hooks/useViewport";

import { useSessionsQuery } from "@/data/sessions";
import { useCreateProject } from "@/data/projects";
import { useClaudeProjectsQuery } from "@/data/claude";

import type { SessionListProps } from "./SessionList.types";

export type { SessionListProps } from "./SessionList.types";

export function SessionList({
  activeSessionId: _activeSessionId,
  sessionStatuses,
  onSelect,
  onOpenInTab: _onOpenInTab,
  onNewSessionInProject: _onNewSessionInProject,
  onOpenTerminal: _onOpenTerminal,
  onStartDevServer: _onStartDevServer,
  onCreateDevServer: _onCreateDevServer,
  onResumeClaudeSession,
  onNewSession,
}: SessionListProps) {
  const { isMobile } = useViewport();

  const {
    data: sessionsData,
    isPending: isSessionsPending,
    isError: isSessionsError,
    error: sessionsError,
  } = useSessionsQuery();

  const { isPending: isClaudePending, isError: isClaudeError } =
    useClaudeProjectsQuery();

  const isInitialLoading = isSessionsPending || isClaudePending;
  const hasError = isSessionsError || isClaudeError;

  const sessions = sessionsData?.sessions ?? [];
  const allSessionIds = sessions.map((s: Session) => s.id);

  const mutations = useSessionListMutations({ onSelectSession: onSelect });
  const createProject = useCreateProject();

  const [showKillAllConfirm, setShowKillAllConfirm] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectMode, setNewProjectMode] = useState<"new" | "clone">("new");
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHoverRef = useRef<{
    session: Session;
    rect: DOMRect;
  } | null>(null);

  const _hoverHandlers = {
    onHoverStart: useCallback(
      (_session: Session, _rect: DOMRect) => {
        if (isMobile) return;
      },
      [isMobile]
    ),
    onHoverEnd: useCallback(() => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      pendingHoverRef.current = null;
    }, []),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SessionListHeader
        onNewProject={() => {
          setNewProjectMode("new");
          setShowNewProjectDialog(true);
        }}
        onOpenProject={() => setShowFolderPicker(true)}
        onCloneFromGithub={() => {
          setNewProjectMode("clone");
          setShowNewProjectDialog(true);
        }}
        onKillAll={() => setShowKillAllConfirm(true)}
      />

      {showKillAllConfirm && (
        <KillAllConfirm
          onCancel={() => setShowKillAllConfirm(false)}
          onComplete={() => setShowKillAllConfirm(false)}
        />
      )}

      <SelectionToolbar
        allSessionIds={allSessionIds}
        onDeleteSessions={mutations.handleBulkDelete}
      />

      {mutations.summarizingSessionId && (
        <div className="bg-primary/10 mx-4 mb-2 flex items-center gap-2 rounded-lg p-2 text-sm">
          <Loader2 className="text-primary h-4 w-4 animate-spin" />
          <span className="text-primary">Generating summary...</span>
        </div>
      )}

      <ScrollArea className="w-full flex-1">
        <div className="max-w-full space-y-0.5 px-1.5 py-1">
          {hasError && !isInitialLoading && (
            <div className="flex flex-col items-center justify-center px-4 py-12">
              <AlertCircle className="text-destructive/50 mb-3 h-10 w-10" />
              <p className="text-destructive mb-2 text-sm">
                Failed to load sessions
              </p>
              <p className="text-muted-foreground mb-4 text-xs">
                {sessionsError?.message || "Unknown error"}
              </p>
              <Button
                variant="outline"
                onClick={mutations.handleRefresh}
                className="gap-2"
              >
                Retry
              </Button>
            </div>
          )}

          {!isInitialLoading && !hasError && sessionStatuses && (
            <ActiveSessionsSection
              sessionStatuses={sessionStatuses}
              onSelect={onSelect}
            />
          )}

          {!isInitialLoading && !hasError && (
            <ClaudeProjectsSection
              onSelectSession={(claudeSessionId, cwd, summary, projectName) => {
                onResumeClaudeSession?.(
                  claudeSessionId,
                  cwd,
                  summary,
                  projectName
                );
              }}
              onNewSession={onNewSession}
            />
          )}
        </div>
      </ScrollArea>

      <NewProjectDialog
        open={showNewProjectDialog}
        mode={newProjectMode}
        onClose={() => setShowNewProjectDialog(false)}
        onCreated={() => setShowNewProjectDialog(false)}
      />

      {showFolderPicker && (
        <FolderPicker
          initialPath="~"
          onClose={() => setShowFolderPicker(false)}
          onSelect={(path) => {
            const parts = path.split("/").filter(Boolean);
            const name = parts[parts.length - 1] || "project";

            createProject.mutate(
              {
                name,
                workingDirectory: path,
                agentType: "claude",
                defaultModel: "sonnet",
                devServers: [],
              },
              {
                onSuccess: () => setShowFolderPicker(false),
                onError: () => setShowFolderPicker(false),
              }
            );
          }}
        />
      )}
    </div>
  );
}
