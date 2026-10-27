import { h } from '../dom';
import { navigate } from '../router';
import { search, type Hit } from '../search/search';
import { ancestors, noteUrl, state } from '../state';

let overlay: HTMLElement | undefined;

export function closePalette(): void {
  overlay?.remove();
  overlay = undefined;
}

export function openPalette(): void {
  if (overlay) return;
  let hits: Hit[] = [];
  let selected = 0;
  const input = h('input', { type: 'search', placeholder: 'Search notes, headings and tags', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul', { role: 'listbox' });

  const go = (hit: Hit | undefined): void => {
    if (!hit) return;
    const q = input.value.trim();
    closePalette();
    navigate(`${noteUrl(hit.node.id)}`.split('#')[0] + (q ? `?q=${encodeURIComponent(q)}` : ''));
  };

  const draw = (): void => {
    list.replaceChildren();
    if (hits.length === 0) {
      const q = input.value.trim();
      list.append(h('li', { class: 'p' }, q.length < 2 ? 'Type at least two letters.' : 'No notes match.'));
      return;
    }
    hits.forEach((hit, i) => {
      const trail = ancestors(hit.node).map((a) => a.title).join(' / ');
      list.append(h('li', { role: 'option', 'aria-selected': String(i === selected), onclick: () => go(hit), onmousemove: () => { if (selected !== i) { selected = i; draw(); } } },
        h('div', { class: 't' }, hit.node.title, hit.node.planned && h('span', { class: 'chip', style: 'margin-left:.5rem' }, 'planned')),
        trail && h('div', { class: 'p' }, trail),
        hit.snippet && h('div', { class: 's' }, hit.snippet)));
    });
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => { hits = search(input.value); selected = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(hits.length - 1, selected + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[selected]); }
    else if (e.key === 'Escape') closePalette();
  });

  overlay = h('div', { class: 'overlay', onmousedown: (e: Event) => { if (e.target === overlay) closePalette(); } },
    h('div', { class: 'palette', role: 'dialog', 'aria-label': 'Search' }, input, list, h('div', { class: 'hint' }, `${state.nodes.length} notes indexed. Up and down to move, Enter to open, Esc to close.`)));
  document.body.append(overlay);
  draw();
  input.focus();
}
