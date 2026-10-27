import { REL_INVERSE_LABEL, REL_LABEL, type LibNode } from '../../shared/types';
import { allEdges, groupByRel } from '../../shared/relations';
import { h, plural } from '../dom';
import { ancestors, noteUrl, readingMinutes, state, url } from '../state';

type Tab = 'outline' | 'links' | 'info';

export interface Panel {
  el: HTMLElement;
  setNote(node: LibNode | undefined): void;
  setActive(slug: string | undefined): void;
}

export function createPanel(): Panel {
  const el = h('aside', { class: 'aside', 'aria-label': 'Note details' });
  let tab: Tab = 'outline';
  let node: LibNode | undefined;
  let active: string | undefined;

  const draw = (): void => {
    const tabs = h(
      'div',
      { class: 'panel-tabs', role: 'tablist' },
      ...(['outline', 'links', 'info'] as Tab[]).map((t) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(t === tab), onclick: () => { tab = t; draw(); } }, t === 'outline' ? 'Outline' : t === 'links' ? 'Links' : 'Info'),
      ),
    );
    const body = h('div', { class: 'panel-body', role: 'tabpanel' });
    if (!node) body.append(h('p', { class: 'empty' }, 'Open a note to see its outline and links.'));
    else if (tab === 'outline') body.append(outline(node, active));
    else if (tab === 'links') body.append(links(node));
    else body.append(info(node));
    el.replaceChildren(tabs, body);
  };
  draw();

  return {
    el,
    setNote(n) { node = n; active = undefined; draw(); },
    setActive(slug) {
      active = slug;
      el.querySelectorAll('.outline a').forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${slug}`));
    },
  };
}

function outline(node: LibNode, active: string | undefined): HTMLElement {
  const items = node.headings.filter((x) => x.level >= 2 && x.level <= 4);
  if (items.length === 0) return h('p', { class: 'empty' }, 'No sections.');
  return h('div', { class: 'outline' }, ...items.map((x) => h('a', { href: `#${x.slug}`, class: `l${x.level}${x.slug === active ? ' is-current' : ''}`, onclick: (e: Event) => { e.preventDefault(); document.getElementById(x.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${x.slug}`); } }, x.text)));
}

function nodeLink(id: string): HTMLElement | string {
  const n = state.byId.get(id);
  return n ? h('a', { href: noteUrl(n.id) }, n.title) : id;
}

function links(node: LibNode): HTMLElement {
  const wrap = h('div');
  const outgoing = groupByRel(node.links);
  const incoming = groupByRel(allEdges(state.nodes).filter((e) => e.to === node.id));
  const kids = state.children.get(node.id) ?? [];
  const parent = node.parent ? state.byId.get(node.parent) : undefined;

  if (parent) wrap.append(h('h3', null, 'Part of'), h('ul', null, h('li', null, nodeLink(parent.id))));
  if (kids.length) wrap.append(h('h3', null, `Contains (${kids.length})`), h('ul', null, ...kids.map((k) => h('li', null, nodeLink(k.id)))));
  outgoing.forEach((list, rel) => wrap.append(h('h3', null, REL_LABEL[rel]), h('ul', null, ...list.map((l) => h('li', null, nodeLink(l.to), l.note && h('span', { class: 'rel-note' }, l.note))))));
  incoming.forEach((list, rel) => wrap.append(h('h3', null, REL_INVERSE_LABEL[rel]), h('ul', null, ...list.map((e) => h('li', null, nodeLink(e.from), e.note && h('span', { class: 'rel-note' }, e.note))))));
  if (!wrap.childElementCount) wrap.append(h('p', { class: 'empty' }, 'No relations yet. Add them to the sidecar file of this note.'));
  wrap.append(h('p', null, h('a', { href: url.graph(`mode=local&from=${node.id}`) }, 'Open in graph')));
  return wrap;
}

function info(node: LibNode): HTMLElement {
  const verified = node.sources.filter((s) => s.verified).length;
  const rows: [string, string | HTMLElement][] = [
    ['Id', h('code', null, node.id)],
    ['File', h('code', null, node.path)],
    ['Kind', node.kind],
    ['Status', node.status],
    ['Level', node.level ?? 'not set'],
    ['Length', `${plural(node.words, 'word')}, about ${readingMinutes(node.words)} min`],
    ['Open gaps', plural(node.todoCount, 'TODO line')],
    ['Sources', node.sources.length ? `${verified} of ${node.sources.length} verified` : 'none listed'],
    ['Questions', String(node.questions.length)],
    ['Tags', node.tags.join(', ') || 'none'],
    ['Aliases', node.aliases.join(', ') || 'none'],
  ];
  const trail = ancestors(node).map((a) => a.title).join(' / ');
  return h('div', null, h('dl', null, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])), trail && h('p', { class: 'rel-note' }, trail));
}
