import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { queries } from "@/lib/db";

const execAsync = promisify(exec);

// POST /api/sessions/[id]/send-keys - Send text to a tmux session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { text, pressEnter = true } = body;

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const session = await queries.getSession(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const tmuxSessionName = `${session.agent_type}-${id}`;

    // Check if tmux session exists
    try {
      await execAsync(`tmux has-session -t "${tmuxSessionName}" 2>/dev/null`);
    } catch {
      return NextResponse.json(
        { error: "Tmux session not running" },
        { status: 400 }
      );
    }

    // Write text to a temp file
    const tempFile = `/tmp/claude-deck-send-${id}.txt`;
    const fs = await import("fs/promises");
    await fs.writeFile(tempFile, text);

    // Use a named buffer to avoid race conditions
    const bufferName = `send-${id}`;

    try {
      // Load file into named tmux buffer
      const loadCmd = `tmux load-buffer -b "${bufferName}" "${tempFile}"`;
      await execAsync(loadCmd);

      // Paste the named buffer to the session
      const pasteCmd = `tmux paste-buffer -b "${bufferName}" -t "${tmuxSessionName}"`;
      await execAsync(pasteCmd);

      // Delete the buffer after use
      await execAsync(`tmux delete-buffer -b "${bufferName}"`).catch(() => {});

      // Send Enter if requested
      if (pressEnter) {
        await execAsync(`tmux send-keys -t "${tmuxSessionName}" Enter`);
      }

      return NextResponse.json({ success: true });
    } catch (cmdError) {
      throw cmdError;
    } finally {
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error sending keys:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
