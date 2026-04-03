# openclaw-conductor

A Discord meta-bot that orchestrates OpenClaw agent instances. Manages channel/thread lifecycle, routes work to the right agent, and stores long-term memory.

## Stack

- **Runtime**: Node.js 20+ / TypeScript
- **Discord**: discord.js v14 (slash commands + DM + thread support)
- **AI**: OpenAI-compatible API via `providers.yaml` (multi-provider, fallback chain)
- **Storage**: Plain files under `data/` (gitignored)

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point |
| `src/discord/events/interaction.ts` | Message + slash command handler |
| `src/agent/conductor-agent.ts` | Agent loop, model chain, sticky fallback |
| `src/agent/provider-config.ts` | Load `providers.yaml`, resolve model chain |
| `src/agent/tools.ts` | All Discord + OpenClaw tools available to agent |
| `AGENT.md` | Agent soul / system prompt loaded at runtime |
| `providers.yaml` | AI provider config (gitignored, copy from `providers.example.yaml`) |
| `data/memory/MEMORY.md` | Long-term memory (gitignored, auto-created) |

## Commands

**DM:** `!help`, `!new`, `!clean`, `!clean yes`, `stop`

**Slash (guild channel):** `/topic`, `/memory`, `/status`, `/model`, `/openclaw`, `/setup`

## Run

```bash
npm run build   # compile
npm start       # production
npm run run     # dev (ts-node, no build)
```
