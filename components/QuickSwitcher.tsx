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
import { CodeSearchResults } from "@/components/CodeSearch/CodeSearchResults";
import { useRipgrepAvailable } from "@/data/code-search";
import { useClaudeProjectsQuery, useClaudeSessionsQuery } from "@/data/claude";
import type { ClaudeProject } from "@/data/claude";

interface QuickSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResumeClaudeSession: (
    sessionId: string,
    cwd: string,
    summary: string,
    projectName: string
  ) => void;
  onSelectFile?: (file: string, line: number) => void;
  currentSessionId?: string;
  activeSessionWorkingDir?: string;
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
  onSelectFile,
  currentSessionId,
  activeSessionWorkingDir,
}: QuickSwitcherProps) {
  const [mode, setMode] = useState<"sessions" | "code">("sessions");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: ripgrepAvailable } = useRipgrepAvailable();
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
  }, [s0.data, s1.data, s2.data, s3.data, topProjects]);

  const filteredSessions = useMemo(() => {
    if (!query) return allSessions;
    const q = query.toLowerCase();
    return allSessions.filter(
      (s) =>
        s.summary.toLowerCase().includes(q) ||
        s.projectDisplayName.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q)
    );
  }, [allSessions, query]);

  useEffect(() => {
    if (open) {
      setMode("sessions");
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (ripgrepAvailable === false && mode === "code") {
      setMode("sessions");
    }
  }, [ripgrepAvailable, mode]);

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

  const handleSelectFile = useCallback(
    (file: string, line: number) => {
      onOpenChange(false);
      onSelectFile?.(file, line);
    },
    [onOpenChange, onSelectFile]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Switch Session / Search Code</DialogTitle>
        </DialogHeader>

        {ripgrepAvailable === true && (
          <div className="border-border flex gap-2 border-b p-2">
            <button
              onClick={() => setMode("sessions")}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                mode === "sessions"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              Sessions
            </button>
            <button
              onClick={() => setMode("code")}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                mode === "code"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              Code Search
            </button>
          </div>
        )}

        <div className="border-border border-b p-3">
          <Input
            ref={inputRef}
            placeholder={
              mode === "sessions" || !ripgrepAvailable
                ? "Search sessions..."
                : "Search code (min 3 chars)..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={mode === "sessions" ? handleKeyDown : undefined}
            className="h-10"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto py-2">
          {mode === "sessions" ? (
            filteredSessions.length === 0 ? (
              <div className="text-muted-foreground px-4 py-8 text-center text-sm">
                No sessions found
              </div>
            ) : (
              filteredSessions.map((session, index) => {
                const isCurrent = session.sessionId === currentSessionId;
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
                      isCurrent && "bg-primary/10"
                    )}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {session.summary}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {session.projectDisplayName}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex flex-shrink-0 items-center gap-1 text-xs">
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(session.lastActivity)}</span>
                    </div>
                  </button>
                );
              })
            )
          ) : (
            <CodeSearchResults
              workingDirectory={activeSessionWorkingDir || "~"}
              query={query}
              onSelectFile={handleSelectFile}
            />
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
