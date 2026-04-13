import type { ProviderId } from "./providers/registry";

export type AgentType = ProviderId;

export const CLAUDE_COMMAND = "claude";
export const CLAUDE_AUTO_APPROVE_FLAG = "--dangerously-skip-permissions";

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

export function isValidAgentType(value: string): value is AgentType {
  return value === "claude";
}
