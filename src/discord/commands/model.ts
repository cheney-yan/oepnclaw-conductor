import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import type { SlashCommand } from './types';
import { getActiveModelInfo, switchToModel, listChainModels } from '../../agent/conductor-agent';

export const modelCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('model')
    .setDescription('Show or switch the active AI model')
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Model nickname or id to switch to (omit to show status)')
        .setRequired(false)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');

    if (name) {
      // Switch
      const model = switchToModel(name);
      if (!model) {
        const chain = listChainModels();
        const available = chain.map(m => `\`${m.name}\``).join(', ');
        await interaction.editReply(`❌ Model \`${name}\` not found in chain.\nAvailable: ${available}`);
        return;
      }
      await interaction.editReply(`✅ Switched to **${model.name}** (\`${model.id}\`)`);
      return;
    }

    // Show status
    const info = getActiveModelInfo();
    const chain = listChainModels();

    const embed = new EmbedBuilder()
      .setTitle('Model Chain')
      .setColor(Colors.Blurple)
      .setTimestamp();

    const lines = chain.map((m, i) => {
      const active = i === info?.index;
      const marker = active ? '▶ ' : '  ';
      const cooldown = active && info!.retryAfterTime > Date.now()
        ? ` _(cooldown until ${new Date(info!.retryAfterTime).toLocaleTimeString()})_`
        : '';
      return `${marker}**${m.name}** — \`${m.id}\`${cooldown}`;
    });

    embed.setDescription(lines.join('\n') || 'No models configured.');

    if (info) {
      embed.setFooter({ text: `Active: ${info.model.name} · Use /model <name> to switch` });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
