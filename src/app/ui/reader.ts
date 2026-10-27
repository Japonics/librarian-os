import type { LibNode } from '../../shared/types';
import { getNote } from '../api';
import { clear, h, plural } from '../dom';
import { enhance, highlight } from '../markdown/enhance';
import { renderMarkdown } from '../markdown/render';
import { ancestors, neighbors, noteUrl, readingMinutes, state, url } from '../state';
import { writeJson } from '../store/storage';
import { aiPanel } from './ai';
import type { Panel } from './panel';

let token = 0;
let observer: IntersectionObserver | undefined;

export async function showNote(main: HTMLElement, id: string, hash: string, panel: Panel): Promise<void> {
  const node = state.byId.get(id);
  const mine = ++token;
  observer?.disconnect();
  if (!node) {
    main.replaceChildren(h('div', { class: 'empty' }, h('h1', null, 'Note not found'), h('p', null, `There is no note with the id "${id}".`), h('a', { href: url.home() }, 'Back to the start')));
    panel.setNote(undefined);
    document.title = `Not found - ${state.project.name}`;
    return;
  }
  document.title = `${node.title} - ${state.project.name} - Librarian OS`;
  panel.setNote(node);
  main.replaceChildren(h('div', { class: 'reader' }, h('p', { class: 'empty' }, 'Loading...')));

  let markdown: string;
  try {
    markdown = (await getNote(state.repoId, id)).markdown;
  } catch (e) {
    if (mine === token) main.replaceChildren(h('div', { class: 'empty' }, `Could not load the note: ${e instanceof Error ? e.message : 'unknown error'}`));
    return;
  }
  if (mine !== token) return;

  writeJson(`librarian.last.v1.${state.repoId}`, { id: node.id, title: node.title });

  const prose = h('div', { class: 'prose' });
  prose.innerHTML = renderMarkdown(markdown, node.path);
  enhance(prose);
  const query = new URLSearchParams(location.search).get('q');
  if (query) highlight(prose, query);

  const article = h('article', { class: 'reader' }, h('div', { class: 'reader-col' }, crumbs(node), meta(node), prose, extras(node), aiPanel(node), pager(node)));
  clear(main);
  main.append(article);

  if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  else main.scrollTop = 0;

  const headings = Array.from(prose.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'));
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) panel.setActive(visible.target.id);
    },
    { root: main, rootMargin: '0px 0px -70% 0px' },
  );
  headings.forEach((x) => observer?.observe(x));
}

function crumbs(node: LibNode): HTMLElement {
  const parts: (HTMLElement | string)[] = [h('a', { href: url.home() }, state.project.name)];
  for (const a of ancestors(node)) parts.push(h('span', { class: 'sep' }), h('a', { href: noteUrl(a.id) }, a.title));
  return h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, ...parts);
}

function meta(node: LibNode): HTMLElement {
  return h('div', { class: 'note-meta' },
    node.planned && h('span', { class: 'chip planned' }, 'planned, no notes yet'),
    h('span', { class: `chip status-${node.status}` }, node.status),
    node.level && h('span', { class: 'chip' }, node.level),
    node.words > 0 && h('span', null, `${readingMinutes(node.words)} min read`),
    node.todoCount > 0 && h('span', { class: 'chip', title: 'Lines that start with TODO:' }, plural(node.todoCount, 'open gap')),
    ...node.tags.map((t) => h('span', { class: 'chip' }, `#${t}`)));
}

function extras(node: LibNode): HTMLElement | undefined {
  const blocks: HTMLElement[] = [];
  if (node.concepts.length) {
    blocks.push(h('details', null, h('summary', null, `Key terms (${node.concepts.length})`),
      h('div', { class: 'body' }, h('dl', null, ...node.concepts.flatMap((c) => [h('dt', null, c.anchor ? h('a', { href: c.anchor }, c.term) : c.term), h('dd', null, c.definition ?? '')])))));
  }
  if (node.sources.length) {
    const verified = node.sources.filter((s) => s.verified).length;
    blocks.push(h('details', null, h('summary', null, `Sources (${verified} of ${node.sources.length} verified)`),
      h('div', { class: 'body' }, h('ol', null, ...node.sources.map((s) => h('li', null,
        s.authors?.join('; '), s.year ? ` (${s.year}). ` : ' ', s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title) : s.title, '. ',
        s.verified ? h('span', { class: 'verified' }, `record checked ${s.checked ?? ''}`.trim()) : h('span', null, 'not verified')))))));
  }
  if (node.questions.length) {
    blocks.push(h('details', null, h('summary', null, `Practice (${plural(node.questions.length, 'question')})`),
      h('div', { class: 'body' }, h('p', null, h('a', { href: url.practice(`note:${node.id}`) }, 'Practice this note')))));
  }
  return blocks.length ? h('section', { class: 'note-extra' }, ...blocks) : undefined;
}

function pager(node: LibNode): HTMLElement | undefined {
  const { prev, next } = neighbors(node);
  if (!prev && !next) return undefined;
  return h('nav', { class: 'pager', 'aria-label': 'Previous and next' },
    prev ? h('a', { href: noteUrl(prev.id), class: 'prev' }, h('small', null, 'Previous'), prev.title) : h('span'),
    next ? h('a', { href: noteUrl(next.id), class: 'next' }, h('small', null, 'Next'), next.title) : h('span'));
}
