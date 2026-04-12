import { NextRequest, NextResponse } from "next/server";
import { getCachedSessions, getCachedProjects } from "@/lib/claude/jsonl-cache";
import { queries } from "@/lib/db";
import fs from "fs";
import path from "path";

function resolveValidCwd(
  cwd: string | null,
  projectDirectory: string | null
): string {
  if (!cwd && projectDirectory) return projectDirectory;
  if (!cwd) return process.env.HOME || "/";
  if (fs.existsSync(cwd)) return cwd;
  let dir = cwd;
  while (dir && dir !== "/" && !fs.existsSync(dir)) {
    dir = path.dirname(dir);
  }
  if (dir && dir !== "/" && fs.existsSync(dir)) return dir;
  return projectDirectory || process.env.HOME || "/";
}

interface RouteParams {
  params: Promise<{ name: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const includeHidden = searchParams.get("includeHidden") === "true";

    const [allSessions, allProjects] = await Promise.all([
      getCachedSessions(name),
      getCachedProjects(),
    ]);

    const project = allProjects.find((p) => p.name === name);
    const projectDir = project?.directory || null;

    const hiddenItems = await queries.getHiddenItems("session");
    const hiddenSet = new Set(hiddenItems.map((h) => h.item_id));

    const enriched = allSessions
      .filter((s) => s.messageCount > 2 || s.cwd)
      .map((s) => ({
        ...s,
        cwd: resolveValidCwd(s.cwd, projectDir),
        hidden: hiddenSet.has(s.sessionId),
      }));

    const filtered = includeHidden
      ? enriched
      : enriched.filter((s) => !s.hidden);

    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      sessions: paginated,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
