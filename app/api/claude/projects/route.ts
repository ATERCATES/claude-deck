import { NextResponse } from "next/server";
import { getCachedProjects } from "@/lib/claude/jsonl-cache";
import { queries } from "@/lib/db";

export interface ClaudeProject {
  name: string;
  directory: string | null;
  displayName: string;
  sessionCount: number;
  lastActivity: string | null;
  hidden: boolean;
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
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime()
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
