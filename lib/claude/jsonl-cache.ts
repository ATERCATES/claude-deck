import { listSessions as sdkListSessions } from "@anthropic-ai/claude-agent-sdk";
import {
  extractProjectDirectory,
  getSessions,
  getClaudeProjectNames,
  type SessionInfo,
} from "./jsonl-reader";

export interface CachedProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
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

  return Promise.all(
    projectNames.map(async (name) => {
      const directory =
        cwdToDir.get(name) || (await extractProjectDirectory(name));
      const projectSessions = allSessions
        .filter((s) => s.cwd === directory)
        .sort((a, b) => b.lastModified - a.lastModified);

      return {
        name,
        directory,
        displayName: deriveDisplayName(directory, name),
        sessionCount: projectSessions.length,
        lastActivity: projectSessions[0]
          ? new Date(projectSessions[0].lastModified).toISOString()
          : null,
      };
    })
  );
}

export async function getCachedProjects(): Promise<CachedProject[]> {
  if (projectsData) return projectsData;
  if (projectsBuilding) return projectsBuilding;

  projectsBuilding = buildProjects();
  projectsData = await projectsBuilding;
  projectsBuilding = null;
  return projectsData;
}

export async function getCachedSessions(
  projectName: string
): Promise<SessionInfo[]> {
  const { sessions } = await getSessions(projectName, 200, 0);
  return sessions;
}

export function invalidateProject(_projectName: string): void {
  projectsData = null;
}

export function invalidateAll(): void {
  projectsData = null;
}
