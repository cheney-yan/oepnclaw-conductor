import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import type { SlashCommand } from './commands/types';

export interface ConductorClient extends Client {
  commands: Collection<string, SlashCommand>;
}

export function createClient(): ConductorClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
    ],
    // Required for DMs and uncached channels/messages to fire MessageCreate
    partials: [Partials.Channel, Partials.Message],
  }) as ConductorClient;

  client.commands = new Collection<string, SlashCommand>();
  return client;
}
