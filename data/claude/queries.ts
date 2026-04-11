import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { claudeKeys } from "./keys";

export interface ClaudeProject {
  name: string;
  directory: string;
  displayName: string;
  sessionCount: number;
  lastActivity: string;
  hidden: boolean;
}

export interface ClaudeSession {
  sessionId: string;
  summary: string;
  lastActivity: string;
  messageCount: number;
  hidden: boolean;
}

interface ClaudeSessionsResponse {
  sessions: ClaudeSession[];
  total: number;
  hasMore: boolean;
}

async function fetchClaudeProjects(): Promise<ClaudeProject[]> {
  const res = await fetch("/api/claude/projects");
  if (!res.ok) throw new Error("Failed to fetch Claude projects");
  const data = await res.json();
  return data.projects || [];
}

async function fetchClaudeSessions(
  projectName: string,
  limit = 50,
  offset = 0,
  includeHidden = true
): Promise<ClaudeSessionsResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    includeHidden: String(includeHidden),
  });
  const res = await fetch(
    `/api/claude/projects/${encodeURIComponent(projectName)}/sessions?${params}`
  );
  if (!res.ok) throw new Error("Failed to fetch Claude sessions");
  return res.json();
}

export function useClaudeProjectsQuery() {
  return useQuery({
    queryKey: claudeKeys.projects(),
    queryFn: fetchClaudeProjects,
    staleTime: 30000,
  });
}

export function useClaudeSessionsQuery(projectName: string | null) {
  return useQuery({
    queryKey: claudeKeys.sessions(projectName || ""),
    queryFn: () => fetchClaudeSessions(projectName!),
    enabled: !!projectName,
    staleTime: 30000,
  });
}

export function useHideItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemType,
      itemId,
    }: {
      itemType: "project" | "session";
      itemId: string;
    }) => {
      const res = await fetch("/api/claude/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, itemId }),
      });
      if (!res.ok) throw new Error("Failed to hide item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claudeKeys.projects() });
      queryClient.invalidateQueries({ queryKey: claudeKeys.all });
    },
  });
}

export function useUnhideItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemType,
      itemId,
    }: {
      itemType: "project" | "session";
      itemId: string;
    }) => {
      const res = await fetch("/api/claude/hidden", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, itemId }),
      });
      if (!res.ok) throw new Error("Failed to unhide item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claudeKeys.projects() });
      queryClient.invalidateQueries({ queryKey: claudeKeys.all });
    },
  });
}
