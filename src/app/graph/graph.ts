import { drag } from 'd3-drag';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { REL_LABEL, REL_TYPES, type LibNode, type RelType } from '../../shared/types';
import { h, toast } from '../dom';
import { navigate } from '../router';
import { noteUrl, state, url } from '../state';
import { mindmapLayout, toMermaidMindmap, type MmNode } from './mindmap';

type EdgeKind = RelType | 'contains';
interface GEdge { source: string; target: string; kind: EdgeKind }
interface GNode extends SimulationNodeDatum { id: string; node: LibNode; r: number }
type GLink = SimulationLinkDatum<GNode> & { kind: EdgeKind };

const REL_COLOR: Record<RelType, string> = { prerequisite: '#d1495b', extends: '#c98a14', related: '#7d8794', contrasts: '#9b5de5', 'example-of': '#00798c', applies: '#30638e', 'part-of': '#4f9a73' };
const DOMAIN_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#9c755f'];
const SVGNS = 'http://www.w3.org/2000/svg';

const opts = { hierarchy: true, relations: true, planned: false };
let sim: Simulation<GNode, GLink> | undefined;
let zoomer: ReturnType<typeof zoom<SVGSVGElement, unknown>> | undefined;

const domainColor = (n: LibNode): string => {
  const i = state.roots.findIndex((r) => r.domain === n.domain);
  return i >= 0 ? (DOMAIN_COLORS[i % DOMAIN_COLORS.length] ?? '#888') : '#8a8f98';
};
const short = (t: string, n = 30): string => (t.length > n ? `${t.slice(0, n - 1)}...` : t);

function visibleNodes(): LibNode[] {
  return state.nodes.filter((n) => (opts.planned || !n.planned));
}

function edgesFor(ids: Set<string>): GEdge[] {
  const out: GEdge[] = [];
  for (const n of state.nodes) {
    if (!ids.has(n.id)) continue;
    if (opts.hierarchy && n.parent && ids.has(n.parent)) out.push({ source: n.parent, target: n.id, kind: 'contains' });
    if (opts.relations) for (const l of n.links) if (ids.has(l.to)) out.push({ source: n.id, target: l.to, kind: l.rel });
  }
  return out;
}

/** Nodes within `depth` steps of `from`, following the edges that are switched on, in both directions. */
function reach(from: string, depth: number): Set<string> {
  const all = new Set(state.nodes.map((n) => n.id));
  const edges = edgesFor(all);
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const e of edges) {
      const other = e.source === id ? e.target : e.target === id ? e.source : undefined;
      if (other && !seen.has(other) && (opts.planned || !state.byId.get(other)?.planned)) { seen.add(other); next.push(other); }
    }
    frontier = next;
  }
  return seen;
}

