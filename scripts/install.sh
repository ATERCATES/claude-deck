#!/usr/bin/env bash
#
# ClaudeDeck Installer
#
# Install:
#   curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh | bash
#
# Update:
#   ~/.claude-deck/install.sh --update
#
# Options:
#   --port 3011 --ssh-host myserver.com --ssh-port 22 -y
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}==>${NC} $1"; }
log_success() { echo -e "${GREEN}==>${NC} $1"; }
log_warn()    { echo -e "${YELLOW}==>${NC} $1"; }
log_error()   { echo -e "${RED}==>${NC} $1"; }

INSTALL_DIR="$HOME/.claude-deck"
PKG="@atercates/claude-deck"
NODE_MIN=24

# ─── Parse flags ──────────────────────────────────────────────────────────────

FLAG_PORT="" FLAG_SSH_HOST="" FLAG_SSH_PORT=""
FLAG_NONINTERACTIVE=false FLAG_UPDATE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)      FLAG_PORT="$2";      shift 2 ;;
    --ssh-host)  FLAG_SSH_HOST="$2";  shift 2 ;;
    --ssh-port)  FLAG_SSH_PORT="$2";  shift 2 ;;
    --yes|-y)    FLAG_NONINTERACTIVE=true; shift ;;
    --update|-u) FLAG_UPDATE=true;    shift ;;
    *)           shift ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────────────

ask() {
  local prompt="$1" default="$2" var="$3"
  if [[ -t 0 ]] && [[ "$FLAG_NONINTERACTIVE" == false ]]; then
    if [[ -n "$default" ]]; then
      read -rp "$(echo -e "${BOLD}$prompt${NC} ${DIM}[$default]${NC}: ")" value
      eval "$var=\"${value:-$default}\""
    else
      read -rp "$(echo -e "${BOLD}$prompt${NC}: ")" value
      eval "$var=\"$value\""
    fi
  else
    eval "$var=\"$default\""
  fi
}

ensure_node() {
  # Check PATH first, then ~/.n
  [[ -x "$HOME/.n/bin/node" ]] && export PATH="$HOME/.n/bin:$PATH"

  if command -v node &> /dev/null; then
    local v=$(node --version | sed 's/v//' | cut -d. -f1)
    if [[ "$v" -ge "$NODE_MIN" ]]; then
      log_success "Node.js $(node --version) found"
      return
    fi
  fi

  log_info "Installing Node.js $NODE_MIN..."
  local N_PREFIX="$HOME/.n"
  mkdir -p "$N_PREFIX"
  curl -fsSL https://raw.githubusercontent.com/tj/n/master/bin/n -o /tmp/n && chmod +x /tmp/n
  N_PREFIX="$N_PREFIX" /tmp/n "$NODE_MIN" && rm -f /tmp/n
  export PATH="$N_PREFIX/bin:$PATH"
  log_success "Node.js $(node --version) installed"
}

ensure_pnpm() {
  if command -v pnpm &> /dev/null; then
    log_success "pnpm $(pnpm --version) found"
  else
    log_info "Installing pnpm..."
    npm install -g pnpm > /dev/null 2>&1
    log_success "pnpm $(pnpm --version) installed"
  fi
}

pkg_dir() {
  echo "$INSTALL_DIR/node_modules/$PKG"
}

pkg_version() {
  node -e "console.log(require('$(pkg_dir)/package.json').version)" 2>/dev/null || echo "unknown"
}

# ─── Update ───────────────────────────────────────────────────────────────────

if [[ "$FLAG_UPDATE" == true ]]; then
  echo ""
  echo -e "${BOLD}  ClaudeDeck Update${NC}"
  echo ""

  if [[ ! -d "$INSTALL_DIR/node_modules/$PKG" ]]; then
    log_error "ClaudeDeck is not installed. Run without --update first."
    exit 1
  fi

  ensure_node
  cd "$INSTALL_DIR"

  CURRENT=$(pkg_version)
  log_info "Current version: $CURRENT"

  log_info "Updating..."
  pnpm update "$PKG" --latest 2>&1 | tail -3

  NEW=$(pkg_version)
  if [[ "$CURRENT" == "$NEW" ]]; then
    log_success "Already on latest version ($NEW)"
  else
    log_success "Updated: $CURRENT -> $NEW"
  fi

  cd "$(pkg_dir)"
  log_info "Installing dependencies..."
  pnpm install > /dev/null 2>&1

  log_info "Building..."
  rm -f .next/build.lock
  pnpm build 2>&1 | tail -5

  if systemctl is-active --quiet claudedeck 2>/dev/null; then
    log_info "Restarting service..."
    sudo systemctl restart claudedeck
    sleep 2
    systemctl is-active --quiet claudedeck && log_success "ClaudeDeck $NEW running" || log_error "Failed. Check: sudo journalctl -u claudedeck -f"
  else
    log_success "ClaudeDeck $NEW ready. Start with: sudo systemctl start claudedeck"
  fi

  echo ""
  exit 0
