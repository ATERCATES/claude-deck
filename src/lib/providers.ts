export type ProviderId = "claude";

export type AgentType = ProviderId;

export const CLAUDE_COMMAND = "claude";
export const CLAUDE_AUTO_APPROVE_FLAG = "--dangerously-skip-permissions";

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

export interface BuildFlagsOptions {
  sessionId?: string | null;
  parentSessionId?: string | null;
  skipPermissions?: boolean;
  autoApprove?: boolean;
  model?: string;
  initialPrompt?: string;
}

export function buildClaudeFlags(options: BuildFlagsOptions): string[] {
  const flags: string[] = [];

  if (options.skipPermissions || options.autoApprove) {
    flags.push(CLAUDE_AUTO_APPROVE_FLAG);
  }

  if (options.sessionId) {
    flags.push("--resume", options.sessionId);
  } else if (options.parentSessionId) {
    flags.push("--resume", options.parentSessionId, "--fork-session");
  }

  if (options.initialPrompt?.trim()) {
    const escapedPrompt = options.initialPrompt.trim().replace(/'/g, "'\\''");
    flags.push(`'${escapedPrompt}'`);
  }

  return flags;
}
