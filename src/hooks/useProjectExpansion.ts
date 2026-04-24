"use client";

import { useCallback, useEffect, useState } from "react";

export interface ProjectExpansion {
  master: boolean;
  sessions: boolean;
  worktrees: boolean;
}

const STORAGE_PREFIX = "claudedeck:expanded:";
const DEFAULT: ProjectExpansion = {
  master: false,
  sessions: false,
  worktrees: false,
};

function read(projectName: string): ProjectExpansion {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + projectName);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      master: Boolean(parsed.master),
      sessions: Boolean(parsed.sessions),
      worktrees: Boolean(parsed.worktrees),
    };
  } catch {
    return DEFAULT;
  }
}

function write(projectName: string, value: ProjectExpansion): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + projectName,
      JSON.stringify(value)
    );
  } catch {
    // quota / disabled storage — silently ignore
  }
}

export function useProjectExpansion(projectName: string) {
  const [expansion, setExpansion] = useState<ProjectExpansion>(DEFAULT);

  useEffect(() => {
    setExpansion(read(projectName));
  }, [projectName]);

  const update = useCallback(
    (patch: Partial<ProjectExpansion>) => {
      setExpansion((prev) => {
        const next = { ...prev, ...patch };
        write(projectName, next);
        return next;
      });
    },
    [projectName]
  );

  return {
    expansion,
    toggleMaster: () => update({ master: !expansion.master }),
    toggleSessions: () => update({ sessions: !expansion.sessions }),
    toggleWorktrees: () => update({ worktrees: !expansion.worktrees }),
  };
}