fi

# ─── Fresh install ────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  ClaudeDeck Installer${NC}"
echo -e "${DIM}  Self-hosted web UI for Claude Code sessions${NC}"
echo ""

# Prerequisites
log_info "Checking prerequisites..."

if ! command -v tmux &> /dev/null; then
  log_warn "tmux is not installed (required for session management)"
  ask "Install tmux now? (y/n)" "y" INSTALL_TMUX
  if [[ "$INSTALL_TMUX" == "y" ]]; then
    sudo apt install -y tmux
    log_success "tmux installed"
  else
    log_error "tmux is required. Install it manually and re-run."
    exit 1
  fi
fi

ensure_node
ensure_pnpm

# Configuration
echo ""
log_info "Configuration"
echo ""

PORT="${FLAG_PORT}"
SSH_HOST="${FLAG_SSH_HOST}"
SSH_PORT="${FLAG_SSH_PORT}"

ask "Port" "3011" PORT
ask "SSH host for VS Code remote button (leave empty to skip)" "" SSH_HOST
[[ -n "$SSH_HOST" ]] && ask "SSH port" "22" SSH_PORT
echo ""

# Install package
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [[ ! -f "package.json" ]]; then
  echo '{"name":"claude-deck-instance","private":true}' > package.json
fi

log_info "Installing $PKG from npm..."
pnpm add "$PKG" 2>&1 | tail -3

# Build inside the package directory
cd "$(pkg_dir)"

log_info "Installing dependencies..."
pnpm install > /dev/null 2>&1

if ! grep -q "onlyBuiltDependencies" package.json 2>/dev/null; then
  node -e "
    const pkg = require('./package.json');
    pkg.pnpm = pkg.pnpm || {};
    pkg.pnpm.onlyBuiltDependencies = ['better-sqlite3', 'esbuild', 'node-pty', 'sharp'];
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  pnpm install > /dev/null 2>&1
fi

# .env
log_info "Writing .env..."
ENV_FILE="$(pkg_dir)/.env"
echo "PORT=$PORT" > "$ENV_FILE"
[[ -n "$SSH_HOST" ]] && echo "SSH_HOST=$SSH_HOST" >> "$ENV_FILE"
[[ -n "$SSH_PORT" && "$SSH_PORT" != "22" ]] && echo "SSH_PORT=$SSH_PORT" >> "$ENV_FILE"

# Build
log_info "Building for production (this may take a minute)..."
pnpm build

# tmux config
if [[ ! -f "$HOME/.tmux.conf" ]] || ! grep -q "mouse on" "$HOME/.tmux.conf" 2>/dev/null; then
  log_info "Enabling tmux mouse support..."
  echo "set -g mouse on" >> "$HOME/.tmux.conf"
fi

# Copy install script for easy updates
cp "$(pkg_dir)/scripts/install.sh" "$INSTALL_DIR/install.sh" 2>/dev/null || true

# ─── Systemd ──────────────────────────────────────────────────────────────────

APP_DIR="$(pkg_dir)"
NODE_BIN=$(which node)
TSX_BIN="$APP_DIR/node_modules/.bin/tsx"

SERVICE="[Unit]
Description=ClaudeDeck
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$NODE_BIN"):$APP_DIR/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$TSX_BIN --env-file=.env server.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"

INSTALL_SERVICE=false
if [[ -t 0 ]] && [[ "$FLAG_NONINTERACTIVE" == false ]]; then
  echo ""
  ask "Install as systemd service? (y/n)" "y" SVC_ANSWER
  [[ "$SVC_ANSWER" == "y" ]] && INSTALL_SERVICE=true
else
  INSTALL_SERVICE=true
fi

if [[ "$INSTALL_SERVICE" == true ]]; then
  log_info "Installing systemd service..."
  echo "$SERVICE" | sudo tee /etc/systemd/system/claudedeck.service > /dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable claudedeck > /dev/null 2>&1
  sudo systemctl restart claudedeck
  sleep 2
  systemctl is-active --quiet claudedeck && log_success "Service running on port $PORT" || log_error "Failed. Check: sudo journalctl -u claudedeck -f"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

VERSION=$(pkg_version)

echo ""
echo -e "${GREEN}${BOLD}  ClaudeDeck${VERSION:+ v$VERSION} installed!${NC}"
echo ""
echo -e "  ${BOLD}Local:${NC}    http://localhost:$PORT"
[[ -n "$SSH_HOST" ]] && echo -e "  ${BOLD}Remote:${NC}   Configure your reverse proxy to point to port $PORT"
echo ""
echo -e "  ${DIM}First visit will prompt you to create an account.${NC}"
echo -e "  ${DIM}Manage:  sudo systemctl {start|stop|restart|status} claudedeck${NC}"
echo -e "  ${DIM}Update:  ~/.claude-deck/install.sh --update${NC}"
echo ""
