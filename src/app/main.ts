import './styles/main.scss';
import { getApp, getIndex, refreshRepo } from './api';
import { clear, h, toast } from './dom';
import { showGraph } from './graph/graph';
import { rerenderDiagrams } from './markdown/enhance';
import { showPractice } from './practice/practice';
import { navigate, parseLocation, startRouter, type Route } from './router';
import { buildSearch } from './search/search';
import { setIndex, state, url } from './state';
import { THEMES, applySettings, getSettings, updateSettings } from './store/settings';
import { readJson, writeJson } from './store/storage';
import type { RefreshResult } from '../shared/types';
import { showHome } from './ui/home';
import { openPalette } from './ui/palette';
import { createPanel } from './ui/panel';
import { showNote } from './ui/reader';
import { showSettings } from './ui/settingsPage';
import { toggleSettings } from './ui/settingsPanel';
import { buildTree, markCurrent } from './ui/tree';

applySettings();

const LAYOUT_KEY = 'librarian.layout.v1';
const LAST_REPO_KEY = 'librarian.repo.v1';
const JAPONICS = 'https://japonics.io';

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;
  app.replaceChildren(h('p', { class: 'empty' }, 'Loading...'));
  try {
    state.app = await getApp();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'empty' }, h('h1', null, 'Librarian OS is not reachable'), h('p', null, e instanceof Error ? e.message : 'Unknown error'), h('p', null, 'Start it with "npm run dev" in the librarian-os directory.')));
    return;
  }

  const panel = createPanel();
  const main = h('main', { class: 'main', id: 'main', tabindex: -1 });
  const sidebar = h('div', { class: 'sidebar' });
  const brandName = h('span', { class: 'project-name' });
  const repoSelect = h('select', { class: 'repo-switch', 'aria-label': 'Repository' });
  const settingsBtn = h('button', { class: 'btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Reading settings', onclick: () => toggleSettings(settingsBtn) }, 'Aa');
  const viewLinks = h('div', { class: 'view-links' });
  const refreshBtn = h('button', { class: 'btn ghost', type: 'button', title: 'Reload this repository from disk. A git working copy is pulled first.', onclick: () => void refreshCurrent() }, 'Refresh');
  const detailsBtn = h('button', { class: 'btn ghost', type: 'button', 'aria-controls': 'details', 'aria-expanded': 'true', onclick: () => setDetails(!detailsOpen()) }, 'Details');

  // The details panel can be collapsed. The choice is remembered, and on narrow screens it opens as a drawer.
  const wide = matchMedia('(min-width: 1181px)');
  const detailsOpen = (): boolean => (wide.matches ? !document.body.classList.contains('aside-collapsed') : document.body.classList.contains('show-aside'));
  const setDetails = (open: boolean): void => {
    if (wide.matches) {
      document.body.classList.toggle('aside-collapsed', !open);
      writeJson(LAYOUT_KEY, { ...readJson<Record<string, unknown>>(LAYOUT_KEY, {}), details: open });
    } else document.body.classList.toggle('show-aside', open);
    detailsBtn.setAttribute('aria-expanded', String(open));
    detailsBtn.classList.toggle('is-active', open);
  };
  if (readJson<{ details?: boolean }>(LAYOUT_KEY, {}).details === false) document.body.classList.add('aside-collapsed');
  detailsBtn.setAttribute('aria-expanded', String(detailsOpen()));
  wide.addEventListener('change', () => detailsBtn.setAttribute('aria-expanded', String(detailsOpen())));
  panel.el.id = 'details';

  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'btn ghost menu-toggle', type: 'button', 'aria-label': 'Toggle navigation', onclick: () => document.body.classList.toggle('show-sidebar') }, 'Menu'),
    h('a', { class: 'brand', href: '/', title: 'Librarian OS' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-text' }, 'Librarian OS')),
    h('span', { class: 'brand-sep', 'aria-hidden': 'true' }, '|'),
    brandName,
    h('button', { class: 'btn search-trigger', type: 'button', onclick: openPalette }, h('span', null, 'Search'), h('kbd', null, 'Ctrl K')),
    h('span', { class: 'spacer' }), viewLinks, repoSelect, refreshBtn,
    h('a', { class: 'btn ghost', href: url.settings(), title: 'Settings: AI providers and repositories' }, 'Settings'),
    settingsBtn, detailsBtn);
  const footer = h('footer', { class: 'foot' },
    h('span', null, 'Librarian OS ', h('span', { class: 'ver' }, `v${state.app.version}`), h('span', { class: 'dot', 'aria-hidden': 'true' }, ' | '), h('span', { class: 'foot-project' })),
    h('a', { href: JAPONICS, target: '_blank', rel: 'noopener noreferrer' }, 'Powered by Japonics'));
  clear(app);
  app.append(h('div', { class: 'shell' }, topbar, sidebar, main, panel.el, footer));

  const refreshRepos = async (): Promise<void> => {
    state.app = await getApp();
    drawSwitcher();
  };
  const drawSwitcher = (): void => {
    repoSelect.replaceChildren(...state.app.repos.map((r) => h('option', { value: r.id, selected: r.id === state.repoId }, r.ok ? r.name : `${r.name} (problem)`)), h('option', { value: '__manage' }, 'Manage repositories...'));
    repoSelect.hidden = false;
  };
  repoSelect.addEventListener('change', () => {
    if (repoSelect.value === '__manage') { navigate(`${url.settings()}?tab=repos`); drawSwitcher(); return; }
    navigate(`/r/${repoSelect.value}`);
  });

  let loadedRepo = '';
  /** Reports what a refresh did. A pull that failed is shown, but the reloaded content is still used. */
  const report = (r: RefreshResult, explicit: boolean): void => {
    if (r.warning) toast(r.warning.length > 140 ? `${r.warning.slice(0, 137)}...` : r.warning);
    else if (r.pulled && r.changed) toast(`Pulled new commits (${r.from ?? '?'} to ${r.to ?? '?'})`);
    else if (explicit) toast(r.pulled ? 'Already up to date' : 'Reloaded from disk');
  };
  /** Load the index of a repository. A switch to a git clone pulls first (automatic mode), a refresh pulls always. */
  const loadRepo = async (id: string, how: { force?: boolean; mode?: 'auto' | 'manual' | 'none' } = {}): Promise<boolean> => {
    if (id === loadedRepo && !how.force) return true;
    const mode = how.mode ?? 'auto';
    if (mode !== 'none') {
      const repo = state.app.repos.find((r) => r.id === id);
      if (repo && (mode === 'manual' || (repo.source === 'git' && state.app.git.pullOnSwitch))) main.replaceChildren(h('p', { class: 'empty' }, repo.canPull ? 'Updating from git...' : 'Reloading...'));
      try {
        const r = await refreshRepo(id, mode);
        report(r, mode === 'manual');
        state.app = { ...state.app, repos: state.app.repos.map((x) => (x.id === id ? r.repo : x)) };
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Refresh failed');
      }
    }
    try {
      setIndex(await getIndex(id), id);
    } catch (e) {
      main.replaceChildren(h('div', { class: 'empty' }, h('h1', null, 'This repository cannot be opened'), h('p', null, e instanceof Error ? e.message : 'Unknown error'), h('p', null, h('a', { href: `${url.settings()}?tab=repos` }, 'Open the repository list'))));
      return false;
    }
    loadedRepo = id;
    writeJson(LAST_REPO_KEY, id);
    buildSearch();
    sidebar.replaceChildren(
      h('nav', { class: 'side-nav', 'aria-label': 'Views' }, h('a', { href: url.home() }, 'Start'), h('a', { href: url.graph() }, 'Graph'), h('a', { href: url.practice() }, 'Practice')),
      buildTree());
    viewLinks.replaceChildren(h('a', { class: 'btn ghost nav-link', href: url.graph() }, 'Graph'), h('a', { class: 'btn ghost nav-link', href: url.practice() }, 'Practice'));
    brandName.textContent = state.project.name;
    footer.querySelector('.foot-project')!.textContent = state.project.name;
    drawSwitcher();
    return true;
  };

  /** Pull and reload the repository that is open, then draw the current view again. */
  const refreshCurrent = async (id = state.repoId): Promise<void> => {
    if (!id) return;
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    try {
      const open = id === state.repoId;
      if (open) {
        if (await loadRepo(id, { force: true, mode: 'manual' })) await onRoute(parseLocation());
      } else {
        report(await refreshRepo(id, 'manual'), true);
      }
      await refreshRepos();
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  };

  let cleanup: (() => void) | undefined;
  const onRoute = async (route: Route): Promise<void> => {
    cleanup?.();
    cleanup = undefined;
    document.body.classList.remove('show-sidebar');
    document.body.classList.toggle('no-repo', route.name === 'welcome' || route.name === 'settings');
    if (route.name === 'welcome') {
      const last = readJson<string>(LAST_REPO_KEY, '');
      const target = state.app.repos.find((r) => r.id === last && r.ok) ?? state.app.repos.find((r) => r.ok);
      if (target) return navigate(`/r/${target.id}`, true);
      panel.setNote(undefined);
      sidebar.replaceChildren();
      showSettings(main, { refreshRepos, refreshRepo: refreshCurrent });
      main.prepend(h('div', { class: 'page', style: 'padding-bottom:0' }, h('h1', null, 'Welcome to Librarian OS'), h('p', { class: 'lead' }, 'Add a repository to start. It needs a librarian-os.json at its root. INSTRUCTIONS.md explains how to prepare one.')));
      return;
    }
    if (route.name === 'settings') {
      panel.setNote(undefined);
      showSettings(main, { refreshRepos, refreshRepo: refreshCurrent });
      return;
    }
    if (!state.app.repos.some((r) => r.id === route.repo)) {
      main.replaceChildren(h('div', { class: 'empty' }, h('h1', null, 'Unknown repository'), h('p', null, `There is no repository "${route.repo}".`), h('a', { href: url.settings() }, 'Open settings')));
      return;
    }
    if (!(await loadRepo(route.repo))) return;
    markCurrent(route.name === 'note' ? route.id : undefined);
    switch (route.name) {
      case 'note':
        void showNote(main, route.id, route.hash, panel);
        break;
      case 'graph':
        panel.setNote(undefined);
        cleanup = showGraph(main, route.mode, route.depth, route.from);
        break;
      case 'practice':
        panel.setNote(undefined);
        cleanup = showPractice(main, route.scope);
        break;
      default:
        panel.setNote(undefined);
        showHome(main);
    }
  };
  drawSwitcher();
  startRouter((route) => void onRoute(route));

  // The diagrams use light or dark colors, so they are drawn again when the theme changes.
  document.addEventListener('themechange', () => rerenderDiagrams(main));

  document.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement).closest('input, textarea, select');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (state.repoId) openPalette(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (state.repoId) openPalette(); }
    else if (e.altKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); updateSettings({ fontSize: getSettings().fontSize + 1 }); }
    else if (e.altKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); updateSettings({ fontSize: getSettings().fontSize - 1 }); }
    else if (e.altKey && e.key === '0') { e.preventDefault(); updateSettings({ fontSize: 18 }); }
    else if (e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      const next = THEMES[(THEMES.indexOf(getSettings().theme) + 1) % THEMES.length] ?? 'system';
      updateSettings({ theme: next });
      toast(`Theme: ${next}`);
    }
  });
}

void boot();
