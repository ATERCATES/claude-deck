import { NextResponse } from "next/server";

export async function POST() {
  // With JSONL-based detection, acknowledge is a no-op.
  // Status is determined by file content, not by a flag.
  // The endpoint exists for API compatibility.
  return NextResponse.json({ ok: true });
}
