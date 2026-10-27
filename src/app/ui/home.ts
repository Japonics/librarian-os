import { h, plural } from '../dom';
import { descendantNotes, noteUrl, state, url } from '../state';
import { readJson } from '../store/storage';

export function showHome(main: HTMLElement): void {
  document.title = `${state.project.name} - Librarian OS`;
  const notes = state.nodes.filter((n) => n.kind === 'note');
  const questions = state.nodes.reduce((n, x) => n + x.questions.length, 0);
  const last = readJson<{ id?: string; title?: string } | null>(`librarian.last.v1.${state.repoId}`, null);
  const resume = last?.id && state.byId.has(last.id) ? last : undefined;

  main.replaceChildren(h('div', { class: 'page' },
    h('h1', null, state.project.name),
    h('p', { class: 'lead' }, state.project.description || 'Open a section, search with Ctrl+K, or look at how the notes connect.'),
    h('div', { class: 'stats' },
      h('div', null, h('strong', null, notes.length), h('span', null, 'written notes')),
      h('div', null, h('strong', null, state.nodes.filter((n) => n.planned).length), h('span', null, 'planned areas')),
      h('div', null, h('strong', null, state.nodes.reduce((n, x) => n + x.links.length, 0)), h('span', null, 'relations')),
      h('div', null, h('strong', null, questions), h('span', null, 'practice questions'))),
    h('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' },
      resume && h('a', { class: 'btn primary', href: noteUrl(resume.id ?? '') }, `Continue: ${resume.title ?? ''}`),
      h('a', { class: 'btn', href: url.graph() }, 'Open the graph'),
      h('a', { class: 'btn', href: url.practice() }, 'Practice')),
    h('h2', null, 'Sections'),
    h('div', { class: 'cards' }, ...state.roots.map((d) => {
      const count = descendantNotes(d).length;
      return h('a', { class: `card${d.planned ? ' planned' : ''}`, href: noteUrl(d.id) }, h('h3', null, d.title), h('p', null, d.summary), h('span', { class: 'chip' }, count ? plural(count, 'note') : 'planned'));
    }))));
  main.scrollTop = 0;
}
