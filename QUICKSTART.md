# Quick Start

This guide gets you to **step one**: the conductor bot is online and you can talk to it via Discord DM. That's the foundation everything else builds on.

Orchestrating OpenClaw agents and other Discord bots comes next — the conductor walks you through that interactively once it's running (use `/setup` in your server).

---

## Prerequisites

- Node.js 20+
- A Discord server where you have admin rights
- An AI provider configured in `providers.yaml` (see `providers.example.yaml`)

---

## 1. Create the Discord Bot

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. **Bot** tab → **Add Bot**
3. **Privileged Gateway Intents** → enable **Message Content Intent**
4. **Reset Token** → copy it
5. **OAuth2 → URL Generator** → scopes: `bot` + `applications.commands` → permissions: **Administrator**
6. Open the generated URL → authorize for your server

---

## 2. Configure & Run

```bash
git clone https://github.com/your-username/openclaw-conductor
cd openclaw-conductor
npm install
cp .env.example .env
```

Edit `.env` — only **one value** required:

```env
DISCORD_BOT_TOKEN=    # from step 1
```

Configure your AI provider:

```bash
cp providers.example.yaml providers.yaml
# edit providers.yaml — set your API key(s) and preferred model(s)
```

```bash
npm run build
npm run serve
```

The bot auto-detects its application ID, registers slash commands, and comes online.

---

## Commands

**DM the bot:**

| Command | What it does |
|---------|-------------|
| `!help` | List all commands |
| `!new` | Start a fresh conversation session |
| `!clean` | Archive + delete bot messages (with confirmation) |
| `stop` | Interrupt a running task |

**In a guild channel:**

| Slash Command | What it does |
|---------|-------------|
| `/topic` | Open / manage work topics |
| `/memory` | Inspect captured memory |
| `/status` | List open topics |
| `/model` | Show or switch the active AI model |
| `/openclaw` | View / manage OpenClaw config |
| `/setup` | Step-by-step new agent wizard |
