import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export interface OpenClawChannelConfig {
  allow: boolean;
  requireMention?: boolean;
}

export interface OpenClawDiscordConfig {
  mode?: string;
  enabled: boolean;
  botToken?: string;
  channels: Record<string, OpenClawChannelConfig>;
}

export interface OpenClawSlackConfig {
  mode?: string;
  enabled: boolean;
  botToken?: string;
  appToken?: string;
  channels: Record<string, OpenClawChannelConfig>;
}

export interface OpenClawModelProvider {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models?: string[];
}

export interface OpenClawConfig {
  models?: Record<string, OpenClawModelProvider>;
  agents?: {
    defaults?: {
      model?: { primary?: string; fallbacks?: string[] };
      workspace?: string;
    };
    maxConcurrent?: number;
    subagents?: { maxConcurrent?: number };
  };
  channels?: {
    slack?: OpenClawSlackConfig;
    discord?: OpenClawDiscordConfig;
  };
  tools?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  gateway?: { mode?: string };
}

export function readOpenClawConfig(configPath: string): OpenClawConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`openclaw.json not found at: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  return JSON.parse(raw) as OpenClawConfig;
}

export function readOpenClawEnv(envPath: string): Record<string, string> {
  const resolved = path.resolve(envPath);
  if (!fs.existsSync(resolved)) {
    return {};
  }
  const result = dotenv.config({ path: resolved });
  return result.parsed ?? {};
}
