export const claudeKeys = {
  all: ["claude"] as const,
  projects: () => [...claudeKeys.all, "projects"] as const,
  sessions: (projectName: string) =>
    [...claudeKeys.all, "sessions", projectName] as const,
};
