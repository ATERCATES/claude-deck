import { NextResponse } from "next/server";
import { statusDetector } from "@/lib/status-detector";

export async function POST(request: Request) {
  try {
    const { sessionName } = await request.json();
    if (!sessionName) {
      return NextResponse.json(
        { error: "sessionName is required" },
        { status: 400 }
      );
    }

    statusDetector.acknowledge(sessionName);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error acknowledging session:", error);
    return NextResponse.json(
      { error: "Failed to acknowledge session" },
      { status: 500 }
    );
  }
}
