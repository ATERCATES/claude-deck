import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getCachedProjects,
  invalidateAllProjects,
} from "@/lib/claude/jsonl-cache";
import { deleteWorktree } from "@/lib/worktrees";
import { queries } from "@/lib/db";

export interface ClaudeProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
  hidden: boolean;
  parentRoot: string | null;
  isWorktree: boolean;
}

export async function GET() {
  try {
    const cachedProjects = await getCachedProjects();
    const hiddenItems = await queries.getHiddenItems("project");
    const hiddenSet = new Set(hiddenItems.map((h) => h.item_id));

    const projects: ClaudeProject[] = cachedProjects.map((p) => ({
      ...p,
      hidden: hiddenSet.has(p.name),
    }));

    projects.sort((a, b) => {
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return (
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error discovering Claude projects:", error);
    return NextResponse.json(
      { error: "Failed to discover projects" },
      { status: 500 }
    );
  }
}

async function removeProjectDir(projectName: string): Promise<void> {
  const dir = path.join(os.homedir(), ".claude", "projects", projectName);
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  try {
    await queries.unhideItem("project", projectName);
  } catch {
    // ignore
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { projectName, includeWorktrees } = (await request.json()) as {
      projectName?: string;
      includeWorktrees?: boolean;
    };
    if (!projectName) {
      return NextResponse.json(
        { error: "projectName is required" },
        { status: 400 }
      );
    }

    const projects = await getCachedProjects();
    const target = projects.find((p) => p.name === projectName);
    if (!target) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    if (includeWorktrees && target.directory) {
      const children = projects.filter(
        (p) => p.isWorktree && p.parentRoot === target.directory
      );
      for (const child of children) {
        if (!child.directory) continue;
        try {
          await deleteWorktree(child.directory, target.directory, true);
        } catch {
          // continue even if a single worktree cleanup fails
        }
        await removeProjectDir(child.name);
      }
    }

    await removeProjectDir(projectName);
    invalidateAllProjects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete project: ${message}` },
      { status: 400 }
    );
  }
}
