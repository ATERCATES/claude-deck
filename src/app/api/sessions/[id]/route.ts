import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { queries } from "@/lib/db";
import { deleteWorktree, isClaudeDeckWorktree } from "@/lib/worktrees";
import { releasePort } from "@/lib/ports";
import { killWorker } from "@/lib/orchestration";
import { generateBranchName, getCurrentBranch, renameBranch } from "@/lib/git";
import { runInBackground } from "@/lib/async-operations";

const execAsync = promisify(exec);

// Sanitize a name for use as tmux session name
function sanitizeTmuxName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric with dashes
    .replace(/-+/g, "-") // Collapse multiple dashes
    .replace(/^-|-$/g, "") // Remove leading/trailing dashes
    .slice(0, 50); // Limit length
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/sessions/[id] - Get single session
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await queries.getSession(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error fetching session:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}

// PATCH /api/sessions/[id] - Update session
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await queries.getSession(id);
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: unknown[] = [];

    // Handle name change - also rename tmux session and git branch (for worktrees)
    if (body.name !== undefined && body.name !== existing.name) {
      const newTmuxName = sanitizeTmuxName(body.name);
      const oldTmuxName = existing.tmux_name;

      // Try to rename the tmux session
      if (oldTmuxName && newTmuxName) {
        try {
          await execAsync(
            `tmux rename-session -t "${oldTmuxName}" "${newTmuxName}"`
          );
          updates.push(`tmux_name = ?`);
          values.push(newTmuxName);
        } catch {
          // tmux session might not exist or rename failed - that's ok, just update the name
          // Still update tmux_name in DB so future attachments use the new name
          updates.push(`tmux_name = ?`);
          values.push(newTmuxName);
        }
      }

      // If this is a worktree session, also rename the git branch
      if (
        existing.worktree_path &&
        isClaudeDeckWorktree(existing.worktree_path)
      ) {
        try {
          const currentBranch = await getCurrentBranch(existing.worktree_path);
          const newBranchName = generateBranchName(body.name);

          if (currentBranch !== newBranchName) {
            const result = await renameBranch(
              existing.worktree_path,
              currentBranch,
              newBranchName
            );
            console.log(
              `Renamed branch ${currentBranch} → ${newBranchName}`,
              result.remoteRenamed ? "(also on remote)" : "(local only)"
            );
          }
        } catch (error) {
          console.error("Failed to rename git branch:", error);
          // Continue with session rename even if branch rename fails
        }
      }

      updates.push(`name = ?`);
      values.push(body.name);
    }
    if (body.status !== undefined) {
      updates.push(`status = ?`);
      values.push(body.status);
    }
    if (body.workingDirectory !== undefined) {
      updates.push(`working_directory = ?`);
      values.push(body.workingDirectory);
    }
    if (body.systemPrompt !== undefined) {
      updates.push(`system_prompt = ?`);
      values.push(body.systemPrompt);
    }
    if (updates.length > 0) {
      const fields: Record<string, string> = {};
      for (let i = 0; i < updates.length; i++) {
        const col = updates[i].replace(" = ?", "");
        fields[col] = values[i] as string;
      }
      queries.updateSessionFields(id, fields);
    }

    const session = await queries.getSession(id);
    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error updating session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

// DELETE /api/sessions/[id] - Delete session
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = await queries.getSession(id);
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // If this is a conductor, delete all its workers first
    const workers = await queries.getWorkersByConductor(id);
    for (const worker of workers) {
      try {
        await killWorker(worker.id, false); // false = don't cleanup worktree yet
      } catch (error) {
        console.error(`Failed to kill worker ${worker.id}:`, error);
      }
      await queries.deleteSession(worker.id);
    }

    // Release port if this session had one assigned
    if (existing.dev_server_port) {
      releasePort(id);
    }

    // Delete from database immediately for instant UI feedback
    await queries.deleteSession(id);

    // Clean up worktree in background (non-blocking)
    if (
      existing.worktree_path &&
      isClaudeDeckWorktree(existing.worktree_path)
    ) {
      const worktreePath = existing.worktree_path; // Capture for closure
      runInBackground(async () => {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);

        const { stdout } = await execAsync(
          `git -C "${worktreePath}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo ""`,
          { timeout: 5000 }
        );
        const gitCommonDir = stdout.trim().replace(/\/.git$/, "");

        if (gitCommonDir) {
          await deleteWorktree(worktreePath, gitCommonDir, true);
        }
      }, `cleanup-worktree-${id}`);
    }

    // Also cleanup worker worktrees in background
    if (workers.length > 0) {
      for (const worker of workers) {
        if (
          worker.worktree_path &&
          isClaudeDeckWorktree(worker.worktree_path)
        ) {
          const worktreePath = worker.worktree_path; // Capture for closure
          const workerId = worker.id; // Capture ID for task name
          runInBackground(async () => {
            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);

            const { stdout } = await execAsync(
              `git -C "${worktreePath}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo ""`,
              { timeout: 5000 }
            );
            const gitCommonDir = stdout.trim().replace(/\/.git$/, "");

            if (gitCommonDir) {
              await deleteWorktree(worktreePath, gitCommonDir, true);
            }
          }, `cleanup-worker-worktree-${workerId}`);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
