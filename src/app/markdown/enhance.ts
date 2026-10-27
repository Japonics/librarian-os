// Work that needs the DOM after the HTML is in place: copy buttons, diagrams, math, search highlights.

import { h } from '../dom';
import { resolveTheme } from '../store/settings';

export function enhance(root: HTMLElement): void {
  addCopyButtons(root);
  void renderDiagrams(root);
  void renderMath(root);
}

function addCopyButtons(root: HTMLElement): void {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.diagram') || pre.querySelector('.copy')) return;
    const button = h('button', { class: 'btn copy', type: 'button', 'aria-label': 'Copy code' }, 'Copy');
    button.addEventListener('click', () => {
      const text = pre.querySelector('code')?.textContent ?? '';
      void navigator.clipboard?.writeText(text).then(
        () => {
          button.textContent = 'Copied';
          window.setTimeout(() => (button.textContent = 'Copy'), 1400);
        },
        () => (button.textContent = 'Failed'),
      );
    });
    pre.append(button);
  });
}

let mermaidPromise: Promise<typeof import('mermaid').default> | undefined;
let diagramCount = 0;

async function renderDiagrams(root: HTMLElement): Promise<void> {
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('.diagram[data-mermaid]'));
  if (boxes.length === 0) return;
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  const mermaid = await mermaidPromise;
  const dark = ['dark', 'contrast'].includes(resolveTheme());
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'Inter, system-ui, sans-serif' });
  for (const box of boxes) {
    const source = decodeURIComponent(box.dataset.mermaid ?? '');
    try {
      const { svg } = await mermaid.render(`diagram-${++diagramCount}`, source);
      box.innerHTML = svg;
      box.classList.remove('failed');
    } catch (error) {
      box.classList.add('failed');
      box.textContent = `Diagram could not be drawn: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}\n\n${source}`;
    }
  }
}

/** Math is optional: the library loads KaTeX only for notes that contain $$ ... $$ or \( ... \) delimiters. */
async function renderMath(root: HTMLElement): Promise<void> {
  const text = root.textContent ?? '';
  if (!/\$\$|\\\(|\\\[/.test(text)) return;
  const [{ default: render }] = await Promise.all([import('katex/dist/contrib/auto-render'), import('katex/dist/katex.min.css')]);
  render(root, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    ignoredTags: ['script', 'style', 'textarea', 'pre', 'code'],
    throwOnError: false,
  });
}

export function rerenderDiagrams(root: HTMLElement): void {
  void renderDiagrams(root);
}

/** Wrap occurrences of the query words in <mark>. Used after a search opens a note. */
export function highlight(root: HTMLElement, query: string): void {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('pre, .diagram, mark, script, style') ? NodeFilter.FILTER_REJECT : pattern.test(n.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    const value = node.nodeValue ?? '';
    for (const m of value.matchAll(pattern)) {
      const at = m.index ?? 0;
      frag.append(value.slice(last, at), h('mark', { class: 'hit' }, m[0]));
      last = at + m[0].length;
    }
    frag.append(value.slice(last));
    node.replaceWith(frag);
  }
}
