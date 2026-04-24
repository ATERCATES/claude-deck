import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { isClaudeDeckWorktree } from "@/lib/worktrees";
import { getGitStatus } from "@/lib/git-status";
import { getCachedProjects, getCachedSessions } from "@/lib/claude/jsonl-cache";

const execFileAsync = promisify(execFile);

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  let dirty = false;
  let branchName = "";
  try {
    const status = getGitStatus(path);
    dirty =
      status.staged.length + status.unstaged.length + status.untracked.length >
      0;
    branchName = status.branch;
  } catch {
    // Path may no longer be a git worktree — leave defaults.
  }

  if (!branchName) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
        { timeout: 2000 }
      );
      branchName = stdout.trim();
    } catch {
      // keep empty
    }
  }

  let activeSessions = 0;
  try {
    const projects = await getCachedProjects();
    const match = projects.find((p) => p.directory === path);
    if (match) {
      const sessions = await getCachedSessions(match.name);
      const cutoff = Date.now() - ACTIVE_WINDOW_MS;
      activeSessions = sessions.filter((s) => {
        const ts = Date.parse(s.lastActivity);
        return Number.isFinite(ts) && ts >= cutoff;
      }).length;
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({
    dirty,
    branchName,
    activeSessions,
    isClaudeDeckManaged: isClaudeDeckWorktree(path),
  });
}
