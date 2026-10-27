import type { ToolConfig } from '../../core/config';
import type { ProviderInfo } from '../../shared/types';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';
import type { AIProvider } from './provider';

const FACTORIES: Record<string, (model: string, key: string) => AIProvider> = {
  anthropic: (m, k) => new AnthropicProvider(m, k),
  openai: (m, k) => new OpenAIProvider(m, k),
  gemini: (m, k) => new GeminiProvider(m, k),
};

export function providerInfos(cfg: ToolConfig, env: NodeJS.ProcessEnv = process.env): ProviderInfo[] {
  return Object.entries(cfg.ai.providers).map(([id, p]) => ({
    id,
    label: p.label,
    apiKeyEnv: p.apiKeyEnv,
    keyPresent: Boolean(env[p.apiKeyEnv]) && id in FACTORIES,
    models: p.models.map((m) => ({ id: m.id, label: m.label ?? m.id })),
  }));
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Pick the provider and model for one request. Only configured providers, models and present keys are accepted. */
export function pickProvider(cfg: ToolConfig, requested: { provider?: string; model?: string }, env: NodeJS.ProcessEnv = process.env): AIProvider {
  if (!cfg.ai.enabled) throw new AiError('AI is switched off in librarian-os.config.json.', 503);
  const id = requested.provider ?? cfg.ai.default.provider;
  const conf = cfg.ai.providers[id];
  const make = FACTORIES[id];
  if (!conf || !make) throw new AiError(`Unknown provider "${id}".`);
  const model = requested.model ?? (id === cfg.ai.default.provider ? cfg.ai.default.model : conf.models[0]?.id);
  if (!model || !conf.models.some((m) => m.id === model)) throw new AiError(`Model "${model ?? ''}" is not configured for ${conf.label}.`);
  const key = env[conf.apiKeyEnv];
  if (!key) throw new AiError(`Set ${conf.apiKeyEnv} in the environment of the server to use ${conf.label}.`, 503);
  return make(model, key);
}
