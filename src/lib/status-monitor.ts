/**
 * Session status monitor — hook-based detection.
 *
 * Claude Code hooks write state files to ~/.claude-deck/session-states/.
 * This module reads those files and pushes updates to the frontend via WebSocket.
 *
 * The only periodic work is `tmux list-sessions` every 3s to detect dead sessions.
 * All state transitions are event-driven via Chokidar watching the state files dir.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import {
  getManagedSessionPattern,
  getSessionIdFromName,
  getProviderIdFromSessionName,
  type AgentType,
} from "./providers";
import { broadcast } from "./claude/watcher";
import { getDb } from "./db";
import { getTunnelUrls } from "./tunnels";
import { STATES_DIR } from "./hooks/setup";
import { getSessionInfo } from "@anthropic-ai/claude-agent-sdk";

const execAsync = promisify(exec);

const TICK_INTERVAL_MS = 3000;
const SESSION_NAME_CACHE_TTL = 10_000;
const UUID_PATTERN = getManagedSessionPattern();

// Cache for session metadata (name + cwd from SDK)
const sessionMetaCache = new Map<
  string,
  { name: string; cwd: string | null; cachedAt: number }
>();

// --- Types ---

export type SessionStatus = "running" | "waiting" | "idle" | "dead";

interface StateFile {
  status: "running" | "waiting" | "idle";
  lastLine: string;
  waitingContext?: string;
  ts: number;
}

interface DbSessionMeta {
  name: string;
  working_directory: string | null;
  claude_session_id: string | null;
}

export interface SessionStatusSnapshot {
  sessionName: string;
  cwd: string | null;
  status: SessionStatus;
  lastLine: string;
  waitingContext?: string;
  claudeSessionId: string | null;
  agentType: AgentType;
  listeningPorts: number[];
  tunnelUrls: Record<number, string>;
}

// --- State ---

let currentSnapshot: Record<string, SessionStatusSnapshot> = {};
let monitorTimer: ReturnType<typeof setInterval> | null = null;

// --- State file reading ---

function readStateFile(sessionId: string): StateFile | null {
  try {
    const filePath = path.join(STATES_DIR, `${sessionId}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function listStateFiles(): Map<string, StateFile> {
  const map = new Map<string, StateFile>();
  try {
    for (const file of fs.readdirSync(STATES_DIR)) {
      if (!file.endsWith(".json")) continue;
      const sessionId = file.replace(".json", "");
      const state = readStateFile(sessionId);
      if (state) map.set(sessionId, state);
    }
  } catch {
    // dir may not exist yet
  }
  return map;
}

// --- Port detection ---

interface ListeningProcess {
  pid: string;
  port: number;
  cwd: string;
}

let cachedListeners: { data: ListeningProcess[]; ts: number } | null = null;
const LISTENER_CACHE_TTL = 2500;

async function getListeningProcesses(): Promise<ListeningProcess[]> {
  const now = Date.now();
  if (cachedListeners && now - cachedListeners.ts < LISTENER_CACHE_TTL) {
    return cachedListeners.data;
  }

  try {
    const { stdout } = await execAsync(
      `lsof -P -iTCP -sTCP:LISTEN -Fn 2>/dev/null || true`
    );

    // Parse lsof output: lines alternate between p (pid) and n (name)
    const results: ListeningProcess[] = [];
    let currentPid = "";
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = line.slice(1);
      } else if (line.startsWith("n") && currentPid) {
        const port = parseInt(line.slice(line.lastIndexOf(":") + 1), 10);
        if (!isNaN(port) && port > 0) {
          results.push({ pid: currentPid, port, cwd: "" });
        }
      }
    }

    // Deduplicate by pid+port
    const unique = [
      ...new Map(results.map((r) => [`${r.pid}:${r.port}`, r])).values(),
    ];

    // Batch-resolve cwds
    if (unique.length > 0) {
      const pids = [...new Set(unique.map((r) => r.pid))].join(",");
      try {
        const { stdout: cwdOut } = await execAsync(
          `lsof -a -p ${pids} -d cwd -Fpn 2>/dev/null || true`
        );
        const cwdMap = new Map<string, string>();
        let pid = "";
        for (const line of cwdOut.split("\n")) {
          if (line.startsWith("p")) pid = line.slice(1);
          else if (line.startsWith("n") && pid) cwdMap.set(pid, line.slice(1));
        }
        for (const entry of unique) {
          entry.cwd = cwdMap.get(entry.pid) || "";
        }
      } catch {
        // cwd resolution failed, proceed without
      }
    }

    cachedListeners = { data: unique, ts: now };
    return unique;
  } catch {
    return [];
  }
}

async function detectSessionPorts(
  sessionCwd: string | null
): Promise<number[]> {
  if (!sessionCwd) return [];

  const listeners = await getListeningProcesses();
  return [
    ...new Set(
      listeners.filter((l) => l.cwd.startsWith(sessionCwd)).map((l) => l.port)
    ),
  ].sort((a, b) => a - b);
}

// --- tmux ---

async function listTmuxSessions(): Promise<Map<string, string>> {
  // Returns Map<sessionId, sessionName>
  try {
    const { stdout } = await execAsync(
      "tmux list-sessions -F '#{session_name}' 2>/dev/null || echo \"\""
    );
    const map = new Map<string, string>();
    for (const name of stdout.trim().split("\n")) {
      if (!name || !UUID_PATTERN.test(name)) continue;
      map.set(getSessionIdFromName(name), name);
    }
    return map;
  } catch {
    return new Map();
  }
}

// --- Session metadata resolution ---

async function resolveSessionMeta(
  sessionId: string
): Promise<{ name: string; cwd: string | null }> {
  const cached = sessionMetaCache.get(sessionId);
  if (cached && Date.now() - cached.cachedAt < SESSION_NAME_CACHE_TTL) {
    return { name: cached.name, cwd: cached.cwd };
  }

  try {
    const info = await getSessionInfo(sessionId);
    if (info) {
      const name = info.customTitle || info.summary || sessionId.slice(0, 8);
      const cwd = info.cwd || null;
      sessionMetaCache.set(sessionId, { name, cwd, cachedAt: Date.now() });
      return { name, cwd };
    }
  } catch {
    // SDK lookup failed — use short ID
  }

  const fallback = sessionId.slice(0, 8);
  sessionMetaCache.set(sessionId, {
    name: fallback,
    cwd: null,
    cachedAt: Date.now(),
  });
  return { name: fallback, cwd: null };
}

// --- Snapshot building ---

async function buildSnapshot(
  tmuxSessions: Map<string, string>,
  stateFiles: Map<string, StateFile>
): Promise<Record<string, SessionStatusSnapshot>> {
  const snap: Record<string, SessionStatusSnapshot> = {};
  const db = getDb();
  const entries = await Promise.all(
    [...tmuxSessions.entries()].map(async ([sessionId, tmuxName]) => {
      const dbSession = db
        .prepare(
          "SELECT name, working_directory, claude_session_id FROM sessions WHERE id = ? LIMIT 1"
        )
        .get(sessionId) as DbSessionMeta | undefined;

      if (dbSession) {
        const cwd = dbSession.working_directory || null;
        const ports = await detectSessionPorts(cwd);
        return {
          sessionId,
          tmuxName,
          name: dbSession.name,
          cwd,
          claudeSessionId: dbSession.claude_session_id,
          ports,
        };
      }

      const meta = await resolveSessionMeta(sessionId);
      const ports = await detectSessionPorts(meta.cwd);
      return {
        sessionId,
        tmuxName,
        name: meta.name,
        cwd: meta.cwd,
        claudeSessionId: null,
        ports,
      };
    })
  );

  const allTunnels = getTunnelUrls();
  for (const {
    sessionId,
    tmuxName,
    name,
    cwd,
    claudeSessionId,
    ports,
  } of entries) {
    const agentType = getProviderIdFromSessionName(tmuxName) || "claude";
    const state = stateFiles.get(sessionId);

    const tunnelUrls: Record<number, string> = {};
    for (const port of ports) {
      if (allTunnels[port]) tunnelUrls[port] = allTunnels[port];
    }

    snap[sessionId] = {
      sessionName: name,
      cwd,
      status: state?.status || "idle",
      lastLine: state?.lastLine || "",
      ...(state?.status === "waiting" && state.waitingContext
        ? { waitingContext: state.waitingContext }
        : {}),
      claudeSessionId,
      agentType,
      listeningPorts: ports,
      tunnelUrls,
    };
  }

  // Filter out hidden sessions
  try {
    const hiddenRows = db
      .prepare("SELECT item_id FROM hidden_items WHERE item_type = 'session'")
      .all() as { item_id: string }[];
    for (const { item_id } of hiddenRows) {
      delete snap[item_id];
    }
  } catch {
    // DB errors shouldn't break the monitor
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
    if (
      !p ||
      p.status !== n.status ||
      p.lastLine !== n.lastLine ||
      p.sessionName !== n.sessionName ||
      JSON.stringify(p.listeningPorts) !== JSON.stringify(n.listeningPorts) ||
      JSON.stringify(p.tunnelUrls) !== JSON.stringify(n.tunnelUrls)
    )
      return true;
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
    }
  } catch {
    // DB errors shouldn't break the monitor
  }
}

// --- Core tick (only for dead detection + state file sync) ---

async function tick(): Promise<void> {
  const tmuxSessions = await listTmuxSessions();
  const stateFiles = listStateFiles();

  // Clean up state files for sessions that no longer exist in tmux
  for (const sessionId of stateFiles.keys()) {
    if (!tmuxSessions.has(sessionId)) {
      try {
        fs.unlinkSync(path.join(STATES_DIR, `${sessionId}.json`));
      } catch {
        // ignore
      }
    }
  }

  const newSnapshot = await buildSnapshot(tmuxSessions, stateFiles);

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

/**
 * Called by Chokidar when a state file in ~/.claude-deck/session-states/ changes.
 * Triggers an immediate re-read and broadcast.
 */
export function onStateFileChange(): void {
  tick().catch(console.error);
}

export function invalidateSessionName(sessionId: string): void {
  sessionMetaCache.delete(sessionId);
}

export function startStatusMonitor(): void {
  if (monitorTimer) return;

  // Ensure states directory exists
  fs.mkdirSync(STATES_DIR, { recursive: true });

  // Initial tick
  setTimeout(() => tick().catch(console.error), 500);

  // Periodic fallback (catches tmux session death, missed events)
  monitorTimer = setInterval(() => {
    tick().catch(console.error);
  }, TICK_INTERVAL_MS);

  console.log("> Status monitor started (hook-based, 3s fallback tick)");
}

export function stopStatusMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
