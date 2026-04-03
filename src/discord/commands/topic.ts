import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ThreadChannel,
  ChannelType,
  Colors,
} from 'discord.js';
import type { SlashCommand } from './types';
import {
  createTopic,
  getTopicByThread,
  closeTopic,
} from '../../lifecycle/topic-manager';
import { summarizeThread } from '../../lifecycle/summarizer';
import { writeMemoryArtifact } from '../../lifecycle/memory-store';

const artifactsDir = process.env.MEMORY_ARTIFACTS_PATH ?? './data/memories/';

async function fetchThreadMessages(thread: ThreadChannel) {
  const messages = await thread.messages.fetch({ limit: 100 });
  return messages
    .filter((m) => !m.author.bot)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((m) => ({ author: m.author.username, content: m.content }));
}

export const topicCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('topic')
    .setDescription('Manage work topics (threads)')
    .addSubcommand((sub) =>
      sub
        .setName('new')
        .setDescription('Open a new topic (creates a private thread)')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Short title for this topic').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('summarize').setDescription('Summarize the current topic thread')
    )
    .addSubcommand((sub) =>
      sub.setName('close').setDescription('Summarize and close (archive) the current topic thread')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'new') {
      const title = interaction.options.getString('title', true);
      const channel = interaction.channel;

      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: 'Topics can only be created in a text channel.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const thread = await channel.threads.create({
        name: `[Topic] ${title}`,
        autoArchiveDuration: 10080, // 7 days
        reason: `Conductor topic: ${title}`,
      });

      const topic = createTopic(title, channel.id, thread.id, interaction.user.username);

      const embed = new EmbedBuilder()
        .setTitle(`Topic: ${title}`)
        .setDescription(
          `Thread created: ${thread.toString()}\n\n` +
          `Use \`/topic summarize\` inside the thread to summarize at any time.\n` +
          `Use \`/topic close\` to summarize and close when the work is done.`
        )
        .setColor(Colors.Green)
        .setFooter({ text: `Topic ID: ${topic.id}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Topic opened: ${title}`)
            .setDescription(`Created by **${interaction.user.username}**\n\nWork in this thread. Use \`/topic close\` when done.`)
            .setColor(Colors.Blue)
            .setFooter({ text: `ID: ${topic.id}` })
            .setTimestamp(),
        ],
      });
      return;
    }

    // summarize and close require being inside a topic thread
    const thread = interaction.channel;
    if (!thread || thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
      await interaction.reply({ content: 'Run this command inside a topic thread.', ephemeral: true });
      return;
    }

    const topic = getTopicByThread(thread.id);
    if (!topic) {
      await interaction.reply({ content: 'This thread is not a tracked topic.', ephemeral: true });
      return;
    }

    if (sub === 'summarize') {
      await interaction.deferReply();
      const messages = await fetchThreadMessages(thread as ThreadChannel);
      const result = await summarizeThread(messages);

      const embed = new EmbedBuilder()
        .setTitle('Thread Summary')
        .setDescription(result.summary)
        .addFields(
          { name: 'Decisions', value: result.memory.decisions.join('\n') || '—', inline: false },
          { name: 'Tasks Completed', value: result.memory.tasks_done.join('\n') || '—', inline: false },
          { name: 'Open Items', value: result.memory.open_items.join('\n') || '—', inline: false },
          { name: 'Key Info', value: result.memory.key_info.join('\n') || '—', inline: false }
        )
        .setColor(Colors.Yellow)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'close') {
      if (topic.status === 'closed') {
        await interaction.reply({ content: 'This topic is already closed.', ephemeral: true });
        return;
      }

      await interaction.deferReply();
      const messages = await fetchThreadMessages(thread as ThreadChannel);
      const result = await summarizeThread(messages);

      closeTopic(topic.id, result.summary);
      writeMemoryArtifact(artifactsDir, { ...topic, status: 'closed' }, result);

      const embed = new EmbedBuilder()
        .setTitle('Topic Closed')
        .setDescription(result.summary)
        .addFields(
          { name: 'Decisions', value: result.memory.decisions.join('\n') || '—', inline: false },
          { name: 'Tasks Completed', value: result.memory.tasks_done.join('\n') || '—', inline: false },
          { name: 'Open Items', value: result.memory.open_items.join('\n') || '—', inline: false },
          { name: 'Key Info', value: result.memory.key_info.join('\n') || '—', inline: false }
        )
        .setColor(Colors.Red)
        .setFooter({ text: `Use /memory show to inspect what was captured. Topic ID: ${topic.id}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await (thread as ThreadChannel).setArchived(true, 'Topic closed by conductor');
    }
  },
};
