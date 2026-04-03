import { Type } from '@sinclair/typebox';
import type { Guild, TextChannel, ThreadChannel, CategoryChannel, GuildBasedChannel, PermissionResolvable } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { logger } from '../logger';
import { createTopic, getAllOpenTopics, getTopicByThread, closeTopic } from '../lifecycle/topic-manager';
import { summarizeThread } from '../lifecycle/summarizer';
import { writeMemoryArtifact } from '../lifecycle/memory-store';
import { buildOpenClawTools } from './openclaw-tools';
import { loadMemorySummary, writeMemoryBlock, appendMemorySummary, listMemoryBlocks, readMemoryBlock } from './long-term-memory';
import type { DiscordContext } from './conductor-agent';

function ok(text: string): AgentToolResult<undefined> {
  return { content: [{ type: 'text', text }], details: undefined };
}

function buildMemoryTools(): AgentTool<any>[] {
  return [
    {
      name: 'memory_read_summary',
      label: 'Read Memory Summary',
      description:
        'Read the memory summary index — one line per memory block. ' +
        'Call this to see what memories exist before reading a specific block.',
      parameters: Type.Object({}),
      execute: async () => {
        const summary = loadMemorySummary();
        const blocks = listMemoryBlocks();
        const lines = [`## Memory Summary\n${summary || '(empty)'}\n\n## Available blocks (${blocks.length})`];
        for (const f of blocks) lines.push(`- ${f}`);
        return ok(lines.join('\n'));
      },
    },
    {
      name: 'memory_read_block',
      label: 'Read Memory Block',
      description: 'Read the full content of a specific memory block by filename (e.g. "2026-04-03T10-00-00-000Z.md").',
      parameters: Type.Object({
        filename: Type.String({ description: 'Memory block filename as listed in the summary' }),
      }),
      execute: async (_id, p: { filename: string }) => {
        return ok(readMemoryBlock(p.filename));
      },
    },
    {
      name: 'memory_write_block',
      label: 'Write Memory Block',
      description:
        'Save a new memory block with detailed content and a one-line summary for the index. ' +
        'Call this when the user asks you to remember something, or at end of a work session. ' +
        'Write concise, factual content — not raw conversation.',
      parameters: Type.Object({
        summary: Type.String({ description: 'One-line summary for the memory index (max 120 chars)' }),
        content: Type.String({ description: 'Full memory content in Markdown' }),
      }),
      execute: async (_id, p: { summary: string; content: string }) => {
        const filename = writeMemoryBlock(p.content);
        appendMemorySummary(`${p.summary.slice(0, 120)} (→ ${filename})`);
        return ok(`Memory saved as ${filename}`);
      },
    },
  ];
}

function buildContextTool(ctx?: DiscordContext): AgentTool<any> {
  return {
    name: 'get_current_context',
    label: 'Get Current Discord Context',
    description:
      'Returns the Discord context of the current conversation: guild, channel, and thread IDs and names. ' +
      'Call this whenever you need to know "which channel am I in", "what is this thread ID", ' +
      'or before performing any action that requires the current channel or thread ID.',
    parameters: Type.Object({}),
    execute: async () => {
      if (!ctx) return ok('No Discord context available (running outside a Discord session).');
      const lines: string[] = [];
      lines.push(`Guild: ${ctx.guildName} (ID: ${ctx.guildId})`);
      if (ctx.isDM) {
        lines.push(`Type: Direct Message`);
        lines.push(`DM Channel ID: ${ctx.channelId}`);
      } else if (ctx.parentChannelId) {
        lines.push(`Type: Thread`);
        lines.push(`Thread name: ${ctx.channelName}`);
        lines.push(`Thread ID: ${ctx.channelId}`);
        lines.push(`Parent channel: #${ctx.parentChannelName} (ID: ${ctx.parentChannelId})`);
      } else {
        lines.push(`Type: Channel`);
        lines.push(`Channel: #${ctx.channelName} (ID: ${ctx.channelId})`);
      }
      return ok(lines.join('\n'));
    },
  };
}

// ── rememberChannel helper ────────────────────────────────────────────────────
// Fetches messages, saves conductor metadata, then notifies participating agents.
// Conductor stores only its own metadata (channel info, participants, timestamps).
// Agents receive the raw thread content and handle their own memory — conductor
// does NOT summarize on their behalf.
type MessageableChannel = TextChannel | ThreadChannel;

function resolveMessageableChannel(guild: Guild, id: string): MessageableChannel | undefined {
  const ch = guild.channels.cache.get(id);
  if (!ch) return undefined;
  if (ch.type === ChannelType.GuildText || ch.isThread()) return ch as MessageableChannel;
  return undefined;
}

