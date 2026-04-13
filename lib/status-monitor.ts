/**
 * Session status monitor — JSONL-based detection.
 *
 * Determines session state by reading the tail of Claude Code's JSONL
 * transcript files instead of scraping terminal content.
 *
 * Detection criteria:
 * - RUNNING:  JSONL mtime changed in last 10s AND last entry is not turn_duration
 * - WAITING:  Last entry is assistant/tool_use with no subsequent tool_result
 *             (Claude requested a tool, user hasn't approved)
 * - IDLE:     Last entry is system/turn_duration (turn finished)
 *             OR file hasn't changed in >10s with no active indicators
 * - DEAD:     tmux session doesn't exist
 *
 * Resource usage:
 * - 1x exec("tmux list-sessions") per tick (3s fallback)
 * - fs.read of last 16KB per JSONL file — only when Chokidar fires
 * - Zero tmux capture-pane, zero terminal pattern matching
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  getManagedSessionPattern,
  getSessionIdFromName,
  getProviderIdFromSessionName,
} from "./providers/registry";
import type { AgentType } from "./providers";
import { broadcast } from "./claude/watcher";
import { getDb } from "./db";

const execAsync = promisify(exec);

// --- Configuration ---

const TICK_INTERVAL_MS = 3000;
const RUNNING_THRESHOLD_MS = 10_000;
const CLAUDE_ID_CACHE_TTL = 60_000;
const JSONL_READ_SIZE = 16384; // 16KB tail read

const UUID_PATTERN = getManagedSessionPattern();
const CLAUDE_DIR =
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

// Entry types that are metadata, not conversation
const METADATA_TYPES = new Set([
  "file-history-snapshot",
  "custom-title",
  "permission-mode",
]);

// --- Types ---

export type SessionStatus = "running" | "waiting" | "idle" | "dead";

interface JsonlEntry {
  type?: string;
  subtype?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; name?: string; text?: string }> | string;
  };
}

interface TrackedSession {
  jsonlPath: string | null;
  claudeSessionId: string | null;
  claudeIdCachedAt: number;
  cwdPath: string | null;
  cwdCachedAt: number;
  status: SessionStatus;
  lastLine: string;
  waitingContext?: string;
  lastMtimeMs: number;
}

export interface SessionStatusSnapshot {
  sessionName: string;
  status: SessionStatus;
  lastLine: string;
  waitingContext?: string;
  claudeSessionId: string | null;
  agentType: AgentType;
}

// --- State ---

const tracked = new Map<string, TrackedSession>();
let currentSnapshot: Record<string, SessionStatusSnapshot> = {};
let monitorTimer: ReturnType<typeof setInterval> | null = null;

// --- JSONL reading (pure Node fs, zero exec) ---

async function readJsonlTail(
  filePath: string
): Promise<{ entries: JsonlEntry[]; mtimeMs: number } | null> {
  let fd: fs.promises.FileHandle | null = null;
  try {
    fd = await fs.promises.open(filePath, "r");
    const stat = await fd.stat();
    const readSize = Math.min(stat.size, JSONL_READ_SIZE);
    if (readSize === 0) return { entries: [], mtimeMs: stat.mtimeMs };

    const buffer = Buffer.alloc(readSize);
    await fd.read(buffer, 0, readSize, stat.size - readSize);

    const text = buffer.toString("utf-8");
    // First line may be partial (we started mid-line), skip it
    const firstNewline = text.indexOf("\n");
    const clean = firstNewline >= 0 ? text.slice(firstNewline + 1) : text;

    const entries: JsonlEntry[] = [];
    for (const line of clean.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed / partial lines
      }
    }

    return { entries, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  } finally {
    await fd?.close();
  }
}

// --- Status determination ---

function determineStatus(
  entries: JsonlEntry[],
  mtimeMs: number
): { status: SessionStatus; lastLine: string; waitingContext?: string } {
  const mtimeAge = Date.now() - mtimeMs;

  // Filter to meaningful entries (skip metadata)
  const meaningful = entries.filter((e) => !METADATA_TYPES.has(e.type || ""));
  const last = meaningful[meaningful.length - 1];

  if (!last) {
    return { status: "idle", lastLine: "" };
  }

  // IDLE: turn finished (definitive signal)
  if (last.type === "system" && last.subtype === "turn_duration") {
    return { status: "idle", lastLine: findLastText(meaningful) };
  }

  // RUNNING: file recently modified and turn hasn't finished
  if (mtimeAge < RUNNING_THRESHOLD_MS) {
    return { status: "running", lastLine: findLastText(meaningful) };
  }

  // WAITING: last assistant entry has tool_use without a following tool_result
  if (last.message?.role === "assistant") {
    const content = last.message?.content;
    if (Array.isArray(content)) {
      const toolUse = content.find((c) => c.type === "tool_use");
      if (toolUse) {
        const toolName = toolUse.name || "unknown tool";
        return {
          status: "waiting",
          lastLine: `Waiting for approval: ${toolName}`,
          waitingContext: `Permission requested for ${toolName}`,
        };
      }
    }
  }

  // Default: idle
  return { status: "idle", lastLine: findLastText(meaningful) };
}

function findLastText(entries: JsonlEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const content = entries[i].message?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      if (content[j].type === "text" && content[j].text) {
        return content[j].text!.slice(0, 200);
      }
    }
  }
  return "";
}

// --- JSONL path resolution ---

function findJsonlPath(
  claudeSessionId: string,
  cwdPath: string | null
): string | null {
  if (!claudeSessionId) return null;

  // Try cwd-based path first
  if (cwdPath) {
    const dirName = cwdPath.replace(/\//g, "-");
    const candidate = path.join(
      CLAUDE_DIR,
      "projects",
      dirName,
      `${claudeSessionId}.jsonl`
    );
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: search all project directories
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  try {
    for (const dir of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const candidate = path.join(
        projectsDir,
        dir.name,
        `${claudeSessionId}.jsonl`
      );
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }

  return null;
}

async function resolveCwd(sessionName: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `tmux display-message -t "${sessionName}" -p "#{pane_current_path}" 2>/dev/null || echo ""`
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveClaudeSessionId(
  sessionName: string
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `tmux show-environment -t "${sessionName}" CLAUDE_SESSION_ID 2>/dev/null || echo ""`
    );
    const line = stdout.trim();
    if (line.startsWith("CLAUDE_SESSION_ID=")) {
      const val = line.replace("CLAUDE_SESSION_ID=", "");
      if (val && val !== "null") return val;
    }
  } catch {
    // ignore
  }
  return null;
}

// --- tmux ---

async function listTmuxSessions(): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync(
      "tmux list-sessions -F '#{session_name}' 2>/dev/null || echo \"\""
    );
    return new Set(stdout.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

// --- Session lifecycle ---

async function resolveSessionMapping(
  session: TrackedSession,
  sessionName: string
): Promise<void> {
  const now = Date.now();

  if (
    !session.claudeSessionId ||
    now - session.claudeIdCachedAt > CLAUDE_ID_CACHE_TTL
  ) {
    session.claudeSessionId = await resolveClaudeSessionId(sessionName);
    session.claudeIdCachedAt = now;
  }

  if (!session.cwdPath || now - session.cwdCachedAt > CLAUDE_ID_CACHE_TTL) {
    session.cwdPath = await resolveCwd(sessionName);
    session.cwdCachedAt = now;
  }

  if (!session.jsonlPath && session.claudeSessionId) {
    session.jsonlPath = findJsonlPath(session.claudeSessionId, session.cwdPath);
  }
}

async function evaluateSession(session: TrackedSession): Promise<void> {
  if (!session.jsonlPath) {
    session.status = "idle";
    session.lastLine = "";
    session.waitingContext = undefined;
    return;
  }

  const result = await readJsonlTail(session.jsonlPath);
  if (!result) {
    session.status = "idle";
    session.lastLine = "";
    session.waitingContext = undefined;
    return;
  }

  session.lastMtimeMs = result.mtimeMs;
  const { status, lastLine, waitingContext } = determineStatus(
    result.entries,
    result.mtimeMs
  );
  session.status = status;
  session.lastLine = lastLine;
  session.waitingContext = waitingContext;
}

function createTrackedSession(): TrackedSession {
  return {
    jsonlPath: null,
    claudeSessionId: null,
    claudeIdCachedAt: 0,
    cwdPath: null,
    cwdCachedAt: 0,
    status: "idle",
    lastLine: "",
    lastMtimeMs: 0,
  };
}

// --- Core tick ---

function buildSnapshot(): Record<string, SessionStatusSnapshot> {
  const snap: Record<string, SessionStatusSnapshot> = {};
  for (const [name, session] of tracked) {
    const id = getSessionIdFromName(name);
    const agentType = getProviderIdFromSessionName(name) || "claude";
    snap[id] = {
      sessionName: name,
      status: session.status,
      lastLine: session.lastLine,
      ...(session.status === "waiting" && session.waitingContext
        ? { waitingContext: session.waitingContext }
        : {}),
      claudeSessionId: session.claudeSessionId,
      agentType,
    };
  }
  return snap;
}

function snapshotChanged(
  prev: Record<string, SessionStatusSnapshot>,
  next: Record<string, SessionStatusSnapshot>
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return true;
  for (const id of nextKeys) {
    const p = prev[id];
    const n = next[id];
    if (!p || p.status !== n.status || p.lastLine !== n.lastLine) return true;
  }
  return false;
}

function updateDb(
  prev: Record<string, SessionStatusSnapshot>,
  next: Record<string, SessionStatusSnapshot>
): void {
  try {
    const db = getDb();
    for (const [id, snap] of Object.entries(next)) {
      if (prev[id]?.status === snap.status) continue;
      db.prepare(
        "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?"
      ).run(id);
      if (snap.claudeSessionId) {
        db.prepare(
          "UPDATE sessions SET claude_session_id = ? WHERE id = ? AND (claude_session_id IS NULL OR claude_session_id != ?)"
        ).run(snap.claudeSessionId, id, snap.claudeSessionId);
      }
    }
  } catch {
    // DB errors shouldn't break the monitor
  }
}

async function tick(): Promise<void> {
  const tmuxSessions = await listTmuxSessions();
  const managedNames = [...tmuxSessions].filter((s) => UUID_PATTERN.test(s));

  // Clear if no sessions
  if (managedNames.length === 0 && Object.keys(currentSnapshot).length > 0) {
    currentSnapshot = {};
    tracked.clear();
    broadcast({ type: "session-statuses", statuses: {} });
    return;
  }

  // Ensure all managed sessions are tracked
  for (const name of managedNames) {
    if (!tracked.has(name)) tracked.set(name, createTrackedSession());
  }

  // Clean up dead sessions
  for (const [name] of tracked) {
    if (!tmuxSessions.has(name)) tracked.delete(name);
  }

  // Resolve and evaluate all sessions in parallel
  await Promise.all(
    managedNames.map(async (name) => {
      const session = tracked.get(name)!;
      await resolveSessionMapping(session, name);
      await evaluateSession(session);
    })
  );

  const newSnapshot = buildSnapshot();

  if (snapshotChanged(currentSnapshot, newSnapshot)) {
    updateDb(currentSnapshot, newSnapshot);
    currentSnapshot = newSnapshot;
    broadcast({ type: "session-statuses", statuses: newSnapshot });
  }
}

// --- Public API ---

export function getStatusSnapshot(): Record<string, SessionStatusSnapshot> {
  return currentSnapshot;
}

export function acknowledge(sessionName: string): void {
  // With JSONL-based detection, acknowledge is a no-op — status is
  // determined by file content, not by an acknowledged flag.
  void sessionName;
}

/** Called by Chokidar when a JSONL file changes — evaluates instantly. */
export function onJsonlChange(filePath: string): void {
  for (const [, session] of tracked) {
    if (session.jsonlPath === filePath) {
      evaluateSession(session)
        .then(() => {
          const newSnapshot = buildSnapshot();
          if (snapshotChanged(currentSnapshot, newSnapshot)) {
            updateDb(currentSnapshot, newSnapshot);
            currentSnapshot = newSnapshot;
            broadcast({ type: "session-statuses", statuses: newSnapshot });
          }
        })
        .catch(console.error);
      return;
    }
  }

  // Unknown file — might be a new session, trigger full tick
  tick().catch(console.error);
}

export function startStatusMonitor(): void {
  if (monitorTimer) return;

  setTimeout(() => tick().catch(console.error), 500);

  monitorTimer = setInterval(() => {
    tick().catch(console.error);
  }, TICK_INTERVAL_MS);

  console.log("> Status monitor started (JSONL-based, 3s fallback tick)");
}

export function stopStatusMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
