#!/usr/bin/env bash
#
# ClaudeDeck Installer
#
# Install (interactive):
#   curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh -o /tmp/install-claudedeck.sh
#   bash /tmp/install-claudedeck.sh
#
# Install (non-interactive):
#   curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh | bash -s -- --port 3011 --ssh-host myserver.com --ssh-port 22 -y
#
# Update:
#   ~/.claude-deck/scripts/install.sh --update
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
REPO_URL="https://github.com/ATERCATES/claude-deck.git"
NODE_MIN=24
OS_NAME="$(uname -s)"
IS_MAC=false
if [[ "$OS_NAME" == "Darwin" ]]; then
  IS_MAC=true
fi
LAUNCHD_LABEL="com.claudedeck"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"

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

app_version() {
  node -e "console.log(require('$INSTALL_DIR/package.json').version)" 2>/dev/null || echo "unknown"
}

launchd_domain() {
  if launchctl print "gui/$UID" > /dev/null 2>&1; then
    echo "gui/$UID"
  else
    echo "user/$UID"
  fi
}

# ─── Update ───────────────────────────────────────────────────────────────────

if [[ "$FLAG_UPDATE" == true ]]; then
  echo ""
  echo -e "${BOLD}  ClaudeDeck Update${NC}"
  echo ""

  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    log_error "ClaudeDeck is not installed. Run without --update first."
    exit 1
  fi

  ensure_node
  ensure_pnpm
  cd "$INSTALL_DIR"

  CURRENT=$(app_version)
  log_info "Current version: $CURRENT"

  log_info "Pulling latest..."
  git pull --ff-only

  NEW=$(app_version)
  if [[ "$CURRENT" == "$NEW" ]]; then
    log_success "Already on latest version ($NEW)"
  else
    log_success "Updated: $CURRENT -> $NEW"
  fi

  log_info "Installing dependencies..."
  pnpm install

  log_info "Building..."
  rm -f .next/build.lock
  pnpm build 2>&1 | tail -5

  if [[ "$IS_MAC" == true ]]; then
    LAUNCHD_DOMAIN="$(launchd_domain)"
    if [[ -f "$LAUNCHD_PLIST" ]] && launchctl print "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1; then
      log_info "Restarting launchd service..."
      launchctl bootout "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1 || true
      launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
      launchctl kickstart -k "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1 || true
      sleep 2
      launchctl print "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1 && log_success "ClaudeDeck $NEW running" || log_error "Failed. Check: $INSTALL_DIR/logs/launchd.err.log"
    else
      log_success "ClaudeDeck $NEW ready. Start with: launchctl bootstrap $LAUNCHD_DOMAIN $LAUNCHD_PLIST"
    fi
  else
    if systemctl is-active --quiet claudedeck 2>/dev/null; then
      log_info "Restarting service..."
      sudo systemctl restart claudedeck
      sleep 2
      systemctl is-active --quiet claudedeck && log_success "ClaudeDeck $NEW running" || log_error "Failed. Check: sudo journalctl -u claudedeck -f"
    else
      log_success "ClaudeDeck $NEW ready. Start with: sudo systemctl start claudedeck"
    fi
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

if ! command -v git &> /dev/null; then
  if [[ "$IS_MAC" == true ]]; then
    log_error "git is required. Install it with: xcode-select --install (or brew install git)"
  else
    log_error "git is required. Install it with: sudo apt install git"
  fi
  exit 1
fi

if ! command -v tmux &> /dev/null; then
  log_warn "tmux is not installed (required for session management)"
  ask "Install tmux now? (y/n)" "y" INSTALL_TMUX
  if [[ "$INSTALL_TMUX" == "y" ]]; then
    if [[ "$IS_MAC" == true ]]; then
      if command -v brew &> /dev/null; then
        brew install tmux
      else
        log_error "Homebrew is required to auto-install tmux on macOS. Install Homebrew, then run: brew install tmux"
        exit 1
      fi
    else
      sudo apt install -y tmux
    fi
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

# Clone or update repo
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log_info "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  log_info "Downloading ClaudeDeck..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Approve native builds before first install
if ! grep -q "onlyBuiltDependencies" package.json 2>/dev/null; then
  node -e "
    const pkg = require('./package.json');
    pkg.pnpm = pkg.pnpm || {};
    pkg.pnpm.onlyBuiltDependencies = ['better-sqlite3', 'esbuild', 'node-pty', 'sharp'];
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
fi