export function showGraph(main: HTMLElement, mode: string, depth: number, from?: string): () => void {
  document.title = `Graph - ${state.project.name}`;
  const centerId = from && state.byId.has(from) ? from : undefined;
  const effective = (mode === 'local' || mode === 'mindmap') && !centerId ? 'global' : mode;
  const go = (patch: Record<string, string | undefined>): void => {
    const q = new URLSearchParams({ mode: effective, depth: String(depth), ...(centerId ? { from: centerId } : {}) });
    Object.entries(patch).forEach(([k, v]) => (v === undefined ? q.delete(k) : q.set(k, v)));
    navigate(url.graph(q.toString()), true);
  };
  const toggle = (label: string, key: keyof typeof opts): HTMLElement => {
    const input = h('input', { type: 'checkbox', checked: opts[key] });
    input.addEventListener('change', () => { opts[key] = input.checked; go({}); });
    return h('label', { class: 'check' }, input, label);
  };
  const modeBtn = (m: string, label: string, needsCenter: boolean): HTMLElement =>
    h('button', { type: 'button', class: 'btn', 'aria-pressed': String(effective === m), disabled: needsCenter && !centerId, title: needsCenter && !centerId ? 'Open a note first, then use "Open in graph"' : undefined, onclick: () => go({ mode: m }) }, label);
  const depthBtns = [1, 2, 3].map((d) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(depth === d), onclick: () => go({ depth: String(d) }) }, String(d)));
  const centerSelect = h('select', { 'aria-label': 'Center note' }, h('option', { value: '' }, 'Center note...'), ...state.nodes.filter((n) => !n.planned).map((n) => h('option', { value: n.id, selected: n.id === centerId }, n.title)));
  centerSelect.addEventListener('change', () => go({ from: centerSelect.value || undefined, mode: centerSelect.value && effective === 'global' ? 'local' : effective }));

  const canvas = h('div', { class: 'canvas' });
  const exportBtn = h('button', { type: 'button', class: 'btn', hidden: effective !== 'mindmap', onclick: () => void copyMermaid() }, 'Copy as Mermaid');
  main.replaceChildren(h('div', { class: 'graph-page' },
    h('div', { class: 'toolbar' },
      h('div', { class: 'group' }, modeBtn('global', 'Whole library', false), modeBtn('local', 'Around a note', true), modeBtn('mindmap', 'Mind map', true)),
      h('div', { class: 'group' }, h('span', null, 'Depth'), ...depthBtns),
      centerSelect,
      h('div', { class: 'group' }, toggle('Hierarchy', 'hierarchy'), toggle('Relations', 'relations'), toggle('Planned areas', 'planned')),
      exportBtn),
    canvas));

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Graph of notes and their relations');
  canvas.append(svg);
  const tip = h('div', { class: 'tip', hidden: true });
  canvas.append(tip);

  const w = (): number => canvas.clientWidth || 900;
  const ht = (): number => canvas.clientHeight || 600;
  svg.setAttribute('viewBox', `0 0 ${w()} ${ht()}`);
  const root = select(svg).append('g');
  zoomer = zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', (e) => root.attr('transform', e.transform.toString()));
  select(svg).call(zoomer);

  let mm: MmNode | undefined;
  async function copyMermaid(): Promise<void> {
    if (!mm) return;
    try { await navigator.clipboard.writeText(toMermaidMindmap(mm)); toast('Mermaid mindmap copied'); } catch { toast('Copy failed'); }
  }

  sim?.stop();
  if (effective === 'mindmap' && centerId) {
    mm = drawMindmap(root, centerId, depth, w(), ht());
  } else {
    drawForce(root, svg, tip, canvas, effective === 'local' && centerId ? reach(centerId, depth) : new Set(visibleNodes().map((n) => n.id)), centerId, w(), ht());
  }
  canvas.append(legend(effective === 'mindmap'));
  return () => sim?.stop();
}

function legend(mind: boolean): HTMLElement {
  const domains = state.roots.map((r, i) => h('div', null, h('i', { style: `background:${DOMAIN_COLORS[i % DOMAIN_COLORS.length]}` }), r.title));
  const rels = REL_TYPES.map((r) => h('div', null, h('span', { class: 'line', style: `border-color:${REL_COLOR[r]}` }), REL_LABEL[r]));
  return h('div', { class: 'legend' }, ...domains, !mind && h('div', null, h('span', { class: 'line', style: 'border-color:var(--border);border-top-style:dashed' }), 'Hierarchy'), ...(mind ? [] : rels));
}

