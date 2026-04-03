import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import type { SlashCommand } from './types';

const STEPS = [
  {
    title: 'Step 1: Create a Discord Application',
    description:
      '1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)\n' +
      '2. Click **New Application**\n' +
      '3. Give it a name (e.g. `openclaw-conductor`)\n' +
      '4. Copy the **Application ID** → this is your `DISCORD_CLIENT_ID`',
    color: Colors.Blue,
  },
  {
    title: 'Step 2: Create the Bot User',
    description:
      '1. In your application, go to the **Bot** tab\n' +
      '2. Click **Add Bot**\n' +
      '3. Under **Privileged Gateway Intents**, enable:\n' +
      '   - **Message Content Intent**\n' +
      '4. Click **Reset Token** → copy the token → this is your `DISCORD_BOT_TOKEN`\n\n' +
      '⚠️ Keep this token secret. Never commit it to git.',
    color: Colors.Orange,
  },
  {
    title: 'Step 3: Invite the Bot to Your Server',
    description:
      '1. Go to **OAuth2 → URL Generator**\n' +
      '2. Select scopes: `bot`, `applications.commands`\n' +
      '3. Select bot permissions:\n' +
      '   - Manage Channels\n' +
      '   - Manage Threads\n' +
      '   - Send Messages\n' +
      '   - Read Message History\n' +
      '   - Embed Links\n' +
      '   - Attach Files\n' +
      '4. Copy the generated URL and open it in your browser\n' +
      '5. Select your server and click **Authorize**',
    color: Colors.Green,
  },
  {
    title: 'Step 4: Configure Your .env',
    description:
      '1. Copy `.env.example` to `.env`\n' +
      '2. Fill in:\n' +
      '   ```\n' +
      '   DISCORD_BOT_TOKEN=<your token>\n' +
      '   DISCORD_CLIENT_ID=<your app id>\n' +
      '   ANTHROPIC_API_KEY=<your anthropic key>\n' +
      '   OPENCLAW_CONFIG_PATH=<path to openclaw.json>\n' +
      '   ```\n' +
      '3. Run `npm run register` to deploy slash commands\n' +
      '4. Run `npm start` — bot should show **Online** in Discord',
    color: Colors.Purple,
  },
];

export const setupCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Step-by-step guide to set up openclaw-conductor'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const embeds = STEPS.map((step) =>
      new EmbedBuilder()
        .setTitle(step.title)
        .setDescription(step.description)
        .setColor(step.color)
    );

    embeds.push(
      new EmbedBuilder()
        .setTitle('Setup Complete!')
        .setDescription(
          'Once your bot is online:\n\n' +
          '- `/topic new <title>` — open a new work thread\n' +
          '- `/topic close` — summarize and close the thread\n' +
          '- `/memory show` — inspect what memory was captured\n' +
          '- `/status` — list all open topics\n' +
          '- `/openclaw status` — view your OpenClaw configuration'
        )
        .setColor(Colors.Green)
    );

    await interaction.editReply({ embeds });
  },
};
