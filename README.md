# ClaudeDeck

Self-hosted web UI for managing Claude Code sessions.

## Installation

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh -o /tmp/install-claudedeck.sh
bash /tmp/install-claudedeck.sh
```

The installer will:

- Install Node.js 24, pnpm, and tmux if needed
- Ask for port, SSH host/port (for VS Code remote button)
- Clone, build, and start as a systemd service
- First visit prompts you to create an account

### Non-Interactive

```bash
curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh | bash -s -- --port 3011 --ssh-host myserver.com --ssh-port 22 -y
```

### Manual Install

```bash
git clone https://github.com/ATERCATES/claude-deck
cd claude-deck
pnpm install
pnpm build
pnpm start  # http://localhost:3011
```

### Prerequisites

- Node.js 24+
- tmux (with `set -g mouse on` in `~/.tmux.conf`)
- [Claude Code](https://github.com/anthropics/claude-code)

## Configuration

Create a `.env` file in the project root:

```bash
PORT=3011

# SSH config for "Open in VS Code" remote button (optional)
SSH_HOST=myserver.example.com
SSH_PORT=22
```

## Features

- **Session management** - Resume, create, and organize Claude Code sessions
- **Mobile-first** - Full functionality from your phone
- **Multi-pane layout** - Run up to 4 sessions side-by-side
- **Active session monitoring** - Real-time status (running/waiting/idle)
- **Code search** - Fast codebase search with syntax-highlighted results (Cmd+K)
- **Git integration** - Status, diffs, commits, PRs from the UI
- **Git worktrees** - Isolated branches with auto-setup
- **Dev servers** - Start/stop Node.js and Docker servers
- **Session orchestration** - Conductor/worker model via MCP
- **VS Code integration** - Open projects in VS Code with one click (supports SSH remote)
- **Auth** - Login with username/password, optional TOTP 2FA

## Service Management

```bash
sudo systemctl start claudedeck
sudo systemctl stop claudedeck
sudo systemctl restart claudedeck
sudo systemctl status claudedeck
sudo journalctl -u claudedeck -f   # tail logs
```

## Reverse Proxy (nginx)

For HTTPS access behind nginx:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name claudedeck.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3011;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

## Mobile Access

Use [Tailscale](https://tailscale.com) for secure access from your phone:

1. Install Tailscale on your dev machine and phone
2. Sign in with the same account
3. Access `http://100.x.x.x:3011` from your phone

## Documentation

Detailed technical docs are in `docs/`:

- [`docs/architecture.md`](docs/architecture.md) - System overview, data flow, directory structure
- [`docs/decisions.md`](docs/decisions.md) - Why SQLite, why tmux, why JSONL
- [`docs/troubleshooting.md`](docs/troubleshooting.md) - Common issues and fixes
- [`docs/setup.md`](docs/setup.md) - Requirements, Docker, PWA, production deployment

## Related Projects

- **[aTerm](https://github.com/ATERCATES/aTerm)** - Native desktop terminal workspace for AI-assisted coding
- **[LumifyHub](https://lumifyhub.io)** - Team collaboration platform with real-time chat and structured documentation

## License

MIT License - Free and open source.

See [LICENSE](LICENSE) for full terms.
