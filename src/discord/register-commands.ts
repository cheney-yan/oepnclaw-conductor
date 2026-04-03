import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { topicCommand } from './commands/topic';
import { memoryCommand } from './commands/memory';
import { statusCommand } from './commands/status';
import { openclawCommand } from './commands/openclaw';
import { setupCommand } from './commands/setup';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

const commands = [
  topicCommand.data.toJSON(),
  memoryCommand.data.toJSON(),
  statusCommand.data.toJSON(),
  openclawCommand.data.toJSON(),
  setupCommand.data.toJSON(),
];

const rest = new REST().setToken(token);

(async () => {
  console.log(`Registering ${commands.length} slash commands...`);

  if (guildId) {
    // Guild-scoped: instant propagation (dev)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Commands registered to guild ${guildId}`);
  } else {
    // Global: ~1 hour propagation
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Commands registered globally');
  }
})();
