import type { ProviderInfo, RepoInfo } from '../../shared/types';
import { addRepo, removeRepo } from '../api';
import { h, toast } from '../dom';
import { navigate } from '../router';
import { state } from '../state';
import { getChoice, setChoice } from '../store/ai';

export interface SettingsActions {
  /** Called after repositories were added or removed, so the switcher and the app state are refreshed. */
  refreshRepos: () => Promise<void>;
  /** Pull (when possible) and reload one repository. Reloads the open view when it is the current one. */
  refreshRepo: (id: string) => Promise<void>;
}

export function showSettings(main: HTMLElement, actions: SettingsActions): void {
  document.title = 'Settings - Librarian OS';
  const page = h('div', { class: 'page settings' }, h('h1', null, 'Settings'), h('p', { class: 'lead' }, 'Provider and model choices are kept in this browser. Keys are read by the server from its environment and are never shown or sent to the browser.'));

  const tabs: [string, string][] = [['ai', 'AI providers'], ['repos', 'Repositories'], ['about', 'About']];
  let active = new URLSearchParams(location.search).get('tab') ?? 'ai';
  if (!tabs.some(([id]) => id === active)) active = 'ai';
  const body = h('div', { class: 'tab-body' });
  const bar = h('div', { class: 'panel-tabs settings-tabs', role: 'tablist' });

  const draw = (): void => {
    bar.replaceChildren(...tabs.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === active), onclick: () => { active = id; history.replaceState(null, '', `/settings?tab=${id}`); draw(); } }, label)));
    body.replaceChildren(active === 'ai' ? aiTab() : active === 'repos' ? reposTab(actions, draw) : aboutTab());
  };
  page.append(bar, body);
  main.replaceChildren(page);
  main.scrollTop = 0;
  draw();
}

function aiTab(): HTMLElement {
  const ai = state.app.ai;
  const choice = getChoice();
  const wrap = h('div');
  wrap.append(h('p', null, ai.enabled ? 'Question generation is on.' : 'Question generation is switched off (ai.enabled is false in the server configuration).'),
    h('p', { class: 'rel-note' }, 'Configuration file: ', h('code', null, state.app.configPath), '. Add models there or in librarian-os.config.local.json, then restart the server.'));
  const render = (): void => {
    const current = getChoice();
    wrap.querySelectorAll('.provider').forEach((n) => n.remove());
    for (const p of ai.providers) wrap.append(providerCard(p, current.provider === p.id ? current.model : undefined, render));
  };
  void choice;
  render();
  return wrap;
}

function providerCard(p: ProviderInfo, selectedModel: string | undefined, rerender: () => void): HTMLElement {
  const active = selectedModel !== undefined;
  const select = h('select', { 'aria-label': `${p.label} model`, disabled: !p.keyPresent || p.models.length === 0 }, ...p.models.map((m) => h('option', { value: m.id, selected: m.id === (selectedModel ?? getChoice().model) }, m.label === m.id ? m.id : `${m.label} (${m.id})`)));
  select.addEventListener('change', () => { setChoice({ provider: p.id, model: select.value }); rerender(); });
  const use = h('button', { class: 'btn', type: 'button', disabled: !p.keyPresent || active, onclick: () => { setChoice({ provider: p.id, model: p.models.some((m) => m.id === select.value) ? select.value : (p.models[0]?.id ?? '') }); rerender(); } }, active ? 'In use' : 'Use this provider');
  return h('section', { class: `provider card-like${active ? ' is-active' : ''}` },
    h('h3', null, p.label, ' ', h('span', { class: `chip ${p.keyPresent ? 'ok' : 'warn'}` }, p.keyPresent ? 'key found' : 'no key')),
    h('dl', null, h('dt', null, 'Environment variable'), h('dd', null, h('code', null, p.apiKeyEnv)),
      h('dt', null, 'Models'), h('dd', null, p.models.length ? p.models.map((m) => m.id).join(', ') : 'none configured'),
      h('dt', null, 'Model for questions'), h('dd', null, select)),
    h('div', null, use), !p.keyPresent && h('p', { class: 'rel-note' }, `Start the server with ${p.apiKeyEnv} set, for example: export ${p.apiKeyEnv}=<API_KEY>`));
}

