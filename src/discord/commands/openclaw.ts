import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import type { SlashCommand } from './types';
import { readOpenClawConfig } from '../../openclaw/config-reader';
import { setDiscordChannel, removeDiscordChannel } from '../../openclaw/config-writer';
import path from 'path';

function getConfigPath(): string {
  const root = process.env.OPENCLAW_ROOT;
  if (!root) throw new Error('OPENCLAW_ROOT is not set in .env');
  return path.join(root, 'openclaw.json');
}

export const openclawCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('openclaw')
    .setDescription('Inspect and manage your OpenClaw configuration')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Show current OpenClaw config: bots, channels, model')
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-channel')
        .setDescription('Add or update a Discord channel in openclaw.json')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('The Discord channel to configure').setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt.setName('allow').setDescription('Allow OpenClaw bot in this channel').setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt.setName('require_mention').setDescription('Require @mention to respond').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-channel')
        .setDescription('Remove a Discord channel from openclaw.json')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('The channel to remove').setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      await interaction.deferReply({ ephemeral: true });

      let config;
      try {
        config = readOpenClawConfig(getConfigPath());
      } catch (err) {
        await interaction.editReply(`Failed to read openclaw.json: ${(err as Error).message}`);
        return;
      }

      const primaryModel = config.agents?.defaults?.model?.primary ?? '(not set)';
      const maxConcurrent = config.agents?.maxConcurrent ?? '(not set)';
      const workspace = config.agents?.defaults?.workspace ?? '(not set)';
      const discordEnabled = config.channels?.discord?.enabled ?? false;
      const discordChannels = config.channels?.discord?.channels ?? {};
      const slackEnabled = config.channels?.slack?.enabled ?? false;

      const embed = new EmbedBuilder()
        .setTitle('OpenClaw Configuration')
        .setColor(Colors.Orange)
        .addFields(
          { name: 'Primary Model', value: primaryModel, inline: true },
          { name: 'Max Concurrent Agents', value: String(maxConcurrent), inline: true },
          { name: 'Workspace', value: workspace, inline: false },
          { name: 'Discord Integration', value: discordEnabled ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Slack Integration', value: slackEnabled ? 'Enabled' : 'Disabled', inline: true },
        );

      const channelList = Object.entries(discordChannels)
        .map(([id, cfg]) => `<#${id}> — allow: ${cfg.allow}, mention: ${cfg.requireMention ?? false}`)
        .join('\n');

      if (channelList) {
        embed.addFields({ name: 'Discord Channels', value: channelList, inline: false });
      }

      const configFile = path.resolve(getConfigPath());
      embed.setFooter({ text: configFile });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel', true);
      const allow = interaction.options.getBoolean('allow', true);
      const requireMention = interaction.options.getBoolean('require_mention') ?? false;

      await interaction.deferReply({ ephemeral: true });

      try {
        const backup = setDiscordChannel(getConfigPath(), channel.id, { allow, requireMention });
        await interaction.editReply(
          `Channel ${channel.toString()} updated in openclaw.json.\nBackup saved to: \`${backup}\``
        );
      } catch (err) {
        await interaction.editReply(`Failed to update config: ${(err as Error).message}`);
      }
      return;
    }

    if (sub === 'remove-channel') {
      const channel = interaction.options.getChannel('channel', true);
      await interaction.deferReply({ ephemeral: true });

      try {
        const backup = removeDiscordChannel(getConfigPath(), channel.id);
        await interaction.editReply(
          `Channel ${channel.toString()} removed from openclaw.json.\nBackup saved to: \`${backup}\``
        );
      } catch (err) {
        await interaction.editReply(`Failed to update config: ${(err as Error).message}`);
      }
    }
  },
};
