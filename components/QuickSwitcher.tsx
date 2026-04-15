"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Terminal, Clock } from "lucide-react";
import { useClaudeProjectsQuery, useClaudeSessionsQuery } from "@/data/claude";
import type { ClaudeProject } from "@/data/claude";
import type { SessionStatus } from "@/components/views/types";

interface QuickSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResumeClaudeSession: (
    sessionId: string,
    cwd: string,
    summary: string,
    projectName: string
  ) => void;
  currentSessionId?: string;
  sessionStatuses?: Record<string, SessionStatus>;
}

interface FlatSession {
  sessionId: string;
  summary: string;
  cwd: string;
  lastActivity: string;
  projectName: string;
  projectDisplayName: string;
}

export function QuickSwitcher({
  open,
  onOpenChange,
  onResumeClaudeSession,
  currentSessionId,
  sessionStatuses,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useClaudeProjectsQuery();

  const topProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects]
      .sort(
        (a, b) =>
          new Date(b.lastActivity || 0).getTime() -
          new Date(a.lastActivity || 0).getTime()
      )
      .slice(0, 8);
  }, [projects]);

  const topProjectName = topProjects[0]?.name || null;
  const p1 = topProjects[1]?.name || null;
  const p2 = topProjects[2]?.name || null;
  const p3 = topProjects[3]?.name || null;

  const s0 = useClaudeSessionsQuery(open ? topProjectName : null);
  const s1 = useClaudeSessionsQuery(open ? p1 : null);
  const s2 = useClaudeSessionsQuery(open ? p2 : null);
  const s3 = useClaudeSessionsQuery(open ? p3 : null);

  const allSessions = useMemo(() => {
    const flat: FlatSession[] = [];
    const queries = [s0, s1, s2, s3];
    const projs = topProjects.slice(0, 4);

    projs.forEach((project: ClaudeProject, i: number) => {
      const sessions = queries[i]?.data?.sessions || [];
      sessions.forEach((s) => {
        if (s.cwd) {
          flat.push({
            sessionId: s.sessionId,
            summary: s.summary,
            cwd: s.cwd,
            lastActivity: s.lastActivity,
            projectName: project.name,
            projectDisplayName: project.displayName,
          });
        }
      });
    });

    return flat.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when .data changes, not entire query objects
  }, [s0.data, s1.data, s2.data, s3.data, topProjects]);

  const statusByClaudeId = useMemo(() => {
    if (!sessionStatuses) return new Map<string, SessionStatus>();
    const map = new Map<string, SessionStatus>();
    for (const s of Object.values(sessionStatuses)) {
      if (s.claudeSessionId) {
        map.set(s.claudeSessionId, s);
      }
    }
    return map;
  }, [sessionStatuses]);

  const filteredSessions = useMemo(() => {
    let sessions = allSessions;
    if (query) {
      const q = query.toLowerCase();
      sessions = sessions.filter(
        (s) =>
          s.summary.toLowerCase().includes(q) ||
          s.projectDisplayName.toLowerCase().includes(q) ||
          s.cwd.toLowerCase().includes(q)
      );
    }

    return [...sessions].sort((a, b) => {
      const statusA = statusByClaudeId.get(a.sessionId)?.status;
      const statusB = statusByClaudeId.get(b.sessionId)?.status;
      const orderMap: Record<string, number> = {
        waiting: 0,
        running: 1,
      };
      const orderA = statusA && statusA in orderMap ? orderMap[statusA] : 2;
      const orderB = statusB && statusB in orderMap ? orderMap[statusB] : 2;
      if (orderA !== orderB) return orderA - orderB;
      return (
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
    });
  }, [allSessions, query, statusByClaudeId]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredSessions.length - 1)
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredSessions[selectedIndex]) {
            const s = filteredSessions[selectedIndex];
            onResumeClaudeSession(s.sessionId, s.cwd, s.summary, s.projectName);
            onOpenChange(false);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [filteredSessions, selectedIndex, onResumeClaudeSession, onOpenChange]
  );

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const now = new Date();
    const date = new Date(dateStr);
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Switch Session</DialogTitle>
        </DialogHeader>

        <div className="border-border border-b p-3">
          <Input
            ref={inputRef}
            placeholder="Search sessions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-10"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto py-2">
          {filteredSessions.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              No sessions found
            </div>
          ) : (
            filteredSessions.map((session, index) => {
              const isCurrent = session.sessionId === currentSessionId;
              const status = statusByClaudeId.get(session.sessionId);
              return (
                <button
                  key={session.sessionId}
                  onClick={() => {
                    onResumeClaudeSession(
                      session.sessionId,
                      session.cwd,
                      session.summary,
                      session.projectName
                    );
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    index === selectedIndex
                      ? "bg-accent"
                      : "hover:bg-accent/50",
                    isCurrent && "bg-primary/10",
                    status?.status === "waiting" && "bg-amber-500/5"
                  )}
                >
                  <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                    <Terminal className="h-4 w-4" />
                    {status && (
                      <span
                        className={cn(
                          "border-background absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2",
                          status.status === "running" &&
                            "animate-pulse bg-green-500",
                          status.status === "waiting" &&
                            "animate-pulse bg-amber-500",
                          status.status === "idle" && "bg-gray-400"
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {session.summary}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {session.projectDisplayName}
                    </span>
                    {status?.lastLine && (
                      <span className="text-muted-foreground block truncate font-mono text-[10px]">
                        {status.lastLine}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-shrink-0 items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    <span>{formatTime(session.lastActivity)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-border text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-xs">
          <span>
            <kbd className="bg-muted rounded px-1.5 py-0.5">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="bg-muted rounded px-1.5 py-0.5">↵</kbd> select
          </span>
          <span>
            <kbd className="bg-muted rounded px-1.5 py-0.5">esc</kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