async function rememberChannel(channel: MessageableChannel, agentNamesOverride?: string[]): Promise<string[]> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  const fs = await import('fs');
  const path = await import('path');

  const fetched = await channel.messages.fetch({ limit: 100 });
  const allMessages = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const conductorBotId = channel.client.user?.id ?? '';
  const botParticipants = [...new Set(
    allMessages
      .filter(m => m.author.bot && m.author.id !== conductorBotId && m.content.trim())
      .map(m => m.author.username.toLowerCase()),
  )];
  const humanParticipants = [...new Set(
    allMessages.filter(m => !m.author.bot).map(m => m.author.username),
  )];

  const lines: string[] = [];
  const timestamp = Date.now();
  const artifactsDir = process.env.MEMORY_ARTIFACTS_PATH ?? './data/memories/';
  fs.mkdirSync(path.resolve(artifactsDir), { recursive: true });

  if (allMessages.length === 0) {
    lines.push(`#${channel.name} had no messages — nothing to remember.`);
    return lines;
  }

  // ── Determine which agents to notify ─────────────────────────────────────
  let agentsToNotify: string[] = [];
  if (agentNamesOverride?.length) {
    agentsToNotify = agentNamesOverride;
  } else if (botParticipants.length > 0) {
    try {
      const { stdout } = await execFileAsync('openclaw', ['agents', 'list'], { timeout: 10000, env: { ...process.env } });
      const knownAgents = stdout.trim().split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
      agentsToNotify = botParticipants.filter(bot => knownAgents.includes(bot));
      const unmatched = botParticipants.filter(bot => !knownAgents.includes(bot));
      if (unmatched.length) lines.push(`Bots not matched to OpenClaw agents (skipped): ${unmatched.join(', ')}`);
    } catch (err: any) {
      lines.push(`Could not list OpenClaw agents: ${err.message?.slice(0, 80)}`);
    }
  }

  // ── Conductor metadata artifact ───────────────────────────────────────────
  const metaPath = path.resolve(artifactsDir, `session_${channel.id}_${timestamp}.md`);
  fs.writeFileSync(metaPath, [
    `# Session Metadata: #${channel.name}`,
    `**ID:** ${channel.id}`,
    `**Type:** ${channel.isThread() ? 'thread' : 'channel'}`,
    `**Closed at:** ${new Date(timestamp).toISOString()}`,
    `**Total messages:** ${allMessages.length}`,
    `**Human participants:** ${humanParticipants.join(', ') || 'none'}`,
    `**Bot participants:** ${botParticipants.join(', ') || 'none'}`,
    `**Agents notified:** ${agentsToNotify.join(', ') || 'none'}`,
  ].join('\n'), 'utf-8');
  lines.push(`Metadata saved: ${metaPath}`);
  lines.push(`Participants — humans: [${humanParticipants.join(', ')}], bots: [${botParticipants.join(', ')}]`);

  if (agentsToNotify.length === 0) {
    lines.push('No OpenClaw agents to notify.');
    return lines;
  }

  // ── Notify agents with raw content — they handle their own memory ─────────
  const rawContent = allMessages
    .filter(m => m.author.id !== conductorBotId && m.content.trim())
    .map(m => `[${m.author.username}]: ${m.content}`)
    .join('\n');

  const notification = [
    `Thread #${channel.name} has ended (${new Date(timestamp).toISOString()}).`,
    `Participants: ${[...humanParticipants, ...botParticipants].join(', ')}`,
    `Please save anything relevant from this conversation to your own memory.`,
    '',
    '--- conversation ---',
    rawContent,
    '--- end ---',
  ].join('\n');

  for (const agentName of agentsToNotify) {
    try {
      await execFileAsync('openclaw', ['message', '--agent', agentName, notification], {
        timeout: 15000, env: { ...process.env },
      });
      lines.push(`Notified agent "${agentName}" — they will handle their own memory.`);
      logger.info(`Notified agent "${agentName}" about ended session #${channel.name}`);
    } catch (err: any) {
      lines.push(`Failed to notify "${agentName}": ${err.message?.slice(0, 80)}`);
    }
  }

  return lines;
}

