import MiniSearch from 'minisearch';
import type { LibNode } from '../../shared/types';
import { state } from '../state';

let engine: MiniSearch | undefined;

interface Doc {
  id: string;
  title: string;
  aliases: string;
  tags: string;
  headings: string;
  text: string;
}

export function buildSearch(): void {
  engine = new MiniSearch<Doc>({
    fields: ['title', 'aliases', 'tags', 'headings', 'text'],
    storeFields: ['id'],
    searchOptions: { boost: { title: 6, aliases: 4, tags: 3, headings: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  engine.addAll(
    state.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      aliases: n.aliases.join(' '),
      tags: n.tags.join(' '),
      headings: n.headings.map((x) => x.text).join(' '),
      text: state.text[n.id] ?? '',
    })),
  );
}

export interface Hit {
  node: LibNode;
  snippet: string;
}

function snippet(text: string, words: string[]): string {
  const lower = text.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return text.slice(0, 120);
  const start = Math.max(0, at - 50);
  return `${start > 0 ? '...' : ''}${text.slice(start, start + 140)}${start + 140 < text.length ? '...' : ''}`;
}

export function search(query: string, limit = 12): Hit[] {
  const q = query.trim();
  if (!engine || q.length < 2) return [];
  const words = q.toLowerCase().split(/\s+/);
  return engine
    .search(q)
    .slice(0, limit)
    .flatMap((r) => {
      const node = state.byId.get(String(r.id));
      return node ? [{ node, snippet: snippet(state.text[node.id] ?? '', words) }] : [];
    });
}
