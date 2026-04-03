import { Events, Client } from 'discord.js';
import { logger } from '../../logger';

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, (c) => {
    logger.info(`Discord connected — logged in as ${c.user.tag} (${c.user.id})`);
    logger.info(`Serving ${c.guilds.cache.size} guild(s):`);
    c.guilds.cache.forEach(g => logger.info(`  → guild: ${g.name} (${g.id})`));
  });

  // Log every raw gateway packet — if nothing shows here, WebSocket is dead
  client.on('raw', (packet: { t: string }) => {
    if (packet.t) logger.debug(`RAW: ${packet.t}`);
  });
}
