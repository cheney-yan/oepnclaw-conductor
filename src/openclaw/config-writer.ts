import fs from 'fs';
import path from 'path';
import { OpenClawConfig, OpenClawChannelConfig, readOpenClawConfig } from './config-reader';

function backupConfig(configPath: string): string {
  const resolved = path.resolve(configPath);
  const backup = `${resolved}.bak.${Date.now()}`;
  fs.copyFileSync(resolved, backup);
  return backup;
}

function writeConfig(configPath: string, config: OpenClawConfig): void {
  const resolved = path.resolve(configPath);
  fs.writeFileSync(resolved, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function setDiscordChannel(
  configPath: string,
  channelId: string,
  settings: OpenClawChannelConfig
): string {
  const config = readOpenClawConfig(configPath);
  const backup = backupConfig(configPath);

  if (!config.channels) config.channels = {};
  if (!config.channels.discord) {
    config.channels.discord = { enabled: true, channels: {} };
  }
  config.channels.discord.channels[channelId] = settings;

  writeConfig(configPath, config);
  return backup;
}

export function setDiscordEnabled(configPath: string, enabled: boolean): string {
  const config = readOpenClawConfig(configPath);
  const backup = backupConfig(configPath);

  if (!config.channels) config.channels = {};
  if (!config.channels.discord) {
    config.channels.discord = { enabled, channels: {} };
  } else {
    config.channels.discord.enabled = enabled;
  }

  writeConfig(configPath, config);
  return backup;
}

export function removeDiscordChannel(configPath: string, channelId: string): string {
  const config = readOpenClawConfig(configPath);
  const backup = backupConfig(configPath);

  if (config.channels?.discord?.channels) {
    delete config.channels.discord.channels[channelId];
  }

  writeConfig(configPath, config);
  return backup;
}
