"use client";

import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Activity, AlertCircle, Moon } from "lucide-react";
import type { SessionStatus } from "@/components/views/types";
import { useHiddenSessionIds } from "@/data/claude";

interface ActiveSessionsSectionProps {
  sessionStatuses: Record<string, SessionStatus>;
  onSelect: (sessionId: string) => void;
}

const STATUS_ORDER: Record<string, number> = {
  waiting: 0,
  running: 1,
  idle: 2,
};

export function ActiveSessionsSection({
  sessionStatuses,
  onSelect,
}: ActiveSessionsSectionProps) {
  const hiddenSessionIds = useHiddenSessionIds();

  const activeSessions = useMemo(() => {
    return Object.entries(sessionStatuses)
      .filter(
        ([id, s]) =>
          (s.status === "running" ||
            s.status === "waiting" ||
            s.status === "idle") &&
          !hiddenSessionIds.has(id)
      )
      .map(([id, s]) => ({ id, ...s }))
      .sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
      );
  }, [sessionStatuses, hiddenSessionIds]);

  const hasWaiting = activeSessions.some((s) => s.status === "waiting");
  const [expanded, setExpanded] = useState(hasWaiting);

  // Auto-expand when a session starts waiting
  useEffect(() => {
    if (hasWaiting) setExpanded(true);
  }, [hasWaiting]);

  if (activeSessions.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors",
          hasWaiting
            ? "text-amber-500"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform",
            expanded && "rotate-90"
          )}
        />
        <span>Active Sessions</span>
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px]",
            hasWaiting
              ? "bg-amber-500/20 text-amber-500"
              : "bg-muted text-muted-foreground"
          )}
        >
          {activeSessions.length}
        </span>
      </button>

      {expanded && (
        <div className="space-y-0.5 px-1.5">
          {activeSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className="hover:bg-accent group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
            >
              <StatusIcon status={session.status} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {session.sessionName}
                </span>
                {session.lastLine && (
                  <span className="text-muted-foreground block truncate font-mono text-[10px]">
                    {session.lastLine}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Activity className="h-3 w-3 flex-shrink-0 animate-pulse text-green-500" />
    );
  }
  if (status === "waiting") {
    return (
      <AlertCircle className="h-3 w-3 flex-shrink-0 animate-pulse text-amber-500" />
    );
  }
  return <Moon className="h-3 w-3 flex-shrink-0 text-gray-400" />;
}
