import type { LibNode, Link, RelType } from './types';
import { REL_TYPES } from './types';

export interface Edge extends Link {
  from: string;
}

export function allEdges(nodes: LibNode[]): Edge[] {
  return nodes.flatMap((n) => n.links.map((l) => ({ ...l, from: n.id })));
}

/** Incoming edges for a node. Backlinks are never stored in a sidecar. */
export function backlinksOf(id: string, nodes: LibNode[]): Edge[] {
  return allEdges(nodes).filter((e) => e.to === id);
}

export function groupByRel<T extends { rel: RelType }>(edges: T[]): Map<RelType, T[]> {
  const out = new Map<RelType, T[]>();
  for (const rel of REL_TYPES) {
    const list = edges.filter((e) => e.rel === rel);
    if (list.length) out.set(rel, list);
  }
  return out;
}

/** Ids reachable from `start` in at most `depth` steps, following relations in both directions. */
export function neighborhood(start: string, nodes: LibNode[], depth: number): Set<string> {
  const edges = allEdges(nodes);
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        const other = e.from === id ? e.to : e.to === id ? e.from : undefined;
        if (other && !seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return seen;
}
