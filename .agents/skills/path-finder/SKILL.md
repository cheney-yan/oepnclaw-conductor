# Skill: PathFinder

**Purpose:** Resolve the canonical filesystem paths for any entity in the system — the conductor itself, OpenClaw root, or a named OpenClaw agent. Other skills call this first before reading/writing any file.

**Parameter:** `agent` — one of:
- `conductor` — this bot (openclaw-conductor)
- `openclaw` — OpenClaw root installation (no specific agent)
- `<agent-name>` — a named OpenClaw agent (e.g. `devbot`, `main`)

---

## Case 1: `conductor`

These are the conductor's **own** paths. Nothing to do with OpenClaw agents.

| What | Path | Env override |
|------|------|-------------|
| Long-term memory | `./data/memory/MEMORY.md` | `MEMORY_PATH` |
| Session contexts | `./data/contexts/` | `CONTEXTS_PATH` |
| Topic metadata | `./data/topics/` | `TOPICS_PATH` |
| Log file | `./logs/conductor.log` | `LOG_FILE` |
| AI provider config | `./providers.yaml` | — |
| Agent soul / system prompt | `./AGENT.md` | — |
| Skills | `./.agents/skills/` | — |

> All paths are relative to the conductor's working directory (where `npm start` is run).  
> Read env overrides from `process.env` — they may differ from defaults above.

---

## Case 2: `openclaw`

OpenClaw's **root installation** — not specific to any agent.

| What | Default path | Env override |
|------|-------------|-------------|
| Root directory | `~/.openclaw/` | `OPENCLAW_STATE_DIR` |
| Main config | `~/.openclaw/openclaw.json` | `OPENCLAW_CONFIG_PATH` |
| Credentials / OAuth | `~/.openclaw/credentials/` | `OPENCLAW_OAUTH_DIR` |
| Default workspace | `~/.openclaw/workspace/` | `OPENCLAW_PROFILE` (appended as suffix) |
| Global skills | `~/.agents/skills/` | — |

> **Legacy:** if `~/.clawdbot/` exists and `~/.openclaw/` does not, the legacy path is used.  
> **Profile workspace:** if env `OPENCLAW_PROFILE` is set (and not `"default"`), workspace is `~/.openclaw/workspace-{profile}/`.

To get the actual root at runtime:
```
openclaw_cli ["config", "get", "paths"]
```

---

## Case 3: `<agent-name>`

For a **named OpenClaw agent**. The agent's ID may differ from its display name — resolve it first.

### Step 1 — Resolve agent ID and workspace

```
openclaw_cli ["agents", "list"]
```

This returns agents with their `id` and configured `workspace`. The agent name may match the id directly, or you may need to match by display name.

Alternatively, read config directly:
```
openclaw_read_config   →  agents.list[].id, agents.list[].workspace, agents.list[].agentDir
```

### Step 2 — Construct paths from the agent ID

| What | Default path | Config key override |
|------|-------------|-------------------|
| **Agent dir** (runtime state) | `~/.openclaw/agents/{id}/agent/` | `agents.list[].agentDir` |
| **Workspace** (editable files) | `~/.openclaw/workspace/` | `agents.list[].workspace` |
| **Sessions dir** | `~/.openclaw/agents/{id}/sessions/` | `agents.list[].storePath` |
| **Session store** (index) | `~/.openclaw/agents/{id}/sessions/sessions.json` | — |
| **Session transcript** | `~/.openclaw/agents/{id}/sessions/{sessionId}.jsonl` | — |
| **SOUL.md** (system prompt) | `{workspace}/SOUL.md` | — |
| **MEMORY.md** (long-term memory) | `{workspace}/MEMORY.md` or `{workspace}/memory.md` | `agents.list[].memorySearch` |
| **Skills (1)** | `{workspace}/skills/` | — |
| **Skills (2)** | `{workspace}/.agents/skills/` | — |
| **Skills (3)** | `~/.agents/skills/` (global) | — |

> `{id}` is the agent's `id` field from config (lowercased for path safety).  
> `{workspace}` may be overridden per agent — always resolve from config, don't assume default.

### Step 3 — Read a file in the agent's workspace

```
openclaw_read_file   path: "{workspace}/SOUL.md"
openclaw_read_file   path: "{workspace}/MEMORY.md"
openclaw_read_file   path: "{workspace}/skills/{skill-name}/SKILL.md"
```

### Step 4 — Write / patch config for this agent

Config key path for per-agent settings:
```
agents.list[{index}].{key}
```

For Discord channel config, the full path is:
```
channels.discord.accounts.{accountId}.guilds.{guildId}.channels.{channelId}.{key}
```

To get the `accountId` for a specific agent:
```
openclaw_cli ["config", "get", "bindings"]
→ find binding where agentId == "{agent-id}"
→ extract match.accountId
```

---

## Quick Decision Tree

```
Which entity?
│
├── "conductor" → use ./data/... paths (this project's directory)
│
├── "openclaw"  → use ~/.openclaw/... paths (root config/install)
│
└── <name>      → openclaw_cli agents list
                  → find id + workspace for that agent
                  → construct paths from table above
```

---

## Notes

- **Never mix up conductor memory (`./data/memory/MEMORY.md`) with an agent's memory (`{workspace}/MEMORY.md`).** They are completely separate files.
- OpenClaw's `OPENCLAW_ROOT` env var (used by the conductor) maps to the OpenClaw root — equivalent to `OPENCLAW_STATE_DIR`.
- If an agent has a custom `agentDir` or `workspace` in config, those override the defaults — always read config first.
- Skills are discovered in order: workspace/skills → workspace/.agents/skills → ~/.agents/skills. Later entries do not override earlier ones.
