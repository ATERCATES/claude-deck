import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { queries, type Session } from "@/lib/db";
import { getManagedSessionPattern } from "@/lib/providers";

const execAsync = promisify(exec);

// POST /api/tmux/kill-all - Kill all ClaudeDeck tmux sessions and remove from database
export async function POST() {
  try {
    const pattern = getManagedSessionPattern();

    // Get all tmux sessions managed by ClaudeDeck
    const { stdout } = await execAsync(
      'tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""',
      { timeout: 5000 }
    );

    const tmuxSessions = stdout
      .trim()
      .split("\n")
      .filter((s) => s && pattern.test(s));

    // Kill each tmux session
    const killed: string[] = [];
    for (const session of tmuxSessions) {
      try {
        await execAsync(`tmux kill-session -t "${session}"`, { timeout: 5000 });
        killed.push(session);
      } catch {
        // Session might already be dead, continue
      }
    }

    // Delete managed sessions from database
    const dbSessions = (await queries.getAllSessions()) as Session[];
    const managed = dbSessions.filter(
      (s) => s.tmux_name && pattern.test(s.tmux_name)
    );
    for (const session of managed) {
      try {
        await queries.deleteSession(session.id);
      } catch {
        // Continue on error
      }
    }

    return NextResponse.json({
      killed: killed.length,
      sessions: killed,
      deletedFromDb: managed.length,
    });
  } catch (error) {
    console.error("Error killing tmux sessions:", error);
    return NextResponse.json(
      { error: "Failed to kill sessions" },
      { status: 500 }
    );
  }
}
