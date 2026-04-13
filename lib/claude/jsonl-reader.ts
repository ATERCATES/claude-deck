import fs from "fs";
import path from "path";
import readline from "readline";
import os from "os";
import { listSessions as sdkListSessions } from "@anthropic-ai/claude-agent-sdk";

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

export interface JsonlEntry {
  sessionId?: string;
  timestamp?: string;
  type?: string;
  message?: {
    role: "user" | "assistant";
    content: string | ContentBlock[];
  };
  uuid?: string;
  parentUuid?: string | null;
  leafUuid?: string;
  summary?: string;
  customTitle?: string;
  cwd?: string;
  isApiErrorMessage?: boolean;
  toolUseResult?: {
    agentId?: string;
  };
}

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface SessionInfo {
  sessionId: string;
  summary: string;
  lastActivity: string;
  messageCount: number;
  cwd: string | null;
}

export interface SessionMessage {
  sessionId: string;
  timestamp: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  uuid?: string;
  parentUuid?: string | null;
  subagentTools?: AgentTool[];
}

export interface AgentTool {
  toolId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: string;
  timestamp: string;
}

export function getClaudeProjectNames(): string[] {
  try {
    return fs
      .readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function getProjectDir(projectName: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, projectName);
}

function getJsonlFiles(projectDir: string): string[] {
  try {
    return fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
      .map((f) => path.join(projectDir, f));
  } catch {
    return [];
  }
}

function getAgentFiles(projectDir: string): string[] {
  try {
    return fs
      .readdirSync(projectDir)
      .filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))
      .map((f) => path.join(projectDir, f));
  } catch {
    return [];
  }
}

async function readJsonlFile(filePath: string): Promise<JsonlEntry[]> {
  const entries: JsonlEntry[] = [];
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export async function extractProjectDirectory(
  projectName: string
): Promise<string | null> {
  const projectDir = getProjectDir(projectName);
  const files = getJsonlFiles(projectDir);

  for (const file of files.slice(0, 3)) {
    const stream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.cwd) {
          rl.close();
          stream.destroy();
          return entry.cwd;
        }
      } catch {}
    }
  }
  return null;
}

export async function getSessions(
  projectName: string,
  limit = 20,
  offset = 0
): Promise<{ sessions: SessionInfo[]; total: number }> {
  const dir = await extractProjectDirectory(projectName);
  const sdkSessions = await sdkListSessions(dir ? { dir } : undefined);

  const sessions: SessionInfo[] = sdkSessions
    .filter((s) => !s.summary?.startsWith('{ "'))
    .map((s) => ({
      sessionId: s.sessionId,
      summary: s.customTitle || s.summary || "New Session",
      lastActivity: new Date(s.lastModified).toISOString(),
      messageCount: (s.fileSize ?? 0) > 500 ? 3 : 0,
      cwd: s.cwd || dir || null,
    }));

  return {
    sessions: sessions.slice(offset, offset + limit),
    total: sessions.length,
  };
}

export async function getSessionMessages(
  projectName: string,
  sessionId: string,
  limit = 100,
  offset = 0
): Promise<{ messages: SessionMessage[]; total: number; hasMore: boolean }> {
  const projectDir = getProjectDir(projectName);
  const files = getJsonlFiles(projectDir);
  const agentToolsMap = await loadAgentTools(projectDir);
  const messages: SessionMessage[] = [];

  for (const file of files) {
    const entries = await readJsonlFile(file);
    for (const entry of entries) {
      if (entry.sessionId !== sessionId) continue;
      if (entry.isApiErrorMessage) continue;
      if (!entry.message?.role) continue;

      const content: ContentBlock[] = Array.isArray(entry.message.content)
        ? entry.message.content
        : [{ type: "text", text: String(entry.message.content) }];

      const msg: SessionMessage = {
        sessionId: entry.sessionId,
        timestamp: entry.timestamp || new Date(0).toISOString(),
        role: entry.message.role,
        content,
        uuid: entry.uuid,
        parentUuid: entry.parentUuid,
      };

      if (entry.toolUseResult?.agentId) {
        const tools = agentToolsMap.get(entry.toolUseResult.agentId);
        if (tools) {
          msg.subagentTools = tools;
        }
      }

      messages.push(msg);
    }
  }

  messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const total = messages.length;
  const sliced = messages.slice(offset, offset + limit);

  return {
    messages: sliced,
    total,
    hasMore: offset + limit < total,
  };
}

async function loadAgentTools(
  projectDir: string
): Promise<Map<string, AgentTool[]>> {
  const agentFiles = getAgentFiles(projectDir);
  const map = new Map<string, AgentTool[]>();

  for (const file of agentFiles) {
    const agentId = path.basename(file).replace(/^agent-|\.jsonl$/g, "");
    const entries = await readJsonlFile(file);
    const tools: AgentTool[] = [];
    const toolUseMap = new Map<
      string,
      { name: string; input: Record<string, unknown>; timestamp: string }
    >();

    for (const entry of entries) {
      if (!entry.message?.content || !Array.isArray(entry.message.content))
        continue;

      for (const block of entry.message.content) {
        if (block.type === "tool_use" && block.id && block.name) {
          toolUseMap.set(block.id, {
            name: block.name,
            input: block.input || {},
            timestamp: entry.timestamp || "",
          });
        }
        if (block.type === "tool_result" && block.tool_use_id) {
          const use = toolUseMap.get(block.tool_use_id);
          if (use) {
            tools.push({
              toolId: block.tool_use_id,
              toolName: use.name,
              toolInput: use.input,
              toolResult: block.content || undefined,
              timestamp: use.timestamp,
            });
          }
        }
      }
    }

    if (tools.length > 0) {
      map.set(agentId, tools);
    }
  }

  return map;
}
