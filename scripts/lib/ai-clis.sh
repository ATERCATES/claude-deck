#!/usr/bin/env bash
# Claude Code CLI detection and installation for ClaudeDeck

detect_ai_clis() {
    if command -v claude &> /dev/null; then
        echo "claude"
    fi
}

install_claude_code() {
    if command -v claude &> /dev/null; then
        log_success "Claude Code already installed"
        return 0
    fi

    log_info "Installing Claude Code..."
    curl -fsSL https://claude.ai/install.sh | bash

    if is_interactive; then
        log_info "Authenticating Claude Code..."
        echo ""
        echo "Please complete the authentication in your browser."
        read -p "Press Enter when ready to continue..." -r
        claude auth login
    else
        log_info "Run 'claude' to authenticate when ready"
    fi
}

prompt_ai_cli_install() {
    local installed
    installed=$(detect_ai_clis)

    if [[ -n "$installed" ]]; then
        log_success "Found Claude Code"
        return 0
    fi

    echo ""
    log_warn "Claude Code not detected"
    echo ""
    echo "ClaudeDeck requires Claude Code to be installed."
    echo ""
    echo "  Install: npm install -g @anthropic-ai/claude-code"
    echo "  Or:      curl -fsSL https://claude.ai/install.sh | bash"
    echo ""

    if ! is_interactive; then
        log_info "Non-interactive mode: Installing Claude Code"
        install_claude_code
        return
    fi

    read -p "Install Claude Code now? [Y/n] " -r choice
    echo ""

    case "${choice:-Y}" in
        [Yy]*) install_claude_code ;;
        *) log_info "Skipping — install Claude Code before using ClaudeDeck" ;;
    esac
}
