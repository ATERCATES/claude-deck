import { watch } from "chokidar";
import path from "path";
import os from "os";
import { WebSocket } from "ws";
import { invalidateAllProjects } from "./jsonl-cache";
import {
  onStateFileChange,
  invalidateSessionName,
  getStatusSnapshot,
} from "../status-monitor";
import { STATES_DIR } from "../hooks/setup";

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

const updateClients = new Set<WebSocket>();

export function addUpdateClient(ws: WebSocket): void {
  updateClients.add(ws);
  ws.on("close", () => updateClients.delete(ws));

  const snapshot = getStatusSnapshot();
  if (Object.keys(snapshot).length > 0) {
    ws.send(JSON.stringify({ type: "session-statuses", statuses: snapshot }));
  }
}

export function broadcast(msg: object): void {
  const data = JSON.stringify(msg);
  for (const ws of updateClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function handleFileChange(filePath: string): void {
  const relative = path.relative(CLAUDE_PROJECTS_DIR, filePath);
  const projectName = relative.split(path.sep)[0];
  if (!projectName) return;

  const existing = debounceTimers.get(projectName);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    projectName,
    setTimeout(() => {
      debounceTimers.delete(projectName);
      invalidateAllProjects();
      broadcast({ type: "project-updated", projectName });
    }, 150)
  );
}

export function startWatcher(): void {
  try {
    // Watch Claude projects for session list updates
    const projectsWatcher = watch(CLAUDE_PROJECTS_DIR, {
      ignoreInitial: true,
      depth: 2,
      ignored: [/node_modules/, /\.git/, /subagents/],
    });

    projectsWatcher.on("change", (fp) => {
      handleFileChange(fp);
      if (fp.endsWith(".jsonl")) {
        const sessionId = path.basename(fp, ".jsonl");
        invalidateSessionName(sessionId);
      }
    });
    projectsWatcher.on("add", (fp) => {
      handleFileChange(fp);
      const relative = path.relative(CLAUDE_PROJECTS_DIR, fp);
      if (!relative.includes(path.sep)) {
        invalidateAllProjects();
        broadcast({ type: "projects-changed" });
      }
    });
    projectsWatcher.on("addDir", () => {
      invalidateAllProjects();
      broadcast({ type: "projects-changed" });
    });

    console.log("> File watcher started on ~/.claude/projects/");

    // Watch session state files written by hooks
    const statesWatcher = watch(STATES_DIR, {
      ignoreInitial: true,
      depth: 0,
    });

    statesWatcher.on("change", onStateFileChange);
    statesWatcher.on("add", onStateFileChange);
    statesWatcher.on("unlink", onStateFileChange);

    console.log(
      "> State file watcher started on ~/.claude-deck/session-states/"
    );
  } catch (err) {
    console.error("Failed to start file watcher:", err);
  }
}