function drawForce(root: ReturnType<typeof select<SVGGElement, unknown>> | any, svg: SVGSVGElement, tip: HTMLElement, canvas: HTMLElement, ids: Set<string>, centerId: string | undefined, width: number, height: number): void {
  const degree = new Map<string, number>();
  const edges = edgesFor(ids);
  edges.forEach((e) => { degree.set(e.source, (degree.get(e.source) ?? 0) + 1); degree.set(e.target, (degree.get(e.target) ?? 0) + 1); });
  const nodes: GNode[] = [...ids].flatMap((id) => {
    const node = state.byId.get(id);
    return node ? [{ id, node, r: (node.kind === 'index' ? 7 : 5) + Math.min(6, degree.get(id) ?? 0) * 0.6 + (id === centerId ? 4 : 0) }] : [];
  });
  const links: GLink[] = edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));

  const edgeSel = root.append('g').selectAll('line').data(links).join('line')
    .attr('class', (d: GLink) => `edge${d.kind === 'contains' ? ' h' : ''}`)
    .attr('stroke', (d: GLink) => (d.kind === 'contains' ? '' : REL_COLOR[d.kind]));
  edgeSel.append('title').text((d: GLink) => (d.kind === 'contains' ? 'contains' : REL_LABEL[d.kind]));

  const nodeSel = root.append('g').selectAll('g').data(nodes).join('g')
    .attr('class', (d: GNode) => `node${d.id === centerId ? ' current' : ''}${d.node.planned ? ' planned' : ''}`)
    .attr('tabindex', 0).attr('role', 'link').attr('aria-label', (d: GNode) => d.node.title)
    .on('click', (_e: Event, d: GNode) => navigate(noteUrl(d.id)))
    .on('keydown', (e: KeyboardEvent, d: GNode) => { if (e.key === 'Enter') navigate(noteUrl(d.id)); });
  nodeSel.append('circle').attr('r', (d: GNode) => d.r).attr('fill', (d: GNode) => domainColor(d.node));
  nodeSel.append('text').attr('x', (d: GNode) => d.r + 4).attr('y', 4).text((d: GNode) => short(d.node.title));

  const neighbors = (id: string): Set<string> => new Set(edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : [])).concat(id));
  nodeSel.on('mouseenter focus', (e: MouseEvent, d: GNode) => {
    const near = neighbors(d.id);
    nodeSel.classed('dim', (n: GNode) => !near.has(n.id));
    edgeSel.classed('dim', (l: GLink) => (l.source as GNode).id !== d.id && (l.target as GNode).id !== d.id);
    tip.hidden = false;
    tip.textContent = `${d.node.title}${d.node.summary ? `: ${short(d.node.summary, 140)}` : ''}`;
    const box = canvas.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - box.left + 14, box.width - 270)}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
  }).on('mouseleave blur', () => { nodeSel.classed('dim', false); edgeSel.classed('dim', false); tip.hidden = true; });

  sim = forceSimulation<GNode>(nodes)
    .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance((l) => (l.kind === 'contains' ? 70 : 130)).strength((l) => (l.kind === 'contains' ? 0.7 : 0.25)))
    .force('charge', forceManyBody().strength(-260))
    .force('collide', forceCollide<GNode>().radius((d) => d.r + 14))
    .force('x', forceX(width / 2).strength(0.05))
    .force('y', forceY(height / 2).strength(0.05))
    .on('tick', () => {
      edgeSel.attr('x1', (d: GLink) => (d.source as GNode).x ?? 0).attr('y1', (d: GLink) => (d.source as GNode).y ?? 0).attr('x2', (d: GLink) => (d.target as GNode).x ?? 0).attr('y2', (d: GLink) => (d.target as GNode).y ?? 0);
      nodeSel.attr('transform', (d: GNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  nodeSel.call(drag<SVGGElement, GNode>()
    .on('start', (e, d) => { if (!e.active) sim?.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => { if (!e.active) sim?.alphaTarget(0); d.fx = null; d.fy = null; }));
  // When the layout settles, scale and move it so the whole graph is in view.
  sim.on('end', () => {
    const g = root.node() as SVGGElement | null;
    const box = g?.getBBox();
    if (!g || !box || box.width === 0 || !zoomer) return;
    const k = Math.min(1.6, 0.92 / Math.max(box.width / width, box.height / height));
    select(svg).call(zoomer.transform, zoomIdentity.translate(width / 2 - k * (box.x + box.width / 2), height / 2 - k * (box.y + box.height / 2)).scale(k));
  });
}

function drawMindmap(root: any, centerId: string, depth: number, width: number, height: number): MmNode {
  const ids = reach(centerId, depth);
  const tree = mindmapLayout(centerId, edgesFor(ids), (id) => state.byId.get(id)?.title ?? id, depth, width / 2, height / 2, Math.max(60, Math.min((width / 2 - 190) / depth, (height / 2 - 40) / depth)));
  const flat: MmNode[] = [];
  const walk = (n: MmNode): void => { flat.push(n); n.children.forEach(walk); };
  walk(tree);
  root.append('g').selectAll('path').data(flat.filter((n) => n.parent)).join('path').attr('class', 'mm-link').attr('d', (n: MmNode) => n.path ?? '');
  const sel = root.append('g').selectAll('g').data(flat).join('g')
    .attr('class', (n: MmNode) => `node${n.id === centerId ? ' current' : ''}${state.byId.get(n.id)?.planned ? ' planned' : ''}`)
    .attr('transform', (n: MmNode) => `translate(${n.x},${n.y})`).attr('tabindex', 0).attr('role', 'link').attr('aria-label', (n: MmNode) => n.title)
    .on('click', (_e: Event, n: MmNode) => navigate(noteUrl(n.id)));
  sel.append('circle').attr('r', (n: MmNode) => (n.id === centerId ? 11 : 6)).attr('fill', (n: MmNode) => { const node = state.byId.get(n.id); return node ? domainColor(node) : '#888'; });
  sel.append('text').attr('x', (n: MmNode) => (n.depth === 0 ? 0 : n.anchor === 'start' ? 11 : -11)).attr('y', (n: MmNode) => (n.depth === 0 ? -16 : 4)).attr('text-anchor', (n: MmNode) => (n.depth === 0 ? 'middle' : n.anchor)).text((n: MmNode) => short(n.title, 34));
  return tree;
}
