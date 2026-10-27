// Reads the entry points of a repository: Markdown files, their sidecars, and builds the node list.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE, resolveRules, type ProjectConfig } from '../shared/project';
import { countTodoLines, extractHeadings, extractSummary, extractTitle, toPlainText } from '../shared/text';
import type { LibNode, LibraryIndex, Sidecar } from '../shared/types';
import { loadProject, projectInfo } from './project';

const ALWAYS_SKIP = new Set(['node_modules', 'dist', '.cache']);

export interface MdFile {
  /** Repository relative path with forward slashes. */
  path: string;
  markdown: string;
  sidecarPath: string;
  sidecarRaw?: string;
  sidecar?: Sidecar;
  parseError?: string;
}

export interface LoadIssue {
  file: string;
  message: string;
}

export interface Library {
  root: string;
  config?: ProjectConfig;
  files: MdFile[];
  nodes: LibNode[];
  text: Record<string, string>;
  issues: LoadIssue[];
}

function ignored(rel: string, name: string, ignore: string[]): boolean {
  return ALWAYS_SKIP.has(name) || name.startsWith('.') || ignore.some((i) => rel === i || rel.startsWith(`${i}/`) || name === i);
}

export function walk(root: string, accept: (rel: string) => boolean, dir = '', ignore: string[] = []): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (ignored(rel, entry.name, ignore)) continue;
    if (entry.isDirectory()) out.push(...walk(root, accept, rel, ignore));
    else if (accept(rel)) out.push(rel);
  }
  return out.sort();
}

export function readMdFiles(root: string, config: ProjectConfig): MdFile[] {
  const ignore = config.ignore ?? [];
  const paths = config.entryPoints.flatMap((e) => walk(root, (rel) => rel.endsWith('.md'), e.path, ignore));
  return paths.map((path) => {
    const sidecarPath = `${path}.json`;
    const file: MdFile = { path, markdown: readFileSync(join(root, path), 'utf8'), sidecarPath };
    if (existsSync(join(root, sidecarPath))) {
      file.sidecarRaw = readFileSync(join(root, sidecarPath), 'utf8');
      try {
        file.sidecar = JSON.parse(file.sidecarRaw) as Sidecar;
      } catch (e) {
        file.parseError = (e as Error).message;
      }
    }
    return file;
  });
}

export function entryOf(path: string, config: ProjectConfig): { entry: string; index: number } | undefined {
  let best: { entry: string; index: number } | undefined;
  config.entryPoints.forEach((e, index) => {
    if ((path === e.path || path.startsWith(`${e.path}/`)) && (!best || e.path.length > best.entry.length)) best = { entry: e.path, index };
  });
  return best;
}

/** domain (the entry point), field (first directory below it) and the node kind that the path implies. */
export function describePath(path: string, config: ProjectConfig): { domain: string; field?: string; expectedKind: 'note' | 'index'; entryIndex: number } {
  const hit = entryOf(path, config);
  const entry = hit?.entry ?? path.split('/')[0] ?? '';
  const rest = path.slice(entry.length).split('/').filter(Boolean);
  return { domain: entry, field: rest.length >= 2 ? rest[0] : undefined, expectedKind: rest[rest.length - 1] === 'README.md' ? 'index' : 'note', entryIndex: hit?.index ?? 0 };
}

/** Default id: the directory path joined by dots for an index, "<field>.<file>" for a note. */
export function defaultId(path: string, config: ProjectConfig): string {
  const seg = path.split('/');
  const name = (seg[seg.length - 1] ?? '').replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (seg[seg.length - 1] === 'README.md') return seg.slice(0, -1).map(slug).join('.');
  const { field } = describePath(path, config);
  return `${slug(field ?? seg[0] ?? 'root')}.${name}`;
}

function parentPath(path: string, known: Set<string>, config: ProjectConfig): string | undefined {
  const entry = entryOf(path, config)?.entry;
  if (!entry) return undefined;
  const entryLen = entry.split('/').length;
  const seg = path.split('/');
  let dir = seg.slice(0, -1);
  if (seg[seg.length - 1] === 'README.md') dir = dir.slice(0, -1);
  while (dir.length >= entryLen) {
    const candidate = `${dir.join('/')}/README.md`;
    if (known.has(candidate)) return candidate;
    dir = dir.slice(0, -1);
  }
  return undefined;
}

