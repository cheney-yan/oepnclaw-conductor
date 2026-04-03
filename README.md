# openclaw-conductor

A Discord meta-bot that manages [OpenClaw](https://github.com/openclaw) bot instances. It orchestrates agent channels, manages topic lifecycles, stores long-term memory, and lets you control your entire OpenClaw fleet from a single DM conversation.

## Why

When you run multiple AI bots on Discord, chat histories grow unbounded — context gets noisy, expensive, and impossible to audit. `openclaw-conductor` gives every work session a structured lifecycle: **open → work → summarize → close**, with memory written to inspectable files and a conductor agent that routes tasks to the right bot.

---

## Quick Start

### Prerequisites

- Node.js 20+
- A Discord account with a server you control
- An OpenAI-compatible API key (OpenAI, Anthropic proxy, Groq, Ollama, etc.)

### 1. Create Your Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name (e.g. `conductor`)
3. Go to **Bot** tab → enable **Message Content Intent** under Privileged Gateway Intents
4. Click **Reset Token** and copy it
5. Go to **OAuth2 → URL Generator**, select scopes: `bot`, `applications.commands`
6. Select permissions: Manage Channels, Manage Threads, Send Messages, Read Message History, Embed Links, Attach Files
7. Open the generated URL and authorize for your server

### 2. Configure Environment

```bash
git clone https://github.com/your-username/openclaw-conductor
cd openclaw-conductor
npm install
cp .env.example .env
```

Edit `.env` with your Discord bot token, guild ID, and API key.

### 3. Configure AI Provider

```bash
cp providers.example.yaml providers.yaml
```

Edit `providers.yaml` — set your provider's base URL, API key, and choose models for the fallback chain. See [providers.example.yaml](providers.example.yaml) for the full format.

If you skip this step, the bot falls back to `.env` settings (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`).

### 4. Start the Bot

```bash
npm start
```

The bot shows **Online** in your Discord server and slash commands register automatically.

---

## DM Commands

Talk to the conductor via Direct Message:

| Command | Description |
|---------|-------------|
| `!help` | List all available commands |
| `!new` | Start a fresh conversation session |
| `!clean` | Archive conversation to memory, then delete bot messages (with confirmation) |
| `stop` | Interrupt a running task |

## Slash Commands

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
