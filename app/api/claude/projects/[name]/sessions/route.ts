import { NextRequest, NextResponse } from "next/server";
import { getCachedSessions } from "@/lib/claude/jsonl-cache";
import { queries } from "@/lib/db";
import fs from "fs";
import path from "path";

function resolveValidCwd(cwd: string | null): string {
  if (!cwd) return process.env.HOME || "/";
  let dir = cwd;
  while (dir && dir !== "/" && !fs.existsSync(dir)) {
    dir = path.dirname(dir);
  }
  return dir || process.env.HOME || "/";
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

    const allSessions = await getCachedSessions(name);

    const hiddenItems = await queries.getHiddenItems("session");
    const hiddenSet = new Set(hiddenItems.map((h) => h.item_id));

    const enriched = allSessions.map((s) => ({
      ...s,
      cwd: resolveValidCwd(s.cwd),
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
