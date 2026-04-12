#!/bin/bash
set -e

echo "Agent-OS Setup"
echo "=============="
echo ""

OS=$(uname -s | tr '[:upper:]' '[:lower:]')

# ── Node.js ──────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Install Node.js 20+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Error: Node.js 20+ required (found v$NODE_VERSION)"
    exit 1
fi
echo "✓ Node.js: $(node -v)"

# ── pnpm ─────────────────────────────────────────────────
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi
echo "✓ pnpm: $(pnpm -v)"

# ── Build tools (for native modules: node-pty, better-sqlite3) ──
if [[ "$OS" == "linux" ]]; then
    if ! dpkg -s build-essential &> /dev/null 2>&1; then
        echo "Installing build tools..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq build-essential python3
    fi
    echo "✓ Build tools: installed"
elif [[ "$OS" == "darwin" ]]; then
    if ! xcode-select -p &> /dev/null 2>&1; then
        echo "Installing Xcode Command Line Tools..."
        xcode-select --install
        echo "Re-run this script after installation completes."
        exit 0
    fi
    echo "✓ Xcode CLT: installed"
fi

# ── tmux ─────────────────────────────────────────────────
if ! command -v tmux &> /dev/null; then
    echo "Installing tmux..."
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get install -y -qq tmux
    elif [[ "$OS" == "darwin" ]]; then
        brew install tmux
    else
        echo "Error: Install tmux manually"
        exit 1
    fi
fi
echo "✓ tmux: $(tmux -V)"

# ── tmux configuration ──────────────────────────────────
TMUX_CONF="$HOME/.tmux.conf"
if [ ! -f "$TMUX_CONF" ] || ! grep -q "mouse on" "$TMUX_CONF" 2>/dev/null; then
    echo "Configuring tmux (mouse on for scroll support)..."
    cat >> "$TMUX_CONF" << 'TMUX'

# Agent-OS: enable mouse for scroll support in web terminal
set -g mouse on
set -g history-limit 50000
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
TMUX
fi
echo "✓ tmux: mouse on configured"

# ── git ──────────────────────────────────────────────────
if ! command -v git &> /dev/null; then
    echo "Error: git is not installed"
    exit 1
fi
echo "✓ git: $(git --version | awk '{print $3}')"

# ── ripgrep (for code search) ────────────────────────────
if ! command -v rg &> /dev/null; then
    echo "Installing ripgrep..."
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get install -y -qq ripgrep
    elif [[ "$OS" == "darwin" ]]; then
        brew install ripgrep
    fi
fi
if command -v rg &> /dev/null; then
    echo "✓ ripgrep: $(rg --version | head -1 | awk '{print $2}')"
else
    echo "⚠ ripgrep: not found (code search will be disabled)"
fi

# ── Claude Code CLI ──────────────────────────────────────
if ! command -v claude &> /dev/null; then
    echo ""
    echo "Claude Code CLI not found. Install with:"
    echo "  npm install -g @anthropic-ai/claude-code"
    echo ""
    echo "⚠ Agent-OS requires at least one AI CLI to function."
else
    echo "✓ Claude CLI: installed"
fi

# ── Environment ──────────────────────────────────────────
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✓ Created .env from .env.example"
    fi
fi

# ── Data directory ───────────────────────────────────────
mkdir -p "$HOME/.agent-os"
echo "✓ Data dir: ~/.agent-os/"

# ── Install dependencies ────────────────────────────────
echo ""
echo "Installing dependencies..."
pnpm install

echo ""
echo "✓ Setup complete!"
echo ""
echo "  Development:  pnpm dev"
echo "  Production:   pnpm start"
echo "  Port:         ${PORT:-3011}"
echo ""
