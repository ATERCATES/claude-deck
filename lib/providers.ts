import {
  type ProviderId,
  getProviderDefinition,
  isValidProviderId,
} from "./providers/registry";

export type AgentType = ProviderId;

export interface AgentProvider {
  id: AgentType;
  name: string;
  description: string;
  command: string;
  supportsResume: boolean;
  supportsFork: boolean;
  buildFlags(options: BuildFlagsOptions): string[];
  waitingPatterns: RegExp[];
  runningPatterns: RegExp[];
  idlePatterns: RegExp[];
  getSessionId?: (projectPath: string) => string | null;
  configDir: string;
}

export interface BuildFlagsOptions {
  sessionId?: string | null;
  parentSessionId?: string | null;
  skipPermissions?: boolean;
  autoApprove?: boolean;
  model?: string;
  initialPrompt?: string;
}

const SPINNER_CHARS = /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/;

export const claudeProvider: AgentProvider = {
  id: "claude",
  name: "Claude Code",
  description: "Anthropic's official CLI",
  command: "claude",
  configDir: "~/.claude",
  supportsResume: true,
  supportsFork: true,

  buildFlags(options: BuildFlagsOptions): string[] {
    const def = getProviderDefinition("claude");
    const flags: string[] = [];

    if (
      (options.skipPermissions || options.autoApprove) &&
      def.autoApproveFlag
    ) {
      flags.push(def.autoApproveFlag);
    }

    if (options.sessionId && def.resumeFlag) {
      flags.push(`${def.resumeFlag} ${options.sessionId}`);
    } else if (options.parentSessionId && def.resumeFlag) {
      flags.push(`${def.resumeFlag} ${options.parentSessionId}`);
      flags.push("--fork-session");
    }

    if (options.initialPrompt?.trim() && def.initialPromptFlag !== undefined) {
      const prompt = options.initialPrompt.trim();
      const escapedPrompt = prompt.replace(/'/g, "'\\''");
      flags.push(`'${escapedPrompt}'`);
    }

    return flags;
  },

  waitingPatterns: [
    /\[Y\/n\]/i,
    /\[y\/N\]/i,
    /Allow\?/i,
    /Approve\?/i,
    /Continue\?/i,
    /Press Enter/i,
    /waiting for/i,
    /\(yes\/no\)/i,
    /Do you want to/i,
    /Esc to cancel/i,
    />\s*1\.\s*Yes/,
    /Yes, allow all/i,
    /allow all edits/i,
    /allow all commands/i,
  ],

  runningPatterns: [
    /thinking/i,
    /Working/i,
    /Reading/i,
    /Writing/i,
    /Searching/i,
    /Running/i,
    /Executing/i,
    SPINNER_CHARS,
  ],

  idlePatterns: [/^>\s*$/m, /claude.*>\s*$/im, /✻\s*Sautéed/i, /✻\s*Done/i],
};

export const providers: Record<AgentType, AgentProvider> = {
  claude: claudeProvider,
};

export function getProvider(agentType: AgentType): AgentProvider {
  return providers[agentType] || claudeProvider;
}

export function getAllProviders(): AgentProvider[] {
  return Object.values(providers);
}

export function isValidAgentType(value: string): value is AgentType {
  return isValidProviderId(value);
}

export {
  getProviderDefinition,
  getAllProviderDefinitions,
} from "./providers/registry";
