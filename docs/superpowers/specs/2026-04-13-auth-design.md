# Auth System Design — ClaudeDeck

## Summary

Add password-based authentication with optional TOTP 2FA to ClaudeDeck. Single-user self-hosted app, always behind HTTPS. First-run setup flow creates the account; subsequent visits require login.

## Constraints

- Single user per instance (table supports multi-user but UI does not)
- Always HTTPS — cookies use `Secure` flag
- No external dependencies for auth (no OAuth, no email)
- Recovery from lost TOTP: delete the row in SQLite or start with `--skip-auth`
- No recovery codes

## Database Schema

### Table: `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `password_hash`: bcrypt hash (cost 12)
- `totp_secret`: base32-encoded TOTP secret, nullable. If null, 2FA is not enabled.

### Table: `auth_sessions`

```sql
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
```

- `token`: 32 bytes random, hex-encoded (64 chars). This is what goes in the cookie.
- `expires_at`: 30 days from creation. Renewed on each valid request (sliding window).

## Auth Library (`lib/auth/`)

### `password.ts`

- `hashPassword(password: string): Promise<string>` — bcrypt hash, cost 12
- `verifyPassword(password: string, hash: string): Promise<boolean>` — bcrypt compare

Dependency: `bcrypt` (native) or `bcryptjs` (pure JS, no native build issues). Recommend `bcryptjs` to avoid native compilation headaches on Alpine/Docker.

### `totp.ts`

- `generateTotpSecret(username: string): { secret: string, uri: string }` — generates base32 secret and `otpauth://` URI for QR code
- `verifyTotpCode(secret: string, code: string): boolean` — validates 6-digit TOTP code with 1-step window (allows +-30s drift)

Dependency: `otpauth` (pure JS, no native deps). QR generation on the frontend using `qrcode` library.

### `session.ts`

- `createSession(userId: string): { token: string, expiresAt: Date }` — generates 32-byte random token, inserts into `auth_sessions`, returns token
- `validateSession(token: string): User | null` — timing-safe lookup, checks expiry, returns user or null
- `renewSession(token: string): void` — extends `expires_at` by 30 days
- `deleteSession(token: string): void` — removes session row
- `deleteExpiredSessions(): void` — cleanup, called periodically

Cookie settings: `claude_deck_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`

### `rate-limit.ts`

In-memory rate limiter (no Redis dependency).

- `checkRateLimit(ip: string): { allowed: boolean, retryAfterSeconds?: number }` — 5 attempts per 15-minute window per IP
- Uses a `Map<string, { count: number, resetAt: number }>`, cleaned up periodically
- Returns `429 Too Many Requests` with `Retry-After` header when exceeded

## API Endpoints (`app/api/auth/`)

### `POST /api/auth/setup`

Creates the first user. Only works when `users` table has 0 rows.

**Request:**

```json
{
  "username": "admin",
  "password": "...",
  "totpSecret": "BASE32...", // optional, only if user chose to enable 2FA
  "totpCode": "123456" // required if totpSecret is provided, to verify setup
}
```

**Response:** `200` with `Set-Cookie` (auto-login after setup) or `403` if a user already exists.

**Validation:**

- Username: 3-32 chars, alphanumeric + underscore
- Password: minimum 8 chars
- If `totpSecret` provided, `totpCode` must be valid (proves the authenticator app is configured correctly)

### `POST /api/auth/login`

**Rate limited**: 5 attempts / 15 min per IP.

**Request:**

```json
{
  "username": "admin",
  "password": "...",
  "totpCode": "123456" // only required if user has TOTP enabled
}
```

**Flow:**

1. Check rate limit → 429 if exceeded
2. Find user by username → generic error if not found
3. Verify password with bcrypt → generic error if wrong
4. If user has `totp_secret`:
   - If `totpCode` missing → `200` with `{ "requiresTotp": true }` (tells frontend to show step 2)
   - If `totpCode` provided → verify TOTP → generic error if wrong
5. Create session, set cookie → `200` with `{ "ok": true }`

**Error response:** Always `401 { "error": "Invalid credentials" }` — no distinction between bad username, bad password, or bad TOTP code.

### `POST /api/auth/logout`

Deletes session from DB, clears cookie. Always returns `200`.

### `GET /api/auth/session`

