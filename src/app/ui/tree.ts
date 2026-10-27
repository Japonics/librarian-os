import type { LibNode } from '../../shared/types';
import { h } from '../dom';
import { ancestors, noteUrl, state } from '../state';

const detailsById = new Map<string, HTMLDetailsElement>();
const linksById = new Map<string, HTMLAnchorElement>();

function link(node: LibNode, cls: string): HTMLAnchorElement {
  const a = h('a', { href: noteUrl(node.id), class: cls, 'data-id': node.id, title: node.summary || node.title }, node.title);
  linksById.set(node.id, a);
  return a;
}

function branch(node: LibNode): HTMLElement {
  const kids = state.children.get(node.id) ?? [];
  if (kids.length === 0) return h('li', null, link(node, node.planned ? 'leaf planned' : 'leaf'));
  const details = h('details', null, h('summary', { class: node.planned ? 'planned' : '' }, link(node, 'node-link')), h('ul', null, ...kids.map(branch)));
  detailsById.set(node.id, details);
  return h('li', null, details);
}

export function buildTree(): HTMLElement {
  detailsById.clear();
  linksById.clear();
  const root = h('nav', { class: 'tree', 'aria-label': 'Library' });
  root.append(h('ul', null, ...state.roots.map(branch)));
  return root;
}

/** Mark the current note and open the branches that lead to it. */
export function markCurrent(id: string | undefined): void {
  linksById.forEach((a) => a.removeAttribute('aria-current'));
  if (!id) return;
  const node = state.byId.get(id);
  if (!node) return;
  const current = linksById.get(id);
  current?.setAttribute('aria-current', 'page');
  const open = [...ancestors(node), node];
  for (const n of open) {
    const d = detailsById.get(n.id);
    if (d) d.open = true;
  }
  current?.scrollIntoView({ block: 'nearest' });
}
