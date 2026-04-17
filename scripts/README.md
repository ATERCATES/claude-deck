# scripts/

Three entry points, one per audience. Each runs at a different point in the install lifecycle — they are not redundant.

## `claude-deck` — user CLI (daemon manager)

Published as the `bin` of `@atercates/claude-deck`. Manages the ClaudeDeck server lifecycle (start/stop/status/logs) and, on first run, installs the app into `~/.claude-deck`.

```bash
# After global install:
claude-deck install      # clone + build + link
claude-deck start        # background daemon
claude-deck status
claude-deck logs
claude-deck enable       # auto-start (launchd on macOS, systemd --user on Linux)
claude-deck update
claude-deck uninstall
```

Config: `CLAUDE_DECK_HOME` (default `~/.claude-deck`), `CLAUDE_DECK_PORT` (default `3011`).

Run `claude-deck help` for the full command list.

## `install.sh` — remote server bootstrap

One-line installer for Linux servers with systemd. Targets `curl | bash` from a fresh box where the repo isn't cloned yet. Registers `claudedeck.service` as a system-wide service, not a user unit.

```bash
# Interactive:
curl -fsSL https://raw.githubusercontent.com/ATERCATES/claude-deck/main/scripts/install.sh -o /tmp/install-claudedeck.sh
bash /tmp/install-claudedeck.sh

# Non-interactive:
curl -fsSL .../scripts/install.sh | bash -s -- --port 3011 --ssh-host myserver.com --ssh-port 22 -y

# Update in place:
~/.claude-deck/scripts/install.sh --update
```

> This file's path is a **public URL** referenced from the root `README.md`. Don't rename or move it.

## `setup.sh` — local dev prerequisites

For contributors who just cloned the repo. Installs Node ≥20, pnpm, tmux (with `mouse on`), ripgrep, build tools, creates `.env` from `.env.example`, runs `pnpm install`. No git clone, no build, no service registration.

```bash
pnpm setup          # same as ./scripts/setup.sh
```

## Why three, not one?

|               | When it runs         | Repo present?      | Systemd?                               | Audience     |
| ------------- | -------------------- | ------------------ | -------------------------------------- | ------------ |
| `install.sh`  | Before anything else | No (clones it)     | Yes                                    | Server admin |
| `setup.sh`    | After `git clone`    | Yes                | No                                     | Contributor  |
| `claude-deck` | After `npm i -g`     | Ignores local repo | No (user-level launchd/systemd opt-in) | End user     |

They share prerequisite-install logic (Node/pnpm/tmux) on purpose — consolidating would require one of the scripts to reach into a location that doesn't exist yet at its point in the lifecycle.

## `lib/` — internals sourced by `claude-deck`

Not meant to be executed directly.

- `common.sh` — loggers, `detect_os`, `prompt_yn`, PID helpers, `get_tailscale_ip`.
- `prerequisites.sh` — detect/install Node, pnpm, tmux, git. Probes nvm, fnm, asdf, volta, Homebrew, and `~/.local/bin`.
- `ai-clis.sh` — detect/install the Claude Code CLI.
- `commands.sh` — implementation of the `claude-deck` subcommands.
