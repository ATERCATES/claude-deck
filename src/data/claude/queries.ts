import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { claudeKeys } from "./keys";

export interface ClaudeProject {
  name: string;
  directory: string;
  displayName: string;
  sessionCount: number;
  lastActivity: string;
  hidden: boolean;
  parentRoot: string | null;
  isWorktree: boolean;
}

export interface ClaudeSession {
  sessionId: string;
  summary: string;
  lastActivity: string;
  messageCount: number;
  cwd: string | null;
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

export interface ExternalEditorAvailability {
  vscode: boolean;
  cursor: boolean;
  finder: boolean;
}

async function fetchExternalEditors(): Promise<ExternalEditorAvailability> {
  const res = await fetch("/api/external-editors");
  if (!res.ok) throw new Error("Failed to fetch editors");
  return res.json();
}

export function useExternalEditors() {
  return useQuery({
    queryKey: ["external-editors"],
    queryFn: fetchExternalEditors,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useOpenInEditor() {
  return useMutation({
    mutationFn: async ({
      path,
      editor,
    }: {
      path: string;
      editor: "vscode" | "cursor" | "finder";
    }) => {
      const res = await fetch("/api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, editor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to open");
      }
      return res.json();
    },
  });
}

export interface WorktreeStatus {
  dirty: boolean;
  branchName: string;
  activeSessions: number;
  isClaudeDeckManaged: boolean;
}

async function fetchWorktreeStatus(path: string): Promise<WorktreeStatus> {
  const res = await fetch(
    `/api/worktrees/status?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export function useWorktreeStatus(path: string | null) {
  return useQuery({
    queryKey: ["worktree-status", path],
    queryFn: () => fetchWorktreeStatus(path!),
    enabled: !!path,
    staleTime: 10_000,
    retry: false,
  });
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      worktreePath,
      projectPath,
      deleteBranch,
    }: {
      worktreePath: string;
      projectPath: string;
      deleteBranch: boolean;
    }) => {
      const res = await fetch("/api/worktrees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktreePath, projectPath, deleteBranch }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete worktree");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claudeKeys.projects() });
      queryClient.invalidateQueries({ queryKey: claudeKeys.all });
    },
  });
}

export interface WorktreeSummary {
  path: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  branchName: string;
  lastCommitSubject: string;
  lastCommitRelative: string;
  createdAt: number;
  activeSessions: number;
}

async function fetchWorktreeStatuses(
  paths: string[]
): Promise<WorktreeSummary[]> {
  const res = await fetch("/api/worktrees/statuses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) throw new Error("Failed to fetch statuses");
  return res.json();
}

export function useWorktreeStatuses(paths: string[]) {
  return useQuery({
    queryKey: ["worktree-statuses", paths],
    queryFn: () => fetchWorktreeStatuses(paths),
    enabled: paths.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useRenameWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      worktreePath,
      projectPath,
      newBranchName,
    }: {
      worktreePath: string;
      projectPath: string;
      newBranchName: string;
    }) => {
      const res = await fetch("/api/worktrees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktreePath, projectPath, newBranchName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to rename");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claudeKeys.projects() });
      queryClient.invalidateQueries({ queryKey: claudeKeys.all });
    },
  });
}