function reposTab(actions: SettingsActions, redraw: () => void): HTMLElement {
  const list = h('div', { class: 'repo-list' });
  const fill = (): void => {
    list.replaceChildren(...(state.app.repos.length ? state.app.repos.map((r) => repoRow(r, actions, redraw)) : [h('p', { class: 'empty' }, 'No repositories yet. Add one below.')]));
  };
  fill();
  const input = h('input', { type: 'text', placeholder: '/absolute/path/to/repository  or  https://github.com/owner/repository', 'aria-label': 'Repository path or URL', style: 'width:100%' });
  const button = h('button', { class: 'btn primary', type: 'button' }, 'Add repository');
  button.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) return;
    button.disabled = true;
    button.textContent = /^(https:|ssh:|git@)/.test(value) ? 'Cloning...' : 'Adding...';
    try {
      const info = await addRepo(/^(https:|ssh:|git@)/.test(value) ? { url: value } : { path: value });
      await actions.refreshRepos();
      toast(`Added ${info.name}`);
      input.value = '';
      navigate(`/r/${info.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add the repository');
    } finally {
      button.disabled = false;
      button.textContent = 'Add repository';
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') button.click(); });
  return h('div', null, list, h('h3', null, 'Add a repository'),
    h('p', { class: 'rel-note' }, 'A repository needs a librarian-os.json at its root (see INSTRUCTIONS.md). A URL is cloned (shallow) into the server data directory and the copy is registered. A local path is used in place.'),
    h('div', { class: 'add-row' }, input, button));
}

function repoRow(r: RepoInfo, actions: SettingsActions, redraw: () => void): HTMLElement {
  return h('section', { class: `provider card-like${r.id === state.repoId ? ' is-active' : ''}` },
    h('h3', null, r.name, ' ', r.id === state.repoId && h('span', { class: 'chip ok' }, 'open'), !r.ok && h('span', { class: 'chip warn' }, 'problem')),
    r.description && h('p', null, r.description),
    h('dl', null, h('dt', null, 'Location'), h('dd', null, h('code', null, r.path)), h('dt', null, 'Source'), h('dd', null, r.source === 'git' ? `git clone of ${r.url ?? ''}` : 'local directory'), r.error && h('dt', null, 'Problem'), r.error && h('dd', null, r.error)),
    h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' }, r.ok && h('a', { class: 'btn', href: `/r/${r.id}` }, 'Open'),
      h('button', { class: 'btn', type: 'button', title: r.canPull ? 'git pull --ff-only, then reload from disk' : 'Reload from disk', onclick: async (e: Event) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; b.textContent = 'Working...'; try { await actions.refreshRepo(r.id); } finally { redraw(); } } }, r.canPull ? 'Pull and refresh' : 'Refresh'),
      h('button', { class: 'btn ghost', type: 'button', title: 'Forget this repository. Files stay on disk.', onclick: async () => { try { await removeRepo(r.id); await actions.refreshRepos(); redraw(); if (r.id === state.repoId) navigate('/'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not remove'); } } }, 'Remove from list')));
}

function aboutTab(): HTMLElement {
  return h('div', null, h('dl', null, h('dt', null, 'Librarian OS'), h('dd', null, `version ${state.app.version}`), h('dt', null, 'Made by'), h('dd', null, h('a', { href: 'https://japonics.io', target: '_blank', rel: 'noopener noreferrer' }, 'Japonics')),
    h('dt', null, 'Shortcuts'), h('dd', null, 'Ctrl+K or / search, Alt+= and Alt+- text size, Alt+0 reset size, Alt+T theme')));
}
