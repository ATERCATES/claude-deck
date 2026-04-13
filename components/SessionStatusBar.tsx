"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/components/views/types";
import { Activity, AlertCircle, Moon, ChevronUp } from "lucide-react";

interface SessionStatusBarProps {
  sessionStatuses: Record<string, SessionStatus>;
  onSelectSession: (sessionId: string) => void;
}

type StatusFilter = "running" | "waiting" | "idle" | null;

export function SessionStatusBar({
  sessionStatuses,
  onSelectSession,
}: SessionStatusBarProps) {
  const [expandedFilter, setExpandedFilter] = useState<StatusFilter>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const values = Object.values(sessionStatuses);
    return {
      running: values.filter((s) => s.status === "running").length,
      waiting: values.filter((s) => s.status === "waiting").length,
      idle: values.filter((s) => s.status === "idle").length,
    };
  }, [sessionStatuses]);

  const filteredSessions = useMemo(() => {
    if (!expandedFilter) return [];
    return Object.entries(sessionStatuses)
      .filter(([, s]) => s.status === expandedFilter)
      .map(([id, s]) => ({ id, ...s }));
  }, [sessionStatuses, expandedFilter]);

  const handleToggle = useCallback((filter: StatusFilter) => {
    setExpandedFilter((prev) => (prev === filter ? null : filter));
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!expandedFilter) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpandedFilter(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expandedFilter]);

  const total = counts.running + counts.waiting + counts.idle;
  if (total === 0) return null;

  return (
    <div ref={panelRef} className="relative flex-shrink-0">
      {/* Expanded panel */}
      {expandedFilter && filteredSessions.length > 0 && (
        <div className="border-border bg-background absolute right-0 bottom-full left-0 z-10 max-h-48 overflow-y-auto border-t shadow-lg">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                onSelectSession(session.id);
                setExpandedFilter(null);
              }}
              className="hover:bg-accent flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
            >
              <StatusDot status={session.status} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {session.sessionName}
              </span>
              {session.lastLine && (
                <span className="text-muted-foreground max-w-[40%] truncate font-mono text-xs">
                  {session.lastLine}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div
        className={cn(
          "border-border flex h-8 items-center gap-4 border-t px-4 text-xs",
          counts.waiting > 0 && "bg-amber-500/5"
        )}
      >
        {counts.running > 0 && (
          <button
            onClick={() => handleToggle("running")}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              expandedFilter === "running"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Activity className="h-3 w-3 text-green-500" />
            <span>{counts.running} running</span>
            {expandedFilter === "running" && <ChevronUp className="h-3 w-3" />}
          </button>
        )}

        {counts.waiting > 0 && (
          <button
            onClick={() => handleToggle("waiting")}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              expandedFilter === "waiting"
                ? "text-foreground"
                : "text-amber-500 hover:text-amber-400"
            )}
          >
            <AlertCircle className="h-3 w-3 animate-pulse" />
            <span>{counts.waiting} waiting</span>
            {expandedFilter === "waiting" && <ChevronUp className="h-3 w-3" />}
          </button>
        )}

        {counts.idle > 0 && (
          <button
            onClick={() => handleToggle("idle")}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              expandedFilter === "idle"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Moon className="h-3 w-3" />
            <span>{counts.idle} idle</span>
            {expandedFilter === "idle" && <ChevronUp className="h-3 w-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 flex-shrink-0 rounded-full",
        status === "running" && "animate-pulse bg-green-500",
        status === "waiting" && "animate-pulse bg-amber-500",
        status === "idle" && "bg-gray-400"
      )}
    />
  );
}
