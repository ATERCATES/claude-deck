export type ProviderId = "claude";

export function getManagedSessionPattern(): RegExp {
  return /^claude-(new-)?[0-9a-z]{4,}/i;
}

export function getProviderIdFromSessionName(
  sessionName: string
): ProviderId | null {
  if (sessionName.startsWith("claude-")) return "claude";
  return null;
}

export function getSessionIdFromName(sessionName: string): string {
  return sessionName.replace(/^claude-/i, "");
}
