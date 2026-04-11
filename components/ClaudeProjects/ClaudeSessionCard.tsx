"use client";

import { cn } from "@/lib/utils";
import { MessageSquare, MoreHorizontal, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClaudeSession } from "@/data/claude";

interface ClaudeSessionCardProps {
  session: ClaudeSession;
  onHide: () => void;
  onUnhide: () => void;
  onSelect?: (sessionId: string, directory: string) => void;
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export function ClaudeSessionCard({
  session,
  onHide,
  onUnhide,
  onSelect,
}: ClaudeSessionCardProps) {
  const handleClick = () => {
    if (onSelect && session.cwd) {
      onSelect(session.sessionId, session.cwd);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm",
        "hover:bg-accent/50",
        session.hidden && "opacity-40"
      )}
    >
      <MessageSquare className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
      <span className="flex-1 truncate text-xs">
        {session.summary || "Untitled session"}
      </span>
      <span className="text-muted-foreground flex-shrink-0 text-[10px]">
        {getTimeAgo(session.lastActivity)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {session.hidden ? (
            <DropdownMenuItem onClick={onUnhide}>
              <Eye className="mr-2 h-3 w-3" />
              Show session
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onHide}>
              <EyeOff className="mr-2 h-3 w-3" />
              Hide session
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
