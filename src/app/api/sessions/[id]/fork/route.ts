import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { queries } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/sessions/[id]/fork - Fork a session
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: parentId } = await params;

    // Parse body if present, otherwise use empty object
    let body: { name?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body provided, use defaults
    }
    const { name } = body;

    // Get parent session
    const parent = await queries.getSession(parentId);
    if (!parent) {
      return NextResponse.json(
        { error: "Parent session not found" },
        { status: 404 }
      );
    }

    // Create new session
    const newId = randomUUID();
    const newName = name || `${parent.name} (fork)`;
    const agentType = parent.agent_type;
    const tmuxName = `${agentType}-${newId}`;

    await queries.createSession(
      newId,
      newName,
      tmuxName,
      parent.working_directory,
      parentId,
      parent.model,
      parent.system_prompt,
      agentType,
      parent.auto_approve,
      parent.project_id ?? null
    );

    // NOTE: We do NOT copy claude_session_id here.
    // When the forked session is first attached, it will use --fork-session flag
    // with the parent's claude_session_id to create a new branched conversation.
    // The new session ID will be captured automatically.

    // Messages are no longer stored in our DB - skipping message copy

    const session = await queries.getSession(newId);

    return NextResponse.json(
      {
        session,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error forking session:", error);
    return NextResponse.json(
      { error: "Failed to fork session" },
      { status: 500 }
    );
  }
}
