import { extractProjectDirectory, getSessions, getClaudeProjectNames, type SessionInfo } from "./jsonl-reader";

interface CachedProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
}

const projectsCache: { data: CachedProject[] | null; building: Promise<CachedProject[]> | null } = {
  data: null,
  building: null,
};

const sessionsCache = new Map<string, { data: SessionInfo[]; timestamp: number }>();

function deriveDisplayName(directory: string | null, encoded: string): string {
  if (directory) {
    const parts = directory.split("/");
    return parts[parts.length - 1] || directory;
  }
  const decoded = encoded.replace(/^-/, "/").replace(/-/g, "/");
  const parts = decoded.split("/");
  return parts[parts.length - 1] || decoded;
}

export async function getCachedProjects(): Promise<CachedProject[]> {
  if (projectsCache.data) return projectsCache.data;
  if (projectsCache.building) return projectsCache.building;

  projectsCache.building = buildProjectsCache();
  const result = await projectsCache.building;
  projectsCache.data = result;
  projectsCache.building = null;
  return result;
}

async function buildProjectsCache(): Promise<CachedProject[]> {
  const projectNames = getClaudeProjectNames();
  return Promise.all(
    projectNames.map(async (name) => {
      const [directory, sessionData] = await Promise.all([
        extractProjectDirectory(name),
        getSessions(name, 1, 0),
      ]);
      return {
        name,
        directory,
        displayName: deriveDisplayName(directory, name),
        sessionCount: sessionData.total,
        lastActivity: sessionData.sessions[0]?.lastActivity || null,
      };
    })
  );
}

export async function getCachedSessions(projectName: string): Promise<SessionInfo[]> {
  const cached = sessionsCache.get(projectName);
  if (cached && Date.now() - cached.timestamp < 60000) return cached.data;

  const { sessions } = await getSessions(projectName, 200, 0);
  sessionsCache.set(projectName, { data: sessions, timestamp: Date.now() });
  return sessions;
}

export function invalidateProject(projectName: string): void {
  sessionsCache.delete(projectName);
  projectsCache.data = null;
}

export function invalidateAll(): void {
  sessionsCache.clear();
  projectsCache.data = null;
}
