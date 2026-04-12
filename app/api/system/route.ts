import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  return NextResponse.json({
    user: os.userInfo().username,
    hostname: os.hostname(),
  });
}
