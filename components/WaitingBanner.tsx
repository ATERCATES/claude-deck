"use client";

import { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionStatus } from "@/components/views/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statusKeys } from "@/data/sessions/keys";

interface WaitingBannerProps {
  sessionStatuses: Record<string, SessionStatus>;
  onSelectSession: (sessionId: string) => void;
}

const MAX_VISIBLE = 3;

export function WaitingBanner({
  sessionStatuses,
  onSelectSession,
}: WaitingBannerProps) {
  const queryClient = useQueryClient();

  const waitingSessions = useMemo(
    () =>
      Object.entries(sessionStatuses)
        .filter(([, s]) => s.status === "waiting")
        .map(([id, s]) => ({ id, ...s })),
    [sessionStatuses]
  );

  const acknowledgeMutation = useMutation({
    mutationFn: async (sessionName: string) => {
      await fetch("/api/sessions/status/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionName }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statusKeys.all });
    },
  });

  const handleDismiss = useCallback(
    (sessionName: string) => {
      acknowledgeMutation.mutate(sessionName);
    },
    [acknowledgeMutation]
  );

  const handleDismissAll = useCallback(() => {
    waitingSessions.forEach((s) => acknowledgeMutation.mutate(s.sessionName));
  }, [waitingSessions, acknowledgeMutation]);

  if (waitingSessions.length === 0) return null;

  const visible = waitingSessions.slice(0, MAX_VISIBLE);
  const overflow = waitingSessions.length - MAX_VISIBLE;

  return (
    <div className="flex-shrink-0 border-b border-amber-500/30 bg-amber-500/5">
      <div className="space-y-0">
        {visible.map((session) => (
          <div
            key={session.id}
            className={cn(
              "flex items-center gap-3 px-4 py-2",
              "border-l-2 border-amber-500"
            )}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 animate-pulse text-amber-500" />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{session.sessionName}</span>
              {session.waitingContext ? (
                <pre className="text-muted-foreground mt-0.5 max-w-full truncate font-mono text-xs">
                  {session.waitingContext.split("\n").pop()}
                </pre>
              ) : session.lastLine ? (
                <pre className="text-muted-foreground mt-0.5 max-w-full truncate font-mono text-xs">
                  {session.lastLine}
                </pre>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-amber-600 hover:text-amber-500"
                onClick={() => onSelectSession(session.id)}
              >
                Switch
                <ArrowRight className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground h-6 w-6"
                onClick={() => handleDismiss(session.sessionName)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}

        {overflow > 0 && (
          <div className="text-muted-foreground px-4 py-1 text-xs">
            +{overflow} more session{overflow > 1 ? "s" : ""} waiting
          </div>
        )}

        {waitingSessions.length > 1 && (
          <div className="flex justify-end px-4 py-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-6 text-xs"
              onClick={handleDismissAll}
            >
              Dismiss all
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
