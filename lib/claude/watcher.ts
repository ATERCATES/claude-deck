import { watch } from "chokidar";
import path from "path";
import os from "os";
import { WebSocket } from "ws";
import { invalidateProject, invalidateAll } from "./jsonl-cache";

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

const updateClients = new Set<WebSocket>();

export function addUpdateClient(ws: WebSocket): void {
  updateClients.add(ws);
  ws.on("close", () => updateClients.delete(ws));
}

function broadcast(msg: object): void {
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

  debounceTimers.set(projectName, setTimeout(() => {
    debounceTimers.delete(projectName);
    invalidateProject(projectName);
    broadcast({ type: "project-updated", projectName });
  }, 500));
}

export function startWatcher(): void {
  try {
    const watcher = watch(CLAUDE_PROJECTS_DIR, {
      ignoreInitial: true,
      depth: 1,
      ignored: [/node_modules/, /\.git/],
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    watcher.on("change", handleFileChange);
    watcher.on("add", (fp) => {
      handleFileChange(fp);
      const relative = path.relative(CLAUDE_PROJECTS_DIR, fp);
      if (!relative.includes(path.sep)) {
        invalidateAll();
        broadcast({ type: "projects-changed" });
      }
    });
    watcher.on("addDir", () => {
      invalidateAll();
      broadcast({ type: "projects-changed" });
    });

    console.log("> File watcher started on ~/.claude/projects/");
  } catch (err) {
    console.error("Failed to start file watcher:", err);
  }
}
