import type { AppInfo, LibNode, LibraryIndex, ProjectInfo } from '../shared/types';

export const state = {
  repoId: '',
  project: { name: '', description: '', language: 'en', entryPoints: [] } as ProjectInfo,
  nodes: [] as LibNode[],
  text: {} as Record<string, string>,
  byId: new Map<string, LibNode>(),
  byPath: new Map<string, LibNode>(),
  children: new Map<string, LibNode[]>(),
  roots: [] as LibNode[],
  app: { version: '', configPath: '', git: { pullOnSwitch: false }, ai: { enabled: false, default: { provider: '', model: '' }, maxQuestions: 10, providers: [] }, repos: [] } as AppInfo,
};

/** Every address in the app starts with the repository id, so a link always opens the right library. */
export const url = {
  home: (): string => (state.repoId ? `/r/${state.repoId}` : '/'),
  note: (id: string, hash = ''): string => `/r/${state.repoId}/n/${id}${hash ? `#${hash.replace(/^#/, '')}` : ''}`,
  graph: (query = ''): string => `/r/${state.repoId}/graph${query ? `?${query}` : ''}`,
  practice: (scope = ''): string => `/r/${state.repoId}/practice${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`,
  settings: (): string => '/settings',
  media: (path: string): string => `/content/${state.repoId}/${path.split('/').map(encodeURIComponent).join('/')}`,
};

const bySiblingOrder = (a: LibNode, b: LibNode): number => (a.order ?? 1e9) - (b.order ?? 1e9) || a.path.localeCompare(b.path);

export function setIndex(index: LibraryIndex, repoId: string): void {
  state.repoId = repoId;
  state.project = index.project;
  state.nodes = index.nodes;
  state.text = index.text;
  state.byId = new Map(index.nodes.map((n) => [n.id, n]));
  state.byPath = new Map(index.nodes.map((n) => [n.path, n]));
  state.children = new Map();
  for (const n of index.nodes) {
    if (!n.parent) continue;
    const list = state.children.get(n.parent) ?? [];
    list.push(n);
    state.children.set(n.parent, list);
  }
  state.children.forEach((list) => list.sort(bySiblingOrder));
  state.roots = index.nodes.filter((n) => !n.parent).sort(bySiblingOrder);
}

export function ancestors(node: LibNode): LibNode[] {
  const out: LibNode[] = [];
  let cur = node.parent ? state.byId.get(node.parent) : undefined;
  while (cur) {
    out.unshift(cur);
    cur = cur.parent ? state.byId.get(cur.parent) : undefined;
  }
  return out;
}

/** Previous and next node in reading order: the siblings of a note, or the sibling indexes of an index. */
export function neighbors(node: LibNode): { prev?: LibNode; next?: LibNode } {
  const list = node.parent ? (state.children.get(node.parent) ?? []) : state.roots;
  const i = list.findIndex((n) => n.id === node.id);
  return { prev: i > 0 ? list[i - 1] : undefined, next: i >= 0 ? list[i + 1] : undefined };
}

export function descendantNotes(node: LibNode): LibNode[] {
  const out: LibNode[] = [];
  const walk = (n: LibNode): void => {
    for (const c of state.children.get(n.id) ?? []) {
      if (c.kind === 'note') out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export const noteUrl = (id: string, hash = ''): string => url.note(id, hash);
export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 200));
