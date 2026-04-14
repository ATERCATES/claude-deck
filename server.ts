import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { initDb } from "./lib/db";
import { startWatcher, addUpdateClient } from "./lib/claude/watcher";
import { startStatusMonitor } from "./lib/status-monitor";
import { setupHooks } from "./lib/hooks/setup";
import {
  validateSession,
  parseCookies,
  COOKIE_NAME,
  hasUsers,
} from "./lib/auth";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || (dev ? "localhost" : "0.0.0.0");

// Support: npm run dev -- -p 3012
const pFlagIndex = process.argv.indexOf("-p");
const portArg = pFlagIndex !== -1 ? process.argv[pFlagIndex + 1] : undefined;
const port = parseInt(portArg || process.env.PORT || "3011", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const terminalWss = new WebSocketServer({ noServer: true });
  const updatesWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");

    // Validate auth for WebSocket connections
    if (hasUsers()) {
      const cookies = parseCookies(request.headers.cookie);
      const token = cookies[COOKIE_NAME];
      const user = token ? validateSession(token) : null;

      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    if (pathname === "/ws/terminal") {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit("connection", ws, request);
      });
    } else if (pathname === "/ws/updates") {
      updatesWss.handleUpgrade(request, socket, head, (ws) => {
        setupHeartbeat(ws);
        addUpdateClient(ws);
      });
    }
  });

  // Heartbeat: ping every 30s, kill if no pong in 10s
  const HEARTBEAT_INTERVAL = 30000;
  const _HEARTBEAT_TIMEOUT = 10000;

  function setupHeartbeat(ws: WebSocket) {
    let alive = true;
    ws.on("pong", () => {
      alive = true;
    });
    const interval = setInterval(() => {
      if (!alive) {
        ws.terminate();
        clearInterval(interval);
        return;
      }
      alive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL);
    ws.on("close", () => clearInterval(interval));
  }

  // --- Persistent PTY pool ---
  // PTYs survive WebSocket disconnects. Clients attach/reattach by ptyId.
  interface PtyEntry {
    process: pty.IPty;
    ws: WebSocket | null;
    buffer: string[];
  }
  const ptyPool = new Map<string, PtyEntry>();
  const MAX_SCROLLBACK_BUFFER = 50000;

  function spawnPty(): { id: string; entry: PtyEntry } {
    const shell = process.env.SHELL || "/bin/zsh";
    const minimalEnv: { [key: string]: string } = {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME || "/",
      USER: process.env.USER || "",
      SHELL: shell,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: process.env.LANG || "en_US.UTF-8",
    };

    const proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || "/",
      env: minimalEnv,
    });

    const id = `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: PtyEntry = { process: proc, ws: null, buffer: [] };

    proc.onData((data: string) => {
      entry.buffer.push(data);
      if (entry.buffer.length > MAX_SCROLLBACK_BUFFER) {
        entry.buffer.splice(0, entry.buffer.length - MAX_SCROLLBACK_BUFFER);
      }
      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    proc.onExit(({ exitCode }) => {
      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({ type: "exit", code: exitCode }));
      }
      ptyPool.delete(id);
    });

    ptyPool.set(id, entry);
    return { id, entry };
  }

  function attachWsToPty(ws: WebSocket, entry: PtyEntry, _ptyId: string) {
    // Detach previous WebSocket if any
    if (entry.ws && entry.ws !== ws && entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.onclose = null;
      entry.ws.onerror = null;
      entry.ws.close(1000, "Replaced by new connection");
    }
    entry.ws = ws;

    // Replay buffered output so the client sees prior terminal state
    if (entry.buffer.length > 0) {
      ws.send(JSON.stringify({ type: "output", data: entry.buffer.join("") }));
    }

    ws.on("message", (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());
        switch (msg.type) {
          case "input":
            entry.process.write(msg.data);
            break;
          case "resize":
            entry.process.resize(msg.cols, msg.rows);
            break;
          case "command":
            entry.process.write(msg.data + "\r");
            break;
        }
      } catch (err) {
        console.error("Error parsing message:", err);
      }
    });

    ws.on("close", () => {
      if (entry.ws === ws) entry.ws = null;
      // PTY stays alive — no kill
    });

    ws.on("error", () => {
      if (entry.ws === ws) entry.ws = null;
    });
  }

  // Terminal connections
  terminalWss.on("connection", (ws: WebSocket, request) => {
    setupHeartbeat(ws);

    const { query } = parse(request.url || "", true);
    const requestedPtyId = typeof query.ptyId === "string" ? query.ptyId : null;

    // Try to reattach to existing PTY
    if (requestedPtyId && ptyPool.has(requestedPtyId)) {
      const entry = ptyPool.get(requestedPtyId)!;
      ws.send(JSON.stringify({ type: "pty-id", ptyId: requestedPtyId }));
      attachWsToPty(ws, entry, requestedPtyId);
      return;
    }

    // Spawn new PTY
    try {
      const { id, entry } = spawnPty();
      ws.send(JSON.stringify({ type: "pty-id", ptyId: id }));
      attachWsToPty(ws, entry, id);
    } catch (err) {
      console.error("Failed to spawn pty:", err);
      ws.send(
        JSON.stringify({ type: "error", message: "Failed to start terminal" })
      );
      ws.close();
    }
  });

  await initDb();
  console.log("> Database initialized");

  setupHooks();
  startWatcher();
  startStatusMonitor();

  server.listen(port, () => {
    console.log(`> ClaudeDeck ready on http://${hostname}:${port}`);
  });
});
