# Available Models

List all available models with:
```bash
cclaude models
```

Use a model with:
```bash
cclaude --model <model-name>
```

---

## Claude models (via Cursor)

| Model | Speed | Best for |
|-------|-------|----------|
| `claude-4.6-opus-max-thinking` | Slowest | Maximum reasoning, hard problems |
| `claude-4.6-opus-high-thinking` | Slow | Complex reasoning, architecture |
| `claude-4.6-sonnet-medium-thinking` | Medium | **Recommended default** — balanced |
| `claude-4.5-opus-high-thinking` | Slow | Previous gen Opus with reasoning |
| `claude-4.5-sonnet-thinking` | Medium | Claude 4.5 with reasoning |
| `claude-4.5-sonnet` | Fast | Quick tasks, Claude 4.5 |
| `claude-4.5-haiku-thinking` | Fast | Small tasks with reasoning |
| `claude-4.5-haiku` | Fastest Claude | High-volume, simple tasks |
| `claude-4-sonnet-thinking` | Medium | Claude 4 with reasoning |
| `claude-4-sonnet` | Fast | Claude 4 standard |

## Other models (via Cursor)

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt-5.4-high` | OpenAI | GPT-5 high compute |
| `gpt-5.3-codex-high` | OpenAI | GPT-5 Codex variant |
| `gpt-5.2-high` | OpenAI | GPT-5 high |
| `gpt-5.2` | OpenAI | GPT-5 standard |
| `gpt-5.1` | OpenAI | GPT-5 fast |
| `gpt-5-mini` | OpenAI | Lightweight GPT-5 |
| `gemini-3.1-pro` | Google | Gemini 3.1 Pro |
| `gemini-3-flash` | Google | Gemini 3 fast |
| `gemini-2.5-flash` | Google | Gemini 2.5 fast |
| `grok-4-20-thinking` | xAI | Grok 4 with reasoning |
| `kimi-k2.5` | Moonshot AI | Kimi K2.5 |

---

## Model availability

Model availability depends on your Cursor Pro plan. If a model is not available in your plan, Cursor will fall back to its default model.

To check which models work for your account:
```bash
cclaude models    # lists all known models
cclaude status    # shows your Cursor membership type
```

---

## Examples

```bash
# Maximum reasoning power
cclaude --model claude-4.6-opus-max-thinking

# Fast everyday use
cclaude --model claude-4.5-haiku

# GPT-5 via Cursor
cclaude --model gpt-5.2

# Gemini fast
cclaude --model gemini-2.5-flash
```