export function buildNodes(files: MdFile[], config: ProjectConfig): { nodes: LibNode[]; text: Record<string, string> } {
  const known = new Set(files.map((f) => f.path));
  const idByPath = new Map(files.map((f) => [f.path, f.sidecar?.node.id ?? defaultId(f.path, config)]));
  const nodes: LibNode[] = [];
  const text: Record<string, string> = {};
  for (const f of files) {
    const sc = f.sidecar;
    const id = idByPath.get(f.path) ?? f.path;
    const { domain, field, expectedKind, entryIndex } = describePath(f.path, config);
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    const plain = toPlainText(f.markdown);
    const parentFile = parentPath(f.path, known, config);
    const entryCfg = config.entryPoints.find((e) => `${e.path}/README.md` === f.path);
    const kind = sc?.node.kind ?? expectedKind;
    nodes.push({
      id,
      kind,
      path: f.path,
      title: entryCfg?.title ?? extractTitle(f.markdown) ?? f.path,
      domain,
      field,
      parent: parentFile ? idByPath.get(parentFile) : undefined,
      status: sc?.node.status ?? 'draft',
      level: sc?.node.level,
      order: entryCfg ? entryIndex : sc?.node.order,
      tags: sc?.node.tags ?? [],
      aliases: sc?.node.aliases ?? [],
      group: sc?.map?.group,
      summary: entryCfg?.description ?? extractSummary(f.markdown),
      headings: extractHeadings(f.markdown),
      links: sc?.links ?? [],
      sources: sc?.sources ?? [],
      concepts: sc?.concepts ?? [],
      questions: sc?.questions ?? [],
      planned: kind === 'index' && !files.some((o) => o.path.startsWith(`${dir}/`) && o.path !== f.path && describePath(o.path, config).expectedKind === 'note'),
      todoCount: countTodoLines(f.markdown),
      words: plain ? plain.split(' ').length : 0,
    });
    text[id] = plain;
  }
  nodes.sort((a, b) => compareNodes(a, b, config));
  return { nodes, text };
}

function sortKey(n: LibNode): string {
  // "dir/README.md" sorts as "dir/" so an index comes before its children.
  return n.path.endsWith('/README.md') ? n.path.slice(0, -'README.md'.length) : n.path;
}

export function compareNodes(a: LibNode, b: LibNode, config: ProjectConfig): number {
  const ia = config.entryPoints.findIndex((e) => e.path === a.domain);
  const ib = config.entryPoints.findIndex((e) => e.path === b.domain);
  if (ia !== ib) return ia - ib;
  if (a.parent === b.parent && (a.order !== undefined || b.order !== undefined)) return (a.order ?? 1e9) - (b.order ?? 1e9) || sortKey(a).localeCompare(sortKey(b));
  return sortKey(a).localeCompare(sortKey(b));
}

export function loadLibrary(root: string): Library {
  const { config, errors } = loadProject(root);
  const issues: LoadIssue[] = errors.map((message) => ({ file: CONFIG_FILE, message }));
  if (!config || errors.some((e) => e.includes('is not valid JSON') || e.includes('not found'))) return { root, config, files: [], nodes: [], text: {}, issues };
  const files = readMdFiles(root, config);
  const rules = resolveRules(config);
  for (const f of files) {
    if (f.parseError) issues.push({ file: f.sidecarPath, message: `invalid JSON: ${f.parseError}` });
    else if (!f.sidecar && rules.requireSidecars) issues.push({ file: f.path, message: `missing sidecar ${f.sidecarPath}` });
  }
  const { nodes, text } = buildNodes(files, config);
  return { root, config, files, nodes, text, issues };
}

export function toIndex(lib: Library): LibraryIndex {
  if (!lib.config) throw new Error('Repository has no valid librarian-os.json');
  return { generatedAt: new Date().toISOString(), project: projectInfo(lib.config), nodes: lib.nodes, text: lib.text };
}

/** Cheap change detector: number of files and the newest modification time of notes, sidecars and the config. */
export function signature(root: string, config: ProjectConfig | undefined): string {
  const files = config ? config.entryPoints.flatMap((e) => walk(root, (rel) => rel.endsWith('.md') || rel.endsWith('.md.json'), e.path, config.ignore ?? [])) : [];
  let newest = existsSync(join(root, CONFIG_FILE)) ? statSync(join(root, CONFIG_FILE)).mtimeMs : 0;
  for (const f of files) newest = Math.max(newest, statSync(join(root, f)).mtimeMs);
  return `${files.length}:${newest}`;
}
