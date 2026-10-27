// Radial tree layout for the mind map view. Pure functions, so they can be tested.

export interface MmEdge { source: string; target: string }

export interface MmNode {
  id: string;
  title: string;
  depth: number;
  parent?: MmNode;
  children: MmNode[];
  x: number;
  y: number;
  anchor: 'start' | 'end';
  path?: string;
  weight: number;
}

/** Build a spanning tree from `rootId` (breadth first, edges used in both directions) and place it on concentric circles. */
export function mindmapLayout(rootId: string, edges: MmEdge[], titleOf: (id: string) => string, maxDepth: number, cx: number, cy: number, ring: number): MmNode {
  const root: MmNode = { id: rootId, title: titleOf(rootId), depth: 0, children: [], x: cx, y: cy, anchor: 'start', weight: 1 };
  const seen = new Set([rootId]);
  let frontier = [root];
  for (let d = 0; d < maxDepth; d++) {
    const next: MmNode[] = [];
    for (const parent of frontier) {
      const neighbors = edges.flatMap((e) => (e.source === parent.id ? [e.target] : e.target === parent.id ? [e.source] : []));
      for (const id of [...new Set(neighbors)].sort((a, b) => titleOf(a).localeCompare(titleOf(b)))) {
        if (seen.has(id)) continue;
        seen.add(id);
        const child: MmNode = { id, title: titleOf(id), depth: d + 1, parent, children: [], x: 0, y: 0, anchor: 'start', weight: 1 };
        parent.children.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  const weigh = (n: MmNode): number => (n.weight = n.children.length ? n.children.reduce((s, c) => s + weigh(c), 0) : 1);
  weigh(root);

  const polar = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const place = (n: MmNode, from: number, to: number): void => {
    let start = from;
    for (const c of n.children) {
      const span = ((to - from) * c.weight) / n.weight;
      const angle = start + span / 2;
      [c.x, c.y] = polar(c.depth * ring, angle);
      c.anchor = Math.cos(angle) >= 0 ? 'start' : 'end';
      const [px, py] = [n.x, n.y];
      const mid = (n.depth + 0.5) * ring;
      const parentAngle = n.depth === 0 ? angle : Math.atan2(py - cy, px - cx);
      const [c1x, c1y] = polar(mid, parentAngle);
      const [c2x, c2y] = polar(mid, angle);
      c.path = `M${px},${py} C${c1x},${c1y} ${c2x},${c2y} ${c.x},${c.y}`;
      place(c, start, start + span);
      start += span;
    }
  };
  place(root, -Math.PI / 2, (3 * Math.PI) / 2);
  return root;
}

const unsafe = /[()[\]{}"'`]/g;

/** Mermaid `mindmap` text for the tree. Titles are cleaned because Mermaid reads brackets as shapes. */
export function toMermaidMindmap(root: MmNode): string {
  const clean = (t: string): string => t.replace(unsafe, ' ').replace(/\s+/g, ' ').trim() || 'untitled';
  const lines = ['mindmap', `  root((${clean(root.title)}))`];
  const walk = (n: MmNode, level: number): void => {
    for (const c of n.children) {
      lines.push(`${'  '.repeat(level + 1)}${clean(c.title)}`);
      walk(c, level + 1);
    }
  };
  walk(root, 1);
  return `${lines.join('\n')}\n`;
}
