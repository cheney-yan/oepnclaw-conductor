import { REST, Routes } from 'discord.js';
import { logger } from '../logger';
import { topicCommand } from '../discord/commands/topic';
import { memoryCommand } from '../discord/commands/memory';
import { statusCommand } from '../discord/commands/status';
import { openclawCommand } from '../discord/commands/openclaw';
import { setupCommand } from '../discord/commands/setup';
import { modelCommand } from '../discord/commands/model';

const COMMANDS = [
  topicCommand.data.toJSON(),
  memoryCommand.data.toJSON(),
  statusCommand.data.toJSON(),
  openclawCommand.data.toJSON(),
  setupCommand.data.toJSON(),
  modelCommand.data.toJSON(),
];

export interface BootstrapResult {
  clientId: string;
  guildId: string | null;
}

export async function bootstrap(token: string): Promise<BootstrapResult> {
  const rest = new REST().setToken(token);

  // Auto-detect client ID from token
  logger.info('Detecting application ID...');
  const app = await rest.get(Routes.oauth2CurrentApplication()) as { id: string };
  const clientId = app.id;
  logger.info(`Application ID: ${clientId}`);

  // Use env guild if set, otherwise register globally
  const guildId = process.env.DISCORD_GUILD_ID?.trim() || null;

  // Auto-register slash commands
  logger.info('Registering slash commands...');
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: COMMANDS });
    logger.info(`Commands registered to guild ${guildId} (instant)`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: COMMANDS });
    logger.info('Commands registered globally (~1h propagation)');
  }

  return { clientId, guildId };
}
