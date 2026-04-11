"use client";

import { useState, useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useClaudeProjectsQuery } from "@/data/claude";
import { ClaudeProjectCard } from "./ClaudeProjectCard";

interface ClaudeProjectsSectionProps {
  onSelectSession?: (sessionId: string, directory: string) => void;
}

export function ClaudeProjectsSection({
  onSelectSession,
}: ClaudeProjectsSectionProps) {
  const { data: projects = [], isPending } = useClaudeProjectsQuery();
  const [showHidden, setShowHidden] = useState(false);

  const filteredProjects = useMemo(() => {
    const visible = projects.filter((p) => !p.hidden);
    const hidden = projects.filter((p) => p.hidden);
    if (showHidden) return [...visible, ...hidden];
    return visible;
  }, [projects, showHidden]);

  if (isPending || projects.length === 0) return null;

  const hiddenCount = projects.filter((p) => p.hidden).length;

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-muted-foreground text-xs font-medium">
          Claude Projects
        </span>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      <div className="space-y-0.5">
        {filteredProjects.map((project) => (
          <ClaudeProjectCard
            key={project.name}
            project={project}
            showHidden={showHidden}
            onSelectSession={onSelectSession}
          />
        ))}
      </div>
    </div>
  );
}
