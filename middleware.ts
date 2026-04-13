import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth/",
  "/_next/",
  "/favicon.ico",
  "/icon.svg",
  "/icons/",
  "/manifest.json",
  "/sw.js",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("claude_deck_session");

  if (!sessionCookie?.value) {
    const setupCheck = await fetch(new URL("/api/auth/session", request.url), {
      headers: { cookie: "" },
    });
    const data = await setupCheck.json();

    if (data.needsSetup) {
      return NextResponse.redirect(new URL("/setup", request.url));
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const sessionCheck = await fetch(new URL("/api/auth/session", request.url), {
    headers: { cookie: `claude_deck_session=${sessionCookie.value}` },
  });

  if (!sessionCheck.ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.json|sw.js).*)",
  ],
};
