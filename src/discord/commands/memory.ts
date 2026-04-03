import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from 'discord.js';
import type { SlashCommand } from './types';
import { getTopicById, getLastClosedTopicByChannel } from '../../lifecycle/topic-manager';
import { readMemoryArtifact } from '../../lifecycle/memory-store';

const artifactsDir = process.env.MEMORY_ARTIFACTS_PATH ?? './data/memories/';

export const memoryCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Inspect the memory captured from a closed topic')
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show the memory artifact from a topic')
        .addStringOption((opt) =>
          opt
            .setName('topic_id')
            .setDescription('Topic ID (leave empty for the most recently closed topic in this channel)')
            .setRequired(false)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const topicId = interaction.options.getString('topic_id');

    let topic;
    if (topicId) {
      topic = getTopicById(topicId);
      if (!topic) {
        await interaction.editReply(`No topic found with ID \`${topicId}\`.`);
        return;
      }
    } else {
      topic = getLastClosedTopicByChannel(interaction.channelId);
      if (!topic) {
        await interaction.editReply('No closed topics found in this channel.');
        return;
      }
    }

    const content = readMemoryArtifact(artifactsDir, topic.id);
    if (!content) {
      await interaction.editReply(
        `Memory artifact not found for topic \`${topic.id}\`. It may not have been closed via \`/topic close\`.`
      );
      return;
    }

    // Post the first 1900 chars inline and attach the full Markdown file
    const preview = content.slice(0, 1900);
    const attachment = new AttachmentBuilder(Buffer.from(content, 'utf-8'), {
      name: `memory-${topic.id}.md`,
    });

    await interaction.editReply({ content: `\`\`\`md\n${preview}\n\`\`\``, files: [attachment] });
  },
};
