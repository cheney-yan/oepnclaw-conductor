import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { Model } from '@mariozechner/pi-ai';
import { logger } from '../logger';

// ── YAML schema ───────────────────────────────────────────────────────────────

type ModelEntry = {
  id: string;
  nickname?: string;
  context_window?: number;
  max_tokens?: number;
};

type ProviderEntry = {
  id: string;
  base_url: string;
  api?: string;
  api_key_env?: string;
  api_key?: string;
  models?: ModelEntry[];
};

// model_chain is a list of nicknames or model ids
type ProvidersConfig = {
  providers: ProviderEntry[];
  model_chain: string[];
};

// ── Resolved model ────────────────────────────────────────────────────────────

export type ResolvedModel = Model<string> & { apiKey: string };

// ── Loader ────────────────────────────────────────────────────────────────────

function findProvidersFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'providers.yaml'),
    path.resolve(process.cwd(), 'providers.yml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveApiKey(entry: ProviderEntry): string {
  if (entry.api_key_env) {
    const val = process.env[entry.api_key_env];
    if (!val) logger.warn(`Provider "${entry.id}": env var ${entry.api_key_env} is not set`);
    return val ?? '';
  }
  if (entry.api_key) return entry.api_key;
  // Fall back to the global OPENAI_API_KEY
  return process.env.OPENAI_API_KEY ?? '';
}

export function loadModelChain(): ResolvedModel[] {
  const filePath = findProvidersFile();
  if (!filePath) {
    // Fall back to .env single-model setup
    return [buildEnvModel()];
  }

  let config: ProvidersConfig;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    config = yaml.load(raw) as ProvidersConfig;
  } catch (err: any) {
    logger.error(`Failed to load providers.yaml: ${err.message}`);
    return [buildEnvModel()];
  }

  if (!Array.isArray(config.providers) || !Array.isArray(config.model_chain)) {
    logger.error('providers.yaml: missing "providers" or "model_chain" array');
    return [buildEnvModel()];
  }

  const providerMap = new Map<string, ProviderEntry>(
    config.providers.map(p => [p.id, p]),
  );

  // Build flat lookup: nickname or id → { model, provider }
  type ModelLookup = { entry: ModelEntry; provider: ProviderEntry };
  const modelMap = new Map<string, ModelLookup>();
  for (const provider of config.providers) {
    for (const m of provider.models ?? []) {
      modelMap.set(m.id, { entry: m, provider });
      if (m.nickname) modelMap.set(m.nickname, { entry: m, provider });
    }
  }

  const chain: ResolvedModel[] = [];
  for (const ref of config.model_chain) {
    const found = modelMap.get(ref);
    if (!found) {
      logger.warn(`model_chain: "${ref}" not found in any provider models — skipping`);
      continue;
    }
    const { entry: m, provider } = found;
    chain.push({
      id: m.id,
      name: m.nickname ?? m.id,
      api: provider.api ?? 'openai-completions',
      provider: provider.id,
      baseUrl: provider.base_url,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.context_window ?? 128000,
      maxTokens: m.max_tokens ?? 4096,
      apiKey: resolveApiKey(provider),
    });
  }

  if (chain.length === 0) {
    logger.warn('providers.yaml: model_chain is empty — falling back to .env');
    return [buildEnvModel()];
  }

  logger.info(`Loaded ${chain.length} model(s) from providers.yaml: ${chain.map(m => m.id).join(', ')}`);
  return chain;
}

function buildEnvModel(): ResolvedModel {
  const modelId = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    apiKey: process.env.OPENAI_API_KEY ?? '',
  };
}
