import { NextResponse } from "next/server";
import { detectExternalEditors } from "@/lib/external-editors";

export async function GET() {
  const editors = await detectExternalEditors();
  return NextResponse.json(editors);
}
