# Setup & Deployment

## Quick Start (Development)

```bash
# Run the setup script (installs dependencies, configures tmux)
./scripts/setup.sh

# Start development server
pnpm dev

# Access at http://localhost:3011
```

## Requirements

| Dependency      | Version | Purpose                                   |
| --------------- | ------- | ----------------------------------------- |
| Node.js         | ≥20     | Runtime                                   |
| pnpm            | Latest  | Package manager                           |
| tmux            | Any     | Session persistence                       |
| git             | Any     | Git operations                            |
| ripgrep (rg)    | Any     | Code search (optional)                    |
| Claude Code CLI | Latest  | `npm i -g @anthropic-ai/claude-code`      |
| build-essential | Any     | Native modules (node-pty, better-sqlite3) |

## tmux Configuration (Critical)

The file `~/.tmux.conf` MUST contain:

```
set -g mouse on
set -g history-limit 50000
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
```

Without `mouse on`, terminal scroll will not work. The setup script creates this file automatically.

## Environment Variables

| Variable   | Default                  | Description                         |
| ---------- | ------------------------ | ----------------------------------- |
| `PORT`     | `3011`                   | Server port                         |
| `DB_PATH`  | `~/.claude-deck/data.db` | SQLite database path                |
| `NODE_ENV` | `development`            | Set to `production` for prod builds |

## Docker

```bash
# Build and run
docker compose up -d

# With custom port
PORT=3012 docker compose up -d
```

The Docker setup:

- Alpine-based with tmux, git, ripgrep, zsh
- Mounts `~/.claude` read-only (session data)
- Persists `~/.claude-deck` via named volume
- Pre-configures tmux with `mouse on`

**Note**: Claude Code CLI must be available inside the container. The Dockerfile does not install it — mount it or install separately.

## Production

```bash
pnpm build
pnpm start
```

Or with the CLI:

```bash
./scripts/claude-deck start      # Background daemon
./scripts/claude-deck stop
./scripts/claude-deck status
./scripts/claude-deck logs
```

## Reverse Proxy

An example nginx HTTP config is at [`docs/examples/nginx-http.conf`](examples/nginx-http.conf). Copy it to `/etc/nginx/sites-available/`, set `server_name`, and enable the site. For HTTPS, add a certificate with certbot (`sudo certbot --nginx -d your.domain`).

## Mobile Access (PWA)

1. Access `http://{server-ip}:3011` from your phone
2. Add to home screen (iOS: Share → Add to Home Screen)
3. The app runs in standalone mode (no browser chrome)

For development with phone testing, add your IP to `next.config.ts`:

```typescript
allowedDevOrigins: ["192.168.1.x"],
```

## Data Directories

| Path                     | Purpose                    | Managed By      |
| ------------------------ | -------------------------- | --------------- |
| `~/.claude/projects/`    | Claude session JSONL files | Claude Code CLI |
| `~/.claude-deck/`        | ClaudeDeck data directory  | ClaudeDeck      |
| `~/.claude-deck/data.db` | SQLite database            | ClaudeDeck      |
| `~/.tmux.conf`           | tmux configuration         | setup.sh        |
