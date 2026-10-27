import type { ProviderInfo } from '../../shared/types';
import { state } from '../state';
import { readJson, writeJson } from './storage';

const KEY = 'librarian.ai.v1';
export interface Choice { provider: string; model: string }

/** The provider and model the user picked, repaired against what the server currently offers. */
export function getChoice(): Choice {
  const saved = readJson<Partial<Choice>>(KEY, {});
  const providers = state.app.ai.providers;
  const hasModels = (p: ProviderInfo | undefined): p is ProviderInfo => Boolean(p && p.models.length > 0);
  const ready = (p: ProviderInfo | undefined): p is ProviderInfo => hasModels(p) && p.keyPresent;
  const savedP = providers.find((p) => p.id === saved.provider);
  const defaultP = providers.find((p) => p.id === state.app.ai.default.provider);
  // Prefer a provider that can actually be used: the saved one, then the default, then any with a key.
  const provider = [savedP, defaultP, ...providers].find(ready) ?? [savedP, defaultP, ...providers].find(hasModels);
  if (!provider) return { provider: '', model: '' };
  const fromSaved = provider.id === saved.provider && provider.models.some((m) => m.id === saved.model) ? saved.model : undefined;
  const fromDefault = provider.id === state.app.ai.default.provider && provider.models.some((m) => m.id === state.app.ai.default.model) ? state.app.ai.default.model : undefined;
  return { provider: provider.id, model: fromSaved ?? fromDefault ?? provider.models[0]?.id ?? '' };
}

export function setChoice(choice: Choice): void {
  writeJson(KEY, choice);
  document.dispatchEvent(new CustomEvent('aichange'));
}

export function readyProviders(): ProviderInfo[] {
  return state.app.ai.enabled ? state.app.ai.providers.filter((p) => p.keyPresent) : [];
}
