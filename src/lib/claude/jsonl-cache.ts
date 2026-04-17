import { listSessions as sdkListSessions } from "@anthropic-ai/claude-agent-sdk";
import {
  extractProjectDirectory,
  getSessions,
  getClaudeProjectNames,
  type SessionInfo,
} from "./jsonl-reader";
import { resolveRepoIdentity, invalidateRepoIdentityCache } from "../worktrees";

export interface CachedProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
  parentRoot: string | null;
  isWorktree: boolean;
}

function deriveDisplayName(directory: string | null, encoded: string): string {
  if (directory) {
    const parts = directory.split("/");
    return parts[parts.length - 1] || directory;
  }
  const decoded = encoded.replace(/^-/, "/").replace(/-/g, "/");
  const parts = decoded.split("/");
  return parts[parts.length - 1] || decoded;
}

let projectsData: CachedProject[] | null = null;
let projectsBuilding: Promise<CachedProject[]> | null = null;

async function buildProjects(): Promise<CachedProject[]> {
  const projectNames = getClaudeProjectNames();

  const allSessions = await sdkListSessions();
  const cwdToDir = new Map<string, string>();
  for (const s of allSessions) {
    if (s.cwd) {
      const encoded = s.cwd.replace(/\//g, "-");
      if (!cwdToDir.has(encoded)) cwdToDir.set(encoded, s.cwd);
    }
  }

  const projectsWithDir = await Promise.all(
    projectNames.map(async (name) => {
      const directory =
        cwdToDir.get(name) || (await extractProjectDirectory(name));
      return { name, directory };
    })
  );

  const identities = await Promise.all(
    projectsWithDir.map(({ directory }) =>
      directory ? resolveRepoIdentity(directory) : Promise.resolve(null)
    )
  );

  const directoryToName = new Map<string, string>();
  for (const { name, directory } of projectsWithDir) {
    if (directory) directoryToName.set(directory, name);
  }

  const sessionsByProject = new Map<string, typeof allSessions>();
  const seenSessionIds = new Set<string>();

  for (const s of allSessions) {
    if (seenSessionIds.has(s.sessionId)) continue;
    seenSessionIds.add(s.sessionId);

    let target: string | null = null;
    if (s.cwd && directoryToName.has(s.cwd)) {
      target = directoryToName.get(s.cwd)!;
    } else if (s.cwd) {
      const encoded = s.cwd.replace(/\//g, "-");
      if (projectsWithDir.some((p) => p.name === encoded)) target = encoded;
    }
    if (!target) continue;

    const list = sessionsByProject.get(target) ?? [];
    list.push(s);
    sessionsByProject.set(target, list);
  }

  return projectsWithDir.map(({ name, directory }, idx) => {
    const identity = identities[idx];
    const projectSessions = (sessionsByProject.get(name) ?? []).sort(
      (a, b) => b.lastModified - a.lastModified
    );
    return {
      name,
      directory,
      displayName: deriveDisplayName(directory, name),
      sessionCount: projectSessions.length,
      lastActivity: projectSessions[0]
        ? new Date(projectSessions[0].lastModified).toISOString()
        : null,
      parentRoot: identity?.parentRoot ?? null,
      isWorktree: identity?.isWorktree ?? false,
    };
  });
}

export async function getCachedProjects(): Promise<CachedProject[]> {
  if (projectsData) return projectsData;
  if (projectsBuilding) return projectsBuilding;

  projectsBuilding = buildProjects();
  try {
    projectsData = await projectsBuilding;
  } finally {
    projectsBuilding = null;
  }
  return projectsData;
}

export async function getCachedSessions(
  projectName: string
): Promise<SessionInfo[]> {
  const { sessions } = await getSessions(projectName, 200, 0);
  return sessions;
}

export function invalidateAllProjects(): void {
  projectsData = null;
  invalidateRepoIdentityCache();
}
