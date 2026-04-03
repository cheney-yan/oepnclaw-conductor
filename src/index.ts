import dotenv from 'dotenv';
dotenv.config();

import { logger } from './logger';
import { createClient } from './discord/client';
import { registerReadyEvent } from './discord/events/ready';
import { registerInteractionEvent } from './discord/events/interaction';
import { topicCommand } from './discord/commands/topic';
import { memoryCommand } from './discord/commands/memory';
import { statusCommand } from './discord/commands/status';
import { openclawCommand } from './discord/commands/openclaw';
import { setupCommand } from './discord/commands/setup';
import { modelCommand } from './discord/commands/model';
import { bootstrap } from './init/bootstrap';
import { ensureSnapshotRepo } from './agent/snapshot-store';

const IS_DEV = process.env.NODE_ENV !== 'production';

logger.info(`openclaw-conductor starting (${IS_DEV ? 'dev' : 'production'})`);

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  logger.error('DISCORD_BOT_TOKEN is not set. Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

ensureSnapshotRepo();

const client = createClient();

for (const cmd of [topicCommand, memoryCommand, statusCommand, openclawCommand, setupCommand, modelCommand]) {
  client.commands.set(cmd.data.name, cmd);
}
logger.info(`Loaded ${client.commands.size} commands: ${[...client.commands.keys()].join(', ')}`);

registerReadyEvent(client);
registerInteractionEvent(client);

// Auto-detect client ID + register commands, then login
bootstrap(token)
  .then(() => client.login(token))
  .catch(err => {
    logger.error(`Bootstrap failed: ${(err as Error).message}`);
    process.exit(1);
  });
