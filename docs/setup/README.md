# ClaudeDeck Setup Guide

This guide covers installing and running ClaudeDeck on your machine.

## Quick Install (Recommended)

Run this one-liner to install ClaudeDeck:

```bash
curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh | bash
```

The installer will:

1. Download the `claude-deck` CLI to your PATH
2. Check for prerequisites (Node.js 24+, git, tmux) and offer to install any missing ones
3. Detect installed AI CLIs or prompt you to install one (Claude Code recommended)
4. Clone the repository to `~/.claude-deck/repo`
5. Install dependencies and build for production

## Manual Install

If you prefer to install manually:

```bash
# Clone the repository
git clone https://github.com/ATERCATES/claude-deck ~/.claude-deck/repo
cd ~/.claude-deck/repo

# Install dependencies
npm install

# Build for production
npm run build

# Start the server
npm start
```

## CLI Commands

After installation, use the `claude-deck` command to manage the server:

| Command                 | Description                     |
| ----------------------- | ------------------------------- |
| `claude-deck start`     | Start the server in background  |
| `claude-deck stop`      | Stop the server                 |
| `claude-deck restart`   | Restart the server              |
| `claude-deck status`    | Show status, PID, and URLs      |
| `claude-deck logs`      | Tail server logs                |
| `claude-deck update`    | Pull latest version and rebuild |
| `claude-deck enable`    | Enable auto-start on boot       |
| `claude-deck disable`   | Disable auto-start              |
| `claude-deck uninstall` | Remove ClaudeDeck completely    |

## Prerequisites

The installer can automatically install these on macOS and Linux:

- **Node.js 24+** - JavaScript runtime
- **npm** - Package manager (comes with Node.js)
- **git** - Version control
- **tmux** - Terminal multiplexer for session management

### Claude Code

ClaudeDeck requires Claude Code installed:

```bash
npm install -g @anthropic-ai/claude-code
```

## Configuration

### Environment Variables

| Variable        | Default            | Description            |
| --------------- | ------------------ | ---------------------- |
| `AGENT_OS_HOME` | `~/.claude-deck`   | Installation directory |
| `AGENT_OS_PORT` | `3011`             | Server port            |
| `DB_PATH`       | `./claude-deck.db` | SQLite database path   |

### Custom Port

```bash
# Start on a different port
AGENT_OS_PORT=8080 claude-deck start

# Or set permanently in your shell config
export AGENT_OS_PORT=8080
```

## Auto-Start on Boot

### macOS (launchd)

```bash
claude-deck enable
```

This creates a Launch Agent at `~/Library/LaunchAgents/com.claude-deck.plist`.

To disable:

```bash
claude-deck disable
```

### Linux (systemd)

```bash
claude-deck enable
```

This creates a user service at `~/.config/systemd/user/claude-deck.service`.

To disable:

```bash
claude-deck disable
```

## Mobile Access with Tailscale

ClaudeDeck is designed for mobile access. The easiest way to access it from your phone is with [Tailscale](https://tailscale.com):

1. **Install Tailscale on your machine:**

   ```bash
   # macOS
   brew install tailscale

   # Linux
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

2. **Start Tailscale and authenticate:**

   ```bash
   sudo tailscale up
   ```

3. **Get your Tailscale IP:**

   ```bash
   tailscale ip -4
   # Example: 100.64.0.1
   ```

4. **Install Tailscale on your phone** (iOS App Store / Google Play)

5. **Sign in with the same account**

6. **Access ClaudeDeck:**
   ```
   http://100.64.0.1:3011
   ```

The `claude-deck status` command will show your Tailscale URL if Tailscale is installed.

## Directory Structure

```
~/.claude-deck/
├── repo/              # Cloned ClaudeDeck repository
├── claude-deck.pid       # PID file when running
├── claude-deck.log       # Server logs
└── claude-deck.log.old   # Rotated logs (if > 10MB)
```

## Updating

```bash
claude-deck update
```

This will:

1. Stop the server if running
2. Pull the latest changes from git
3. Install any new dependencies
4. Rebuild for production
5. Restart the server if it was running

## Troubleshooting

### Server won't start

Check the logs:

```bash
claude-deck logs
```

Common issues:

- Port already in use: Change `AGENT_OS_PORT`
- Missing dependencies: Run `claude-deck install` again
- Node.js version: Ensure Node.js 24+ is installed

### Can't connect from phone

1. Ensure both devices are on the same Tailscale network
2. Check `claude-deck status` for the correct URL
3. Verify the server is running: `claude-deck status`
4. Check firewall settings if not using Tailscale

### Build fails

Try a clean reinstall:

```bash
claude-deck stop
rm -rf ~/.claude-deck/repo/node_modules
rm -rf ~/.claude-deck/repo/.next
claude-deck install
```

## Uninstalling

```bash
claude-deck uninstall
```

This removes:

- The `~/.claude-deck` directory
- Auto-start configuration (launchd/systemd)

The `claude-deck` CLI script itself is not removed. Delete it manually:

```bash
rm $(which claude-deck)
```
