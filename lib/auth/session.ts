import { randomBytes } from "crypto";
import { queries } from "@/lib/db";
import type { User } from "@/lib/db";

const SESSION_DURATION_DAYS = 30;
const SESSION_TOKEN_BYTES = 32;

export function createSession(userId: string): {
  token: string;
  expiresAt: string;
} {
  const id = randomBytes(16).toString("hex");
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  queries.createAuthSession(id, token, userId, expiresAt);

  return { token, expiresAt };
}

export function validateSession(token: string): User | null {
  if (!token || token.length !== SESSION_TOKEN_BYTES * 2) return null;

  const session = queries.getAuthSessionByToken(token);
  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    queries.deleteAuthSession(token);
    return null;
  }

  const user = queries.getUserById(session.user_id);
  if (!user) {
    queries.deleteAuthSession(token);
    return null;
  }

  return user;
}

export function renewSession(token: string): void {
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  queries.renewAuthSession(token, expiresAt);
}

export function deleteSession(token: string): void {
  queries.deleteAuthSession(token);
}

export function cleanupExpiredSessions(): void {
  queries.deleteExpiredAuthSessions();
}

export const COOKIE_NAME = "claude_deck_session";

export function buildSessionCookie(token: string): string {
  const maxAge = SESSION_DURATION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function parseCookies(
  cookieHeader: string | undefined
): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );
}

export function hasUsers(): boolean {
  return queries.getUserCount() > 0;
}