Returns current session status. Used by frontend to check if logged in.

**Response:** `200 { "authenticated": true, "username": "admin" }` or `401 { "authenticated": false }`

## Middleware (`middleware.ts`)

Next.js edge middleware. Runs on every request.

**Logic:**

1. If path is `/api/auth/*`, `/login`, `/setup`, `/_next/*`, `/favicon.ico` → pass through (public routes)
2. Check if any user exists in DB:
   - If no users exist and path is not `/setup` → redirect to `/setup`
   - If no users exist and path is `/setup` → pass through
3. Read `claude_deck_session` cookie → validate session
4. If valid session → renew session, pass through
5. If invalid/missing session → redirect to `/login` (for pages) or `401` (for API routes)

**Edge middleware limitation:** middleware.ts in Next.js runs in the edge runtime, which cannot use `better-sqlite3` directly. Solution: middleware calls `GET /api/auth/session` internally, or we use a lightweight check (just verify cookie existence) and let API routes do the full DB validation.

Chosen approach: middleware checks cookie existence and format only. Each API route handler and `server.ts` WebSocket upgrade do the actual DB session validation via `validateSession()`. This avoids edge runtime limitations and keeps the real check server-side.

## WebSocket Auth (`server.ts`)

Modify the `server.on("upgrade")` handler:

```typescript
server.on("upgrade", (request, socket, head) => {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies["claude_deck_session"];
  const user = token ? validateSession(token) : null;

  if (!user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // proceed with existing upgrade logic
});
```

## UI Pages

### `/setup` — First-run setup

- Only accessible when 0 users in DB. Redirects to `/login` otherwise.
- Dark card, centered.
- Fields: username, password, confirm password.
- Toggle: "Enable two-factor authentication"
  - When enabled: shows QR code (generated from `otpauth://` URI) + text secret for manual entry + input for verification code.
- Submit creates account and auto-logs in.

### `/login` — Login

- Dark card, centered. Same visual style as setup.
- Step 1: username + password fields + submit button.
- Step 2 (if TOTP enabled): transitions to 6-digit code input with auto-focus and auto-submit on 6th digit.
- Shows generic error on failure.
- Shows lockout message with countdown when rate limited.

### Visual style

- Full-page dark background matching the app's existing theme (`bg-background`)
- Centered card with subtle border (`border-border`)
- Uses existing UI components (Button, Input from `components/ui/`)
- No logo or branding needed — just "ClaudeDeck" as heading text
- Minimal, clean, no clutter

## Dependencies to Add

| Package           | Purpose                                      | Type       |
| ----------------- | -------------------------------------------- | ---------- |
| `bcryptjs`        | Password hashing (pure JS)                   | production |
| `otpauth`         | TOTP generation and verification             | production |
| `qrcode`          | QR code generation for TOTP setup (frontend) | production |
| `@types/bcryptjs` | TypeScript types                             | dev        |

## File Structure

```
lib/auth/
  password.ts        — bcrypt hash/verify
  totp.ts            — TOTP secret generation, URI, verification
  session.ts         — Session CRUD, cookie helpers, timing-safe compare
  rate-limit.ts      — In-memory rate limiter
  index.ts           — Re-exports

app/api/auth/
  setup/route.ts     — POST: create first user
  login/route.ts     — POST: authenticate
  logout/route.ts    — POST: destroy session
  session/route.ts   — GET: check session status

app/setup/page.tsx   — First-run setup UI
app/login/page.tsx   — Login UI

middleware.ts        — Route protection (cookie presence check)
```

## Migration Strategy

- New tables (`users`, `auth_sessions`) added via the existing `createSchema()` function in `lib/db/schema.ts`
- No changes to existing tables
- Existing sessions/projects data untouched
- `server.ts` WebSocket upgrade handler wraps existing logic with auth check

## Edge Cases

- **Lost TOTP device**: User deletes the `totp_secret` column value in SQLite directly, or starts server with `--skip-auth` flag
- **Expired sessions**: Cleaned up lazily on validation. No background job needed.
- **Cookie on HTTP**: Won't be sent (Secure flag). App requires HTTPS.
- **Multiple tabs**: All share the same cookie, no issues.
- **Server restart**: Sessions persist in SQLite. No re-login needed.
