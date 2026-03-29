# CursedClaude ⚡

[![npm version](https://img.shields.io/npm/v/cursedclaude)](https://www.npmjs.com/package/cursedclaude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**Claude Code's brain. Cursor Pro's models. One command.**

CursedClaude proxies Claude Code's API calls through Cursor Pro's inference engine.
You keep Claude Code's full orchestration (skills, plugins, slash commands, memory) while gaining access to models only available in Cursor: Claude 4.6 Opus, GPT-5, Gemini 3.1, Grok 4, and more.

> **Note:** Works with any Cursor account (free or Pro). Free accounts have a monthly request limit — Pro is recommended for heavy daily use. Not affiliated with Anthropic or Cursor.

---

## Prerequisites

- **Node.js ≥ 18** — [nodejs.org](https://nodejs.org)
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **Cursor** (free or Pro) — [cursor.sh](https://cursor.sh) (must be logged in)

## Quick Start

```bash
npm install -g cursedclaude
cclaude
```

If `npm install -g` fails (permissions), use `npx` instead:

```bash
npx cursedclaude
```

That's it. CursedClaude starts the proxy and launches Claude Code automatically.

---

## Commands

| Command | Description |
|---------|-------------|
| `cclaude` | Launch Claude Code through the proxy *(default)* |
| `cclaude --model <model>` | Force a specific Cursor model |
| `cclaude --resume` | Resume your last Claude Code session |
| `cclaude --permission-mode bypassPermissions` | Skip permission prompts |
| `cclaude --dangerously-skip-permissions` | Skip all permission checks |
| `cclaude --verbose` | Verbose output (proxy + Claude) |
| `cclaude stop` | Stop the proxy |
| `cclaude status` | Check proxy health + Cursor auth |
| `cclaude models` | List all available Cursor models |
| `cclaude start --daemon` | Start proxy in background |
| `cclaude --port 9090` | Use a different port (default: 8080) |

All native Claude Code flags are passed through transparently.

---

## Documentation

- [Installation Guide](docs/installation.md) — detailed setup, OS-specific notes, fallbacks
- [All Commands & Options](docs/usage.md) — full reference with examples
- [Troubleshooting](docs/troubleshooting.md) — common issues and solutions
- [Available Models](docs/models.md) — full model list with usage notes

---

## How it works

```
Claude Code → [ANTHROPIC_BASE_URL] → CursedClaude proxy → Cursor backend
                                            ↑
                                   translates Anthropic API
                                   format ↔ Cursor format
```

CursedClaude intercepts Claude Code's outbound API calls, translates them to Cursor's internal format, forwards them to Cursor's inference backend, and streams the response back — all transparently.

---

## License

[MIT](LICENSE) — use it, fork it, ship it.
