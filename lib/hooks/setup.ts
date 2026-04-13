/**
 * Hooks setup module.
 *
 * Installs the state-reporter script to ~/.claude-deck/hooks/ and
 * merges hook configuration into ~/.claude/settings.json idempotently.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_DECK_DIR = path.join(os.homedir(), ".claude-deck");
const HOOKS_DIR = path.join(CLAUDE_DECK_DIR, "hooks");
const STATES_DIR = path.join(CLAUDE_DECK_DIR, "session-states");
const REPORTER_PATH = path.join(HOOKS_DIR, "state-reporter");
const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

// Events we hook into and whether they run async
const HOOK_EVENTS: Array<{ event: string; async: boolean }> = [
  { event: "UserPromptSubmit", async: true },
  { event: "PreToolUse", async: true },
  { event: "PermissionRequest", async: false },
  { event: "Stop", async: true },
  { event: "SessionStart", async: true },
  { event: "SessionEnd", async: true },
];

// The reporter is a self-contained Node.js script (no tsx, no ESM, no deps)
const REPORTER_SCRIPT = `#!/usr/bin/env node
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var STATES_DIR = path.join(os.homedir(), ".claude-deck", "session-states");

var data = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", function(c) { data += c; });
process.stdin.on("end", function() {
  try {
    var input = JSON.parse(data);
    var id = input.session_id;
    if (!id) return;
    fs.mkdirSync(STATES_DIR, { recursive: true });
    var fp = path.join(STATES_DIR, id + ".json");
    var evt = input.hook_event_name;

    if (evt === "SessionEnd") {
      try { fs.unlinkSync(fp); } catch(e) {}
      return;
    }

    var status = "running";
    var lastLine = input.tool_name ? "Running: " + input.tool_name : "Running...";
    var state = { status: status, lastLine: lastLine, ts: Date.now() };

    if (evt === "PermissionRequest") {
      state.status = "waiting";
      state.lastLine = "Waiting: " + (input.tool_name || "permission");
      state.waitingContext = input.tool_name
        ? "Permission requested for " + input.tool_name
        : "Permission requested";
    } else if (evt === "Stop" && !input.stop_hook_active) {
      state.status = "idle";
      state.lastLine = (input.last_assistant_message || "").slice(0, 200);
    }

    fs.writeFileSync(fp, JSON.stringify(state));
  } catch(e) {}
});
setTimeout(function() { process.exit(0); }, 2000);
`;

function installReporterScript(): void {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.mkdirSync(STATES_DIR, { recursive: true });
  fs.writeFileSync(REPORTER_PATH, REPORTER_SCRIPT, { mode: 0o755 });
}

interface HookCommand {
  type: "command";
  command: string;
  async?: boolean;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

type SettingsHooks = Record<string, HookMatcher[]>;

interface Settings {
  hooks?: SettingsHooks;
  [key: string]: unknown;
}

function isOurHook(hook: HookCommand): boolean {
  return hook.command === REPORTER_PATH;
}

function mergeHooksIntoSettings(): void {
  let settings: Settings = {};

  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  let changed = false;

  for (const { event, async: isAsync } of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    const eventHooks = settings.hooks[event];
    const alreadyInstalled = eventHooks.some((matcher) =>
      matcher.hooks?.some((h) => isOurHook(h))
    );

    if (!alreadyInstalled) {
      const hookDef: HookCommand = {
        type: "command",
        command: REPORTER_PATH,
      };
      if (isAsync) {
        hookDef.async = true;
      }
      eventHooks.push({ hooks: [hookDef] });
      changed = true;
    }
  }

  if (changed) {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    console.log("> Hooks configured in ~/.claude/settings.json");
  }
}

export function setupHooks(): void {
  try {
    installReporterScript();
    mergeHooksIntoSettings();
    console.log(
      "> Hook reporter installed at ~/.claude-deck/hooks/state-reporter"
    );
  } catch (err) {
    console.error("Failed to setup hooks:", err);
  }
}

export { STATES_DIR };
