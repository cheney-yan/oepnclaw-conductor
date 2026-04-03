import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import type { SlashCommand } from './types';
import { getAllOpenTopics } from '../../lifecycle/topic-manager';

function ageString(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'less than an hour';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export const statusCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('List all open topics'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const topics = getAllOpenTopics();

    if (topics.length === 0) {
      await interaction.editReply('No open topics.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Open Topics (${topics.length})`)
      .setColor(Colors.Blue)
      .setTimestamp();

    for (const topic of topics.slice(0, 25)) {
      embed.addFields({
        name: topic.title,
        value: `<#${topic.thread_id}> · Age: ${ageString(topic.created_at)} · By: ${topic.created_by}`,
        inline: false,
      });
    }

    if (topics.length > 25) {
      embed.setFooter({ text: `Showing 25 of ${topics.length} open topics` });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