# Dependencies
log_info "Installing dependencies..."
pnpm install

# .env (preserve existing)
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  log_info "Writing .env..."
  echo "PORT=$PORT" > "$INSTALL_DIR/.env"
  [[ -n "$SSH_HOST" ]] && echo "SSH_HOST=$SSH_HOST" >> "$INSTALL_DIR/.env"
  [[ -n "$SSH_PORT" && "$SSH_PORT" != "22" ]] && echo "SSH_PORT=$SSH_PORT" >> "$INSTALL_DIR/.env"
else
  log_success ".env already exists, keeping current config"
fi

# Build
log_info "Building for production (this may take a minute)..."
pnpm build

# tmux config
if [[ ! -f "$HOME/.tmux.conf" ]] || ! grep -q "mouse on" "$HOME/.tmux.conf" 2>/dev/null; then
  log_info "Enabling tmux mouse support..."
  echo "set -g mouse on" >> "$HOME/.tmux.conf"
fi

# ─── Service setup ────────────────────────────────────────────────────────────

NODE_BIN=$(which node)
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"

INSTALL_SERVICE=false
if [[ -t 0 ]] && [[ "$FLAG_NONINTERACTIVE" == false ]]; then
  echo ""
  if [[ "$IS_MAC" == true ]]; then
    ask "Install as launchd service? (y/n)" "y" SVC_ANSWER
  else
    ask "Install as systemd service? (y/n)" "y" SVC_ANSWER
  fi
  [[ "$SVC_ANSWER" == "y" ]] && INSTALL_SERVICE=true
else
  INSTALL_SERVICE=true
fi

if [[ "$INSTALL_SERVICE" == true ]]; then
  if [[ "$IS_MAC" == true ]]; then
    LAUNCHD_DOMAIN="$(launchd_domain)"
    log_info "Installing launchd service..."
    mkdir -p "$HOME/Library/LaunchAgents" "$INSTALL_DIR/logs"

    cat > "$LAUNCHD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCHD_LABEL</string>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$TSX_BIN</string>
    <string>--env-file=.env</string>
    <string>server.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):$INSTALL_DIR/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/logs/launchd.err.log</string>
</dict>
</plist>
EOF

    launchctl bootout "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1 || true
    launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
    launchctl kickstart -k "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1 || true
    sleep 2
    launchctl print "$LAUNCHD_DOMAIN/$LAUNCHD_LABEL" > /dev/null 2>&1 && log_success "Service running on port $PORT" || log_error "Failed. Check: $INSTALL_DIR/logs/launchd.err.log"
  else
    SERVICE="[Unit]
Description=ClaudeDeck
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$NODE_BIN"):$INSTALL_DIR/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$TSX_BIN --env-file=.env server.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"

    log_info "Installing systemd service..."
    echo "$SERVICE" | sudo tee /etc/systemd/system/claudedeck.service > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable claudedeck > /dev/null 2>&1
    sudo systemctl restart claudedeck
    sleep 2
    systemctl is-active --quiet claudedeck && log_success "Service running on port $PORT" || log_error "Failed. Check: sudo journalctl -u claudedeck -f"
  fi
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

VERSION=$(app_version)

echo ""
echo -e "${GREEN}${BOLD}  ClaudeDeck${VERSION:+ v$VERSION} installed!${NC}"
echo ""
echo -e "  ${BOLD}Local:${NC}    http://localhost:$PORT"
[[ -n "$SSH_HOST" ]] && echo -e "  ${BOLD}Remote:${NC}   Configure your reverse proxy to point to port $PORT"
echo ""
echo -e "  ${DIM}First visit will prompt you to create an account.${NC}"
if [[ "$IS_MAC" == true ]]; then
  LAUNCHD_DOMAIN="$(launchd_domain)"
  echo -e "  ${DIM}Status:  launchctl print $LAUNCHD_DOMAIN/$LAUNCHD_LABEL${NC}"
  echo -e "  ${DIM}Restart: launchctl kickstart -k $LAUNCHD_DOMAIN/$LAUNCHD_LABEL${NC}"
else
  echo -e "  ${DIM}Manage:  sudo systemctl {start|stop|restart|status} claudedeck${NC}"
fi
echo -e "  ${DIM}Update:  ~/.claude-deck/scripts/install.sh --update${NC}"
echo ""
