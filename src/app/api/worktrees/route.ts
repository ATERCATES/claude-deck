import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createWorktree,
  deleteWorktree,
  renameWorktreeBranch,
} from "@/lib/worktrees";
import { invalidateAllProjects } from "@/lib/claude/jsonl-cache";
import { queries } from "@/lib/db";

async function removeClaudeProjectArtifacts(
  worktreePath: string
): Promise<void> {
  const encoded = worktreePath.replace(/\//g, "-");
  const claudeProjectDir = path.join(
    os.homedir(),
    ".claude",
    "projects",
    encoded
  );
  try {
    await fs.promises.rm(claudeProjectDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  try {
    await queries.unhideItem("project", encoded);
  } catch {
    // ignore
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectPath, featureName, baseBranch } = await request.json();

    if (!projectPath || !featureName) {
      return NextResponse.json(
        { error: "projectPath and featureName are required" },
        { status: 400 }
      );
    }

    const worktree = await createWorktree({
      projectPath,
      featureName,
      baseBranch,
    });

    return NextResponse.json(worktree, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create worktree: ${message}` },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { worktreePath, projectPath, deleteBranch } = await request.json();
    if (!worktreePath || !projectPath) {
      return NextResponse.json(
        { error: "worktreePath and projectPath are required" },
        { status: 400 }
      );
    }
    await deleteWorktree(worktreePath, projectPath, Boolean(deleteBranch));
    await removeClaudeProjectArtifacts(worktreePath);
    invalidateAllProjects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete worktree: ${message}` },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { worktreePath, projectPath, newBranchName } = await request.json();
    if (!worktreePath || !projectPath || !newBranchName) {
      return NextResponse.json(
        {
          error: "worktreePath, projectPath and newBranchName are required",
        },
        { status: 400 }
      );
    }
    await renameWorktreeBranch(worktreePath, projectPath, newBranchName);
    invalidateAllProjects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to rename branch: ${message}` },
      { status: 400 }
    );
  }
}
