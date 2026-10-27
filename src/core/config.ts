// The configuration of the tool itself (librarian-os.config.json), not of a repository.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIBRARIAN_DIR = fileURLToPath(new URL('../../', import.meta.url));

export interface ProviderConfig {
  label: string;
  apiKeyEnv: string;
  models: { id: string; label?: string }[];
}

export interface ToolConfig {
  port: number;
  host: string;
  /** Absolute path where cloned repositories and repos.json are kept. */
  dataDir: string;
  configPath: string;
  git: { pullOnSwitch: boolean; pullCooldownSeconds: number };
  ai: { enabled: boolean; default: { provider: string; model: string }; maxQuestions: number; providers: Record<string, ProviderConfig> };
}

export function loadToolConfig(dir = LIBRARIAN_DIR): ToolConfig {
  const configPath = resolve(dir, 'librarian-os.config.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Omit<ToolConfig, 'dataDir' | 'configPath'> & { dataDir: string };
  const local = resolve(dir, 'librarian-os.config.local.json');
  // A local file (ignored by git) may override single keys, for example the port or the model lists.
  const merged = existsSync(local) ? deepMerge(raw as unknown as Record<string, unknown>, JSON.parse(readFileSync(local, 'utf8')) as Record<string, unknown>) : (raw as unknown as Record<string, unknown>);
  const cfg = merged as unknown as typeof raw;
  return { ...cfg, port: Number(process.env.PORT ?? cfg.port), dataDir: resolve(dir, cfg.dataDir), configPath };
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur) ? deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}