export function buildTools(guild: Guild | null, ctx?: DiscordContext): AgentTool<any>[] {
  // OpenClaw tools never need a guild; Discord tools do
  const ocTools = buildOpenClawTools();
  const memTools = buildMemoryTools();
  const ctxTool = buildContextTool(ctx);
  if (!guild) return [ctxTool, ...memTools, ...ocTools];
  return [ctxTool, ...memTools, ...ocTools,

    // ── configure_agent_channel ───────────────────────────────────────────────
    // For fixing an existing agent that already has a Discord binding but the
    // channel allow config was never written (e.g. Luna).
    {
      name: 'configure_agent_channel',
      label: 'Configure Agent Channel',
      description:
        'Register an existing OpenClaw agent for a specific Discord channel. ' +
        'Uses the agent\'s Discord account binding to write the correct config path. ' +
        'Use this when an agent exists and has a Discord bot token but is not responding in a channel.',
      parameters: Type.Object({
        agent_name: Type.String({ description: 'OpenClaw agent name (e.g. "luna")' }),
        channel_id: Type.String({ description: 'Discord channel ID to enable the agent in' }),
        require_mention: Type.Optional(Type.Boolean({ description: 'Require @mention to respond. Default false.' })),
      }),
      execute: async (_id, p: { agent_name: string; channel_id: string; require_mention?: boolean }) => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        // Find the agent's Discord account binding
        let accountId: string | undefined;
        try {
          const { stdout } = await execFileAsync('openclaw', ['config', 'get', 'bindings'], { timeout: 10000, env: { ...process.env } });
          const bindings: any[] = JSON.parse(stdout);
          const binding = bindings.find(b => b.agentId === p.agent_name && b.match?.channel === 'discord');
          accountId = binding?.match?.accountId;
        } catch (err: any) {
          return ok(`Could not read bindings: ${err.message?.slice(0, 80)}`);
        }

        if (!accountId) {
          return ok(`Agent "${p.agent_name}" has no Discord binding. Use the agent creation flow to add a Discord bot token first.`);
        }

        const base = `channels.discord.accounts.${accountId}.guilds.${guild.id}.channels.${p.channel_id}`;
        const requireMention = p.require_mention ?? false;

        const lines: string[] = [];
        try {
          await execFileAsync('openclaw', ['config', 'set', `${base}.allow`, 'true'], { timeout: 10000, env: { ...process.env } });
          await execFileAsync('openclaw', ['config', 'set', `${base}.requireMention`, String(requireMention)], { timeout: 10000, env: { ...process.env } });
          lines.push(`✓ Agent "${p.agent_name}" (account ${accountId}) enabled in channel ${p.channel_id}.`);
          lines.push(`  requireMention: ${requireMention}`);
          lines.push(`  Config path: ${base}`);
        } catch (err: any) {
          lines.push(`✗ Failed: ${err.message?.slice(0, 80)}`);
        }

        return ok(lines.join('\n'));
      },
    },

    // ── setup_guild ───────────────────────────────────────────────────────────
    {
      name: 'setup_guild',
      label: 'Setup Guild (Default Mode)',
      description:
        'Initial guild setup for Default mode: reads all OpenClaw agents, creates a dedicated text channel ' +
        'for each agent that does not already have one (named `#<agent-name>`), configures each agent to ' +
        'allow that channel via OpenClaw config, and optionally groups them under an "Agents" category. ' +
        'Safe to re-run — skips channels that already exist.',
      parameters: Type.Object({
        category_name: Type.Optional(Type.String({
          description: 'Category to group agent channels under. Defaults to "Agents".',
        })),
      }),
      execute: async (_id, p: { category_name?: string }) => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        const categoryName = p.category_name ?? 'Agents';
        const lines: string[] = [];

        // Get all agents with their Discord account bindings
        let bindingsJson: any[] = [];
        try {
          const { stdout } = await execFileAsync('openclaw', ['agents', 'list', '--json'], { timeout: 10000, env: { ...process.env } });
          // Fallback: parse text output for agent names
          const parsed = JSON.parse(stdout);
          bindingsJson = Array.isArray(parsed) ? parsed : [];
        } catch {
          // --json not supported or parse failed — fall back to text list
        }

        let agentNames: string[] = [];
        try {
          const { stdout } = await execFileAsync('openclaw', ['agents', 'list'], { timeout: 10000, env: { ...process.env } });
          // Extract agent names from lines like "- luna (Luna)" or "- main (default) (jojo)"
          agentNames = stdout.trim().split('\n')
            .filter(l => l.trim().startsWith('-'))
            .map(l => l.trim().replace(/^-\s+/, '').split(/\s+/)[0])
            .filter(Boolean);
        } catch (err: any) {
          return ok(`Failed to list agents: ${err.message?.slice(0, 80)}`);
        }

        if (agentNames.length === 0) {
          return ok('No agents found. Add agents first with `openclaw agents add`.');
        }

        // Read bindings to find each agent's Discord accountId
        let allBindings: Array<{ agentId: string; match: { channel: string; accountId: string } }> = [];
        try {
          const { stdout } = await execFileAsync('openclaw', ['config', 'get', 'bindings'], { timeout: 10000, env: { ...process.env } });
          allBindings = JSON.parse(stdout);
        } catch { /* ignore — will fall back to global path */ }

        const discordAccountForAgent = (name: string): string | undefined => {
          const binding = allBindings.find(b => b.agentId === name && b.match?.channel === 'discord');
          return binding?.match?.accountId;
        };

        // Find or create the category
        let category = guild.channels.cache.find(
          c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase(),
        ) as CategoryChannel | undefined;
        if (!category) {
          category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory }) as CategoryChannel;
          lines.push(`Created category "${categoryName}".`);
        }

        // For each agent: find or create their dedicated channel, then configure
        for (const agentName of agentNames) {
          const channelName = agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const existing = guild.channels.cache.find(
            c => c.name === channelName && c.type === ChannelType.GuildText,
          ) as TextChannel | undefined;

          let ch: TextChannel;
          if (existing) {
            ch = existing;
            lines.push(`#${channelName} already exists — skipped creation.`);
          } else {
            ch = await guild.channels.create({
              name: channelName,
              type: ChannelType.GuildText,
              parent: category!.id,
              topic: `Dedicated channel for OpenClaw agent: ${agentName}`,
            }) as TextChannel;
            lines.push(`Created #${channelName} for agent "${agentName}".`);
          }

          // Configure agent to allow this channel, using the correct account-specific path
          const guildId = guild.id;
          const accountId = discordAccountForAgent(agentName);
          const baseKey = accountId
            ? `channels.discord.accounts.${accountId}.guilds.${guildId}.channels.${ch.id}`
            : `channels.discord.guilds.${guildId}.channels.${ch.id}`;

          if (!accountId) {
            lines.push(`  ⚠ No Discord binding found for "${agentName}" — channel created but not configured. Run the agent creation flow to add a Discord bot token.`);
            continue;
          }

          try {
            await execFileAsync('openclaw', ['config', 'set', `${baseKey}.allow`, 'true'], { timeout: 10000, env: { ...process.env } });
            await execFileAsync('openclaw', ['config', 'set', `${baseKey}.requireMention`, 'false'], { timeout: 10000, env: { ...process.env } });
            lines.push(`  ✓ Agent "${agentName}" (account ${accountId}) configured for #${channelName}.`);
          } catch (err: any) {
            lines.push(`  ✗ Failed to configure "${agentName}": ${err.message?.slice(0, 60)}`);
          }
        }

        lines.push(`\nSetup complete. ${agentNames.length} agent(s) processed.`);
        return ok(lines.join('\n'));
      },
    },

    {
      name: 'list_channels',
      label: 'List Channels',
      description: 'List all channels and categories in the Discord guild',
      parameters: Type.Object({}),
      execute: async (_id, _p, _s, _u) => {
        const lines: string[] = [];
        const all = [...guild.channels.cache.values()] as GuildBasedChannel[];

        const categories = all
          .filter(c => c.type === ChannelType.GuildCategory) as CategoryChannel[];
        categories.sort((a, b) => a.rawPosition - b.rawPosition);

        for (const cat of categories) {
          lines.push(`**${cat.name}**`);
          const children = all
            .filter(c => (c as any).parentId === cat.id && c.type === ChannelType.GuildText)
            .sort((a, b) => (a as any).rawPosition - (b as any).rawPosition);
          for (const ch of children) lines.push(`  #${ch.name} (${ch.id})`);
        }

        const uncategorized = all.filter(
          c => c.type === ChannelType.GuildText && !(c as any).parentId
        );
        if (uncategorized.length > 0) {
          lines.push('**Uncategorized**');
          for (const ch of uncategorized) lines.push(`  #${ch.name} (${ch.id})`);
        }

        return ok(lines.join('\n') || 'No channels found.');
      },
    },

    {
      name: 'create_channel',
      label: 'Create Channel',
      description: 'Create a new text channel in the guild, optionally inside a category',
      parameters: Type.Object({
        name: Type.String({ description: 'Channel name (lowercase, hyphens)' }),
        category_name: Type.Optional(Type.String({ description: 'Category name to place the channel in' })),
        topic: Type.Optional(Type.String({ description: 'Channel topic/description' })),
      }),
      execute: async (_id, p, _s, _u) => {
        const params = p as { name: string; category_name?: string; topic?: string };
        let parentId: string | undefined;

        if (params.category_name) {
          let cat = [...guild.channels.cache.values()].find(
            c => c.type === ChannelType.GuildCategory &&
              c.name.toLowerCase() === params.category_name!.toLowerCase()
          ) as CategoryChannel | undefined;
          if (!cat) {
            cat = await guild.channels.create({ name: params.category_name!, type: ChannelType.GuildCategory }) as CategoryChannel;
            logger.info(`Created category "${params.category_name}"`);
          }
          parentId = cat.id;
        }

        const ch = await guild.channels.create({
          name: params.name,
          type: ChannelType.GuildText,
          parent: parentId,
          topic: params.topic,
        });

        logger.info(`Created channel #${ch.name} (${ch.id})`);
        return ok(`Created channel #${ch.name} (${ch.id})`);
      },
    },

    {
      name: 'open_topic',
      label: 'Open Topic',
      description:
        'Open a new topic (thread) in a specified channel. ' +
        'Optionally post a background message at the top of the thread so agents and users know what the task is. ' +
        'Optionally set a per-thread system prompt for an agent via OpenClaw config.',
      parameters: Type.Object({
        channel_id: Type.String({ description: 'The channel ID to open the topic in' }),
        title: Type.String({ description: 'Topic title (becomes the thread name)' }),
        background: Type.Optional(Type.String({
          description: 'Background context posted as the first message in the thread. Describe the task, participants, and goal.',
        })),
        agent_name: Type.Optional(Type.String({
          description: 'OpenClaw agent to configure for this thread with a system prompt derived from the background.',
        })),
      }),
      execute: async (_id, p: { channel_id: string; title: string; background?: string; agent_name?: string }) => {
        const channel = guild.channels.cache.get(p.channel_id) as TextChannel | undefined;
        if (!channel || channel.type !== ChannelType.GuildText) {
          return ok(`Channel ${p.channel_id} not found or is not a text channel.`);
        }

        const thread = await channel.threads.create({
          name: p.title,
          autoArchiveDuration: 10080,
        });

        createTopic(p.title, channel.id, thread.id, 'conductor');
        logger.info(`Opened topic "${p.title}" in #${channel.name}`);

        const lines = [`Opened topic "${p.title}" → thread \`${thread.id}\` in #${channel.name}`];

        // Post background message as the first message in the thread
        if (p.background) {
          await thread.send(`📋 **Background**\n${p.background}`);
          lines.push('Background message posted.');
        }

        // Configure agent system prompt for this thread
        if (p.agent_name && p.background) {
          const { execFile } = await import('child_process');
          const { promisify } = await import('util');
          const execFileAsync = promisify(execFile);

          let accountId: string | undefined;
          try {
            const { stdout } = await execFileAsync('openclaw', ['config', 'get', 'bindings'], { timeout: 10000, env: { ...process.env } });
            const bindings: any[] = JSON.parse(stdout);
            const binding = bindings.find(b => b.agentId === p.agent_name && b.match?.channel === 'discord');
            accountId = binding?.match?.accountId;
          } catch { /* ignore */ }

          const configBase = accountId
            ? `channels.discord.accounts.${accountId}.guilds.${guild.id}.channels.${thread.id}`
            : `channels.discord.guilds.${guild.id}.channels.${thread.id}`;
          const prompt = `You are helping with the following task in thread "${p.title}": ${p.background}`;
          try {
            await execFileAsync('openclaw', ['config', 'set', `${configBase}.systemPrompt`, prompt], { timeout: 10000, env: { ...process.env } });
            lines.push(`Agent "${p.agent_name}" configured with task context for this thread.`);
          } catch (err: any) {
            lines.push(`Could not set agent system prompt: ${err.message?.slice(0, 60)}`);
          }
        }

        return ok(lines.join('\n'));
      },
    },

    // ── add_agent_to_thread ───────────────────────────────────────────────────
    // Configures a guest agent at thread level only — does not affect their
    // channel-level settings. The primary/owner agent of a channel is already
    // configured at channel level and never needs this.
    {
      name: 'add_agent_to_thread',
      label: 'Add Agent to Thread',
      description:
        'Configure a guest agent to listen and respond in a specific thread (thread-level only). ' +
        'Use this when a secondary agent needs to join an existing thread. ' +
        'The primary/owner agent of the channel does NOT need this — they are already configured channel-wide. ' +
        'Optionally set a task-specific system prompt for this agent in this thread.',
      parameters: Type.Object({
        thread_id: Type.String({ description: 'Thread ID to add the agent to' }),
        agent_name: Type.String({ description: 'OpenClaw agent name to add' }),
        system_prompt: Type.Optional(Type.String({
          description: 'Optional task context/system prompt for this agent in this thread only.',
        })),
      }),
      execute: async (_id, p: { thread_id: string; agent_name: string; system_prompt?: string }) => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        const thread = guild.channels.cache.get(p.thread_id);
        if (!thread || !thread.isThread()) {
          return ok(`Thread ${p.thread_id} not found.`);
        }

        // Resolve account-specific config path for this agent
        let accountId: string | undefined;
        try {
          const { stdout } = await execFileAsync('openclaw', ['config', 'get', 'bindings'], { timeout: 10000, env: { ...process.env } });
          const bindings: any[] = JSON.parse(stdout);
          const binding = bindings.find(b => b.agentId === p.agent_name && b.match?.channel === 'discord');
          accountId = binding?.match?.accountId;
        } catch { /* ignore */ }

        const lines: string[] = [];
        const base = accountId
          ? `channels.discord.accounts.${accountId}.guilds.${guild.id}.channels.${p.thread_id}`
          : `channels.discord.guilds.${guild.id}.channels.${p.thread_id}`;

        try {
          await execFileAsync('openclaw', ['config', 'set', `${base}.allow`, 'true'], { timeout: 10000, env: { ...process.env } });
          lines.push(`Agent "${p.agent_name}" added to thread #${thread.name}.`);
        } catch (err: any) {
          return ok(`Failed to add agent: ${err.message?.slice(0, 80)}`);
        }

        if (p.system_prompt) {
          try {
            await execFileAsync('openclaw', ['config', 'set', `${base}.systemPrompt`, p.system_prompt], { timeout: 10000, env: { ...process.env } });
            lines.push(`System prompt set for "${p.agent_name}" in this thread.`);
          } catch (err: any) {
            lines.push(`Warning: could not set system prompt: ${err.message?.slice(0, 60)}`);
          }
        }

        return ok(lines.join('\n'));
      },
    },

    // ── handoff_to_agent ──────────────────────────────────────────────────────
    // The standard flow for routing a task to an agent:
    //   1. Find or create the right category for the work channel
    //   2. Create a dedicated work channel with a descriptive name
    //   3. Configure the agent at channel level (allow + requireMention:false + autoThread:true)
    //      so every reply creates its own thread rather than flooding the channel
    //   4. Post a background message + handoff note, then step back
    {
      name: 'handoff_to_agent',
      label: 'Hand Off to Agent',
      description:
        'The standard way to route a task to an agent. Creates a dedicated work channel (not a thread) ' +
        'under the appropriate category, configures the agent to respond there with autoThread enabled ' +
        '(each agent reply spawns its own thread to keep the channel tidy), posts the task background, ' +
        'and steps back. Conductor will not respond in that channel again unless @mentioned. ' +
        'channel_name should be a short descriptive slug (e.g. "fix-auth-bug", "homepage-redesign"). ' +
        'category_name should match an existing category or one will be created.',
      parameters: Type.Object({
        agent_name: Type.String({ description: 'OpenClaw agent name to hand off to' }),
        channel_name: Type.String({ description: 'Descriptive slug for the new work channel (lowercase, hyphens, e.g. "fix-login-bug")' }),
        background: Type.String({ description: 'Task description: what needs to be done, why, and relevant context' }),
        category_name: Type.Optional(Type.String({ description: 'Category to place the channel in. Defaults to "Projects".' })),
        extra_agents: Type.Optional(Type.Array(Type.String(), {
          description: 'Additional agent names to also configure for this channel',
        })),
      }),
      execute: async (_id, p: { agent_name: string; channel_name: string; background: string; category_name?: string; extra_agents?: string[] }) => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        const lines: string[] = [];
        const categoryName = p.category_name ?? 'Projects';

        // Step 1 — Find or create the category
        let category = guild.channels.cache.find(
          c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase(),
        ) as CategoryChannel | undefined;
        if (!category) {
          category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory }) as CategoryChannel;
          lines.push(`Created category "${categoryName}".`);
        }

        // Step 2 — Create the work channel
        const safeChannelName = p.channel_name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const workChannel = await guild.channels.create({
          name: safeChannelName,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: p.background.slice(0, 1024),
        }) as TextChannel;
        lines.push(`Created channel #${safeChannelName} (${workChannel.id}) in "${categoryName}"`);

        // Load all bindings once
        let allBindings: Array<{ agentId: string; match: { channel: string; accountId: string } }> = [];
        try {
          const { stdout } = await execFileAsync('openclaw', ['config', 'get', 'bindings'], { timeout: 10000, env: { ...process.env } });
          allBindings = JSON.parse(stdout);
        } catch { /* ignore — will fall back to global path */ }

        const getAccountId = (name: string): string | undefined => {
          const binding = allBindings.find(b => b.agentId === name && b.match?.channel === 'discord');
          return binding?.match?.accountId;
        };

        // Step 3 — Configure agents at channel level with autoThread:true
        const agentsToConfig = [p.agent_name, ...(p.extra_agents ?? [])];
        for (const agentName of agentsToConfig) {
          const accountId = getAccountId(agentName);
          if (!accountId) {
            lines.push(`⚠ No Discord binding for "${agentName}" — skipping config. Run agent creation flow first.`);
            continue;
          }
          const base = `channels.discord.accounts.${accountId}.guilds.${guild.id}.channels.${workChannel.id}`;
          try {
            await execFileAsync('openclaw', ['config', 'set', `${base}.allow`, 'true'], { timeout: 10000, env: { ...process.env } });
            await execFileAsync('openclaw', ['config', 'set', `${base}.requireMention`, 'false'], { timeout: 10000, env: { ...process.env } });
            await execFileAsync('openclaw', ['config', 'set', `${base}.autoThread`, 'true'], { timeout: 10000, env: { ...process.env } });
            lines.push(`✓ Agent "${agentName}" configured for #${safeChannelName} (autoThread on)`);
          } catch (err: any) {
            lines.push(`✗ Could not configure "${agentName}": ${err.message?.slice(0, 60)}`);
          }
        }

        // Step 4 — Post background + handoff note, then step back
        await workChannel.send(`📋 **Task**\n${p.background}`);
        const participants = agentsToConfig.join(', ');
        await workChannel.send(`_Handed off to ${participants}. @mention me if needed._`);
        lines.push(`Handed off. Conductor will not respond in #${safeChannelName} unless @mentioned.`);

        logger.info(`Handed off channel #${safeChannelName} to agent "${p.agent_name}"`);
        return ok(lines.join('\n'));
      },
    },

    {
      name: 'list_topics',
      label: 'List Open Topics',
      description: 'List all currently open topics (tracked threads)',
      parameters: Type.Object({}),
      execute: async (_id, _p, _s, _u) => {
        const topics = getAllOpenTopics();
        if (topics.length === 0) return ok('No open topics.');
        const lines = topics.map(t => {
          const age = Math.floor((Date.now() - t.created_at) / 3600000);
          return `• **${t.title}** — <#${t.thread_id}> (${age}h old, by ${t.created_by})`;
        });
        return ok(lines.join('\n'));
      },
    },

    {
      name: 'close_topic',
      label: 'Close Topic',
      description: 'Summarize and close (archive) a topic thread',
      parameters: Type.Object({
        thread_id: Type.String({ description: 'The thread ID to close' }),
      }),
      execute: async (_id, p, _s, _u) => {
        const params = p as { thread_id: string };
        const topic = getTopicByThread(params.thread_id);
        if (!topic) return ok(`No tracked topic for thread ${params.thread_id}.`);
        if (topic.status === 'closed') return ok(`Topic "${topic.title}" is already closed.`);

        const thread = guild.channels.cache.get(params.thread_id);
        if (!thread?.isThread()) return ok('Thread not found in guild.');

        const messages = await thread.messages.fetch({ limit: 100 });
        const sorted = messages
          .filter(m => !m.author.bot)
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map(m => ({ author: m.author.username, content: m.content }));

        const result = await summarizeThread(sorted);
        closeTopic(topic.id, result.summary);
        writeMemoryArtifact(process.env.MEMORY_ARTIFACTS_PATH ?? './data/memories/', topic, result);
        await thread.setArchived(true, 'Closed by conductor');

        logger.info(`Closed topic "${topic.title}"`);
        return ok(`Closed **${topic.title}**.\n\n**Summary:** ${result.summary}`);
      },
    },

    {
      name: 'rename_channel',
      label: 'Rename Channel',
      description: 'Rename an existing Discord channel',
      parameters: Type.Object({
        channel_id: Type.String({ description: 'Channel ID to rename' }),
        new_name: Type.String({ description: 'New channel name (lowercase, hyphens)' }),
      }),
      execute: async (_id, p: { channel_id: string; new_name: string }) => {
        const channel = guild.channels.cache.get(p.channel_id) as TextChannel | undefined;
        if (!channel) return ok(`Channel ${p.channel_id} not found.`);
        const oldName = channel.name;
        await channel.setName(p.new_name, 'Renamed by conductor');
        logger.info(`Renamed #${oldName} → #${p.new_name}`);
        return ok(`Renamed #${oldName} → #${p.new_name}`);
      },
    },

    {
      name: 'fetch_channel_messages',
      label: 'Fetch Channel Messages',
      description: 'Fetch recent messages from a channel for summarization. Returns up to 100 messages.',
      parameters: Type.Object({
        channel_id: Type.String({ description: 'Channel ID to fetch messages from' }),
        limit: Type.Optional(Type.Number({ description: 'Number of messages to fetch (max 100). Default 100.' })),
      }),
      execute: async (_id, p: { channel_id: string; limit?: number }) => {
        const channel = guild.channels.cache.get(p.channel_id) as TextChannel | undefined;
        if (!channel || channel.type !== ChannelType.GuildText) {
          return ok(`Channel ${p.channel_id} not found or is not a text channel.`);
        }
        const messages = await channel.messages.fetch({ limit: Math.min(p.limit ?? 100, 100) });
        const sorted = [...messages.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.username}: ${m.content}`)
          .filter(line => line.trim());
        return ok(sorted.join('\n') || '(no messages)');
      },
    },

    // ── remember_channel ─────────────────────────────────────────────────────
    {
      name: 'remember_channel',
      label: 'Remember Channel',
      description:
        'Fetch all messages from a channel, summarize them, and persist the memory appropriately. ' +
        'Auto-detects which OpenClaw agents participated (by matching bot usernames to agent names) and ' +
        'injects the full summary into those agents. Conductor saves only metadata (channel name, ID, ' +
        'timestamps, participants). If `agent_names` is provided it overrides auto-detection. ' +
        'Use before destroying a channel to preserve its history.',
      parameters: Type.Object({
        channel_id: Type.String({ description: 'Channel ID to remember' }),
        agent_names: Type.Optional(Type.Array(Type.String(), {
          description: 'Override: specific OpenClaw agent names to inject into. If omitted, auto-detected from bot participants.',
        })),
      }),
      execute: async (_id, p: { channel_id: string; agent_names?: string[] }) => {
        const channel = resolveMessageableChannel(guild, p.channel_id);
        if (!channel) return ok(`Channel/thread ${p.channel_id} not found or is not a text channel or thread.`);
        const lines = await rememberChannel(channel, p.agent_names);
        return ok(lines.join('\n'));
      },
    },

    // ── archive_session ───────────────────────────────────────────────────────
    // Saves memory + uses Discord-native archive (still visible in UI).
    // Thread: locked + archived. Channel: moved to "Archived" category + locked.
    {
      name: 'archive_session',
      label: 'Archive Session (Remember + Discord Archive)',
      description:
        'Archive a channel or thread: save memory to agents, then use Discord\'s native archive ' +
        '(channel is moved to an "Archived" category and locked; thread becomes locked/archived but still visible). ' +
        'The conversation remains BROWSABLE in Discord after this. ' +
        'Default target is a CHANNEL (work unit). Only assume thread if the user says "thread" explicitly. ' +
        'ALWAYS confirm with the user before calling — state whether you are archiving a channel or thread and get explicit approval.',
      parameters: Type.Object({
        target_id: Type.String({ description: 'Thread or channel ID to archive' }),
        agent_names: Type.Optional(Type.Array(Type.String(), {
          description: 'Override: OpenClaw agent names to inject into. If omitted, auto-detected.',
        })),
      }),
      execute: async (_id, p: { target_id: string; agent_names?: string[] }) => {
        const ch = resolveMessageableChannel(guild, p.target_id);
        if (!ch) return ok(`Thread/channel ${p.target_id} not found.`);

        const lines = await rememberChannel(ch, p.agent_names);

        if (ch.isThread()) {
          await ch.setLocked(true, 'Archived by conductor');
          await ch.setArchived(true, 'Archived by conductor');
          lines.push(`Thread #${ch.name} is now archived and locked (still visible in Discord).`);
          logger.info(`Archived thread #${ch.name}`);
        } else {
          // Move channel to "Archived" category (create if needed), then lock
          const textCh = ch as TextChannel;
          let archivedCat = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'archived',
          ) as CategoryChannel | undefined;
          if (!archivedCat) {
            archivedCat = await guild.channels.create({ name: 'Archived', type: ChannelType.GuildCategory }) as CategoryChannel;
            lines.push('Created "Archived" category.');
          }
          await textCh.setParent(archivedCat.id, { lockPermissions: false });
          await textCh.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
          lines.push(`Channel #${textCh.name} moved to Archived category and locked (still visible in Discord).`);
          logger.info(`Archived channel #${textCh.name}`);
        }

        return ok(lines.join('\n'));
      },
    },

    // ── end_session (remember + delete — gone forever) ────────────────────────
    {
      name: 'end_session',
      label: 'End Session (Remember + Delete — Permanent)',
      description:
        'PERMANENTLY end a session: save memory to agents, then DELETE the channel or thread. ' +
        'After this the conversation is GONE from Discord — not browsable, not recoverable. ' +
        'Default target is a CHANNEL (work unit). Only assume thread if the user says "thread" explicitly. ' +
        'ALWAYS confirm with the user before calling — explicitly state whether you are deleting a channel or thread, ' +
        'and do NOT proceed without the user\'s explicit approval. This is irreversible.',
      parameters: Type.Object({
        target_id: Type.String({ description: 'Thread or channel ID to permanently delete' }),
        agent_names: Type.Optional(Type.Array(Type.String(), {
          description: 'Override: OpenClaw agent names to inject into. If omitted, auto-detected.',
        })),
      }),
      execute: async (_id, p: { target_id: string; agent_names?: string[] }) => {
        const channel = resolveMessageableChannel(guild, p.target_id);
        if (!channel) return ok(`Thread/channel ${p.target_id} not found.`);

        const kind = channel.isThread() ? 'thread' : 'channel';
        const lines = await rememberChannel(channel, p.agent_names);

        const name = channel.name;
        await channel.delete('Session permanently ended by conductor');
        lines.push(`${kind === 'thread' ? 'Thread' : 'Channel'} #${name} deleted. This is permanent.`);
        logger.info(`Session permanently ended (deleted) ${kind} #${name}`);

        return ok(lines.join('\n'));
      },
    },

  ];
}
