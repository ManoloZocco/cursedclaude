# Usage Guide

## Basic usage

```bash
cclaude          # launch Claude Code through the proxy
cursedclaude     # identical alias
```

CursedClaude automatically:
1. Reads your Cursor auth token
2. Starts the proxy server on port 8080
3. Launches Claude Code pointed at the proxy
4. Shuts down the proxy when Claude Code exits

---

## Proxy options

These flags are handled by CursedClaude and are **not** forwarded to Claude Code:

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --port <number>` | `8080` | Proxy listen port |
| `-m, --model <model>` | *(Cursor default)* | Force a specific Cursor model |
| `-v, --verbose` | off | Verbose proxy logging (also forwarded to Claude) |
| `--no-bare` | off | Use Claude login flow instead of API-key auth |
| `--no-user-settings` | off | Isolated mode — ignore user settings, plugins, skills |
| `-n, --native` | off | Bypass proxy entirely, use Anthropic API directly |
| `--daemon` | off | Start proxy in background and return immediately |

---

## Claude Code passthrough flags

All native Claude Code flags are passed through transparently. Examples:

```bash
# Resume last session
cclaude --resume

# Skip all permission prompts
cclaude --permission-mode bypassPermissions
cclaude --dangerously-skip-permissions

# Non-interactive / print mode
cclaude --print "write a hello world function in Go"

# Verbose output (both proxy and Claude)
cclaude --verbose

# Load a specific directory
cclaude /path/to/project

# Multiple flags combined
cclaude --resume --model claude-4.6-opus-high-thinking --verbose
```

---

## Subcommands

### `cclaude start`

Start the proxy server without launching Claude Code.

```bash
cclaude start                          # foreground
cclaude start --daemon                 # background
cclaude start --port 9090 --daemon     # background on custom port
cclaude start --model claude-4.5-haiku # force model
```

### `cclaude stop`

Stop the proxy and any Claude Code process it launched.

```bash
cclaude stop              # stops proxy on default port 8080
cclaude stop --port 9090  # stops proxy on custom port
```

### `cclaude status`

Show proxy health and Cursor authentication info.

```bash
cclaude status
cclaude status --port 9090
```

Output includes:
- Cursor email and membership type
- Auth token preview (first 30 chars)
- Proxy running status and endpoint URL
- Claude Code binary path

### `cclaude models`

List all available Cursor models.

```bash
cclaude models
```

See [models.md](models.md) for the full list with usage notes.

### `cclaude restart`

Restart the proxy server.

```bash
cclaude restart
cclaude restart --port 9090 --model claude-4.6-sonnet-medium-thinking
```

---

## Using a specific model

```bash
# List available models first
cclaude models

# Use a specific model
cclaude --model claude-4.6-opus-high-thinking

# Or with a subcommand
cclaude start --model gpt-5.2 --daemon
cclaude
```

---

## Using a different port

Useful when port 8080 is already in use:

```bash
cclaude --port 9090

# Remember to use the same port for other commands:
cclaude stop --port 9090
cclaude status --port 9090
```

---

## Running the proxy in the background

```bash
# Start proxy in background
cclaude start --daemon

# Then launch Claude Code separately (reuses the running proxy)
cclaude

# Stop when done
cclaude stop
```

---

## Native mode (bypass proxy)

Use Anthropic API directly instead of Cursor. Useful for comparison or when Cursor is unavailable.

```bash
cclaude --native
# or
cclaude run --native
```

Requires a valid `ANTHROPIC_API_KEY` in your environment.
