# openclaw-conductor

A Discord meta-bot that manages [OpenClaw](https://github.com/openclaw) bot instances. It orchestrates agent channels, manages topic lifecycles, stores long-term memory, and lets you control your entire OpenClaw fleet from a single DM conversation.

## Why

When you run multiple AI bots on Discord, chat histories grow unbounded — context gets noisy, expensive, and impossible to audit. `openclaw-conductor` gives every work session a structured lifecycle: **open → work → summarize → close**, with memory written to inspectable files and a conductor agent that routes tasks to the right bot.

---

## Quick Start

See **[QUICKSTART.md](QUICKSTART.md)** for the minimal setup steps to get the bot online in under five minutes.

---

## Commands

### DM Commands

Talk to the conductor via Direct Message:

| Command | Description |
|---------|-------------|
| `!help` | List all available commands |
| `!new` | Start a fresh conversation session |
| `!clean` | Archive conversation to memory, then delete bot messages (with confirmation) |
| `stop` | Interrupt a running task |

### Slash Commands

Use these in a guild channel:

| Command | Description |
|---------|-------------|
| `/topic` | Create and manage work topics (channels + agent handoff) |
| `/memory` | Show memory captured from closed topics |
| `/status` | List all open topics |
| `/model` | Show or switch the active AI model |
| `/openclaw` | OpenClaw config management |
| `/setup` | Step-by-step new agent setup wizard |

---

## AI Provider Configuration (`providers.yaml`)

The conductor supports multiple providers with automatic fallback. When the primary model fails or rate-limits, it switches to the next in the chain and stays there until the cooldown expires (parsed from the error response, default 30 minutes).

```yaml
providers:
  - id: primary
    base_url: https://api.openai.com/v1
    api: openai-completions
    api_key_env: OPENAI_API_KEY
    models:
      - id: gpt-4o
        nickname: gpt
        context_window: 128000
        max_tokens: 16384
      - id: gpt-4o-mini
        nickname: gpt-mini
        context_window: 128000
        max_tokens: 16384

model_chain:
  - gpt        # primary — use nickname or full model id
  - gpt-mini   # fallback
```

Use `/model` in Discord to inspect or switch the active model at runtime.

---

## Memory

Long-term memory is stored in `data/memory/MEMORY.md` (gitignored). It persists across sessions and is loaded into every conversation automatically.

The conductor writes to memory when:
- You run `!clean` (DM conversation archived)
- You explicitly ask it to remember something

---

## OpenClaw Integration

If OpenClaw is installed, the conductor reads and writes its config directly. Set `OPENCLAW_ROOT` in `.env` if OpenClaw is not at the default location (`~/.openclaw`).

```bash
OPENCLAW_ROOT=/path/to/openclaw  # optional override
```

---

## Development

```bash
npm run build    # Compile TypeScript → dist/
npm run run      # Run with ts-node (dev mode, no build step)
npm run lint     # ESLint
```

---

## License

MIT
