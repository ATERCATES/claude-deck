export const PROVIDER_IDS = ["claude"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  cli: string;
  configDir: string;
  autoApproveFlag?: string;
  supportsResume: boolean;
  supportsFork: boolean;
  resumeFlag?: string;
  modelFlag?: string;
  initialPromptFlag?: string;
  defaultArgs?: string[];
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic's official CLI",
    cli: "claude",
    configDir: "~/.claude",
    autoApproveFlag: "--dangerously-skip-permissions",
    supportsResume: true,
    supportsFork: true,
    resumeFlag: "--resume",
    initialPromptFlag: "",
  },
];

export const PROVIDER_MAP = new Map<ProviderId, ProviderDefinition>(
  PROVIDERS.map((provider) => [provider.id, provider])
);

export function getProviderDefinition(id: ProviderId): ProviderDefinition {
  const provider = PROVIDER_MAP.get(id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

export function getAllProviderDefinitions(): ProviderDefinition[] {
  return PROVIDERS;
}

export function isValidProviderId(value: string): value is ProviderId {
  return PROVIDER_MAP.has(value as ProviderId);
}

export function getManagedSessionPattern(): RegExp {
  return /^claude-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
}

export function getProviderIdFromSessionName(
  sessionName: string
): ProviderId | null {
  if (sessionName.startsWith("claude-")) {
    return "claude";
  }
  return null;
}

export function getSessionIdFromName(sessionName: string): string {
  return sessionName.replace(/^claude-/i, "");
}
