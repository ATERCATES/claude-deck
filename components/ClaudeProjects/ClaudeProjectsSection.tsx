"use client";

import { useState, useMemo } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useClaudeProjectsQuery, useClaudeUpdates } from "@/data/claude";
import { ClaudeProjectCard } from "./ClaudeProjectCard";

interface ClaudeProjectsSectionProps {
  onSelectSession?: (
    sessionId: string,
    directory: string,
    summary: string,
    projectName: string
  ) => void;
  onNewSession?: (cwd: string, projectName: string) => void;
}

function ProjectsSkeleton() {
  return (
    <div className="space-y-1 px-2 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="bg-muted h-4 w-4 animate-pulse rounded" />
          <div
            className="bg-muted h-3.5 animate-pulse rounded"
            style={{ width: `${60 + Math.random() * 60}px` }}
          />
          <div className="flex-1" />
          <div className="bg-muted h-3 w-4 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

export function ClaudeProjectsSection({
  onSelectSession,
  onNewSession,
}: ClaudeProjectsSectionProps) {
  useClaudeUpdates();
  const { data: projects = [], isPending } = useClaudeProjectsQuery();
  const [showHidden, setShowHidden] = useState(false);

  const filteredProjects = useMemo(() => {
    const visible = projects.filter((p) => !p.hidden);
    const hidden = projects.filter((p) => p.hidden);
    if (showHidden) return [...visible, ...hidden];
    return visible;
  }, [projects, showHidden]);

  const hiddenCount = projects.filter((p) => p.hidden).length;

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-muted-foreground text-xs font-medium">
          Projects
        </span>
        <div className="flex items-center gap-1">
          {isPending && (
            <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
          )}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      </div>

      {isPending && projects.length === 0 && <ProjectsSkeleton />}

      <div className="space-y-0.5">
        {filteredProjects.map((project) => (
          <ClaudeProjectCard
            key={project.name}
            project={project}
            showHidden={showHidden}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
          />
        ))}
      </div>
    </div>
  );
}
