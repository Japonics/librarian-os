// Repository checks driven by librarian-os.json.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { resolveRules } from '../shared/project';
import { extractHeadings, extractLinks, extractTitle, findDashes, isExternalHref } from '../shared/text';
import { describePath, loadLibrary, walk } from './library';
import { firstErrors, sidecarValidator } from './schemas';

export interface Issue {
  file: string;
  message: string;
}

export interface CheckResult {
  errors: Issue[];
  warnings: Issue[];
  stats: { markdown: number; sidecars: number; nodes: number; edges: number; todos: number; planned: number };
}

const TEXT_EXT = /\.(md|json|ts|scss|css|html|mjs|js)$/;
const NO_DASH_CHECK = /(^|\/)package-lock\.json$/;

/** Files that git would track: tracked plus untracked and not ignored. Falls back to a directory walk. */
export function repoFiles(root: string): string[] {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) {
    return r.stdout.split('\n').filter(Boolean).filter((f) => existsSync(join(root, f))).sort();
  }
  return walk(root, () => true);
}

export function runChecks(root: string): CheckResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const lib = loadLibrary(root);
  for (const i of lib.issues) errors.push(i);
  const empty: CheckResult = { errors, warnings, stats: { markdown: 0, sidecars: 0, nodes: 0, edges: 0, todos: 0, planned: 0 } };
  const config = lib.config;
  if (!config) return empty;
  const rules = resolveRules(config);
  const validate = sidecarValidator();

  // 1. Sidecar format and schema.
  for (const f of lib.files) {
    if (!f.sidecar || !f.sidecarRaw) continue;
    if (!validate(f.sidecar)) {
      for (const m of firstErrors(validate, 6)) errors.push({ file: f.sidecarPath, message: `schema: ${m}` });
      continue;
    }
    if (!f.sidecarRaw.endsWith('\n') || f.sidecarRaw.endsWith('\n\n')) errors.push({ file: f.sidecarPath, message: 'must end with exactly one newline' });
    if (f.sidecarRaw.includes('\t') || f.sidecarRaw.charCodeAt(0) === 0xfeff) errors.push({ file: f.sidecarPath, message: 'must use spaces, no tabs and no BOM' });
  }

  // 2. Orphan sidecars inside the entry points.
  const mdPaths = new Set(lib.files.map((f) => f.path));
  for (const e of config.entryPoints) {
    for (const j of walk(root, (rel) => rel.endsWith('.md.json'), e.path, config.ignore ?? [])) {
      if (!mdPaths.has(j.slice(0, -'.json'.length))) errors.push({ file: j, message: 'sidecar has no Markdown file' });
    }
  }

  // 3. Ids, kinds and relation targets.
  const byId = new Map<string, string>();
  for (const n of lib.nodes) {
    const prev = byId.get(n.id);
    if (prev) errors.push({ file: n.path, message: `duplicate id "${n.id}" (also used by ${prev})` });
    else byId.set(n.id, n.path);
  }
  for (const f of lib.files) {
    const sc = f.sidecar;
    if (!sc?.node) continue;
    const { expectedKind } = describePath(f.path, config);
    if (sc.node.kind !== expectedKind) errors.push({ file: f.sidecarPath, message: `kind must be "${expectedKind}" for this path, found "${sc.node.kind}"` });
  }
  let edges = 0;
  for (const f of lib.files) {
    const sc = f.sidecar;
    if (!sc?.node) continue;
    for (const l of sc.links ?? []) {
      edges++;
      if (!byId.has(l.to)) errors.push({ file: f.sidecarPath, message: `link to unknown id "${l.to}"` });
      if (l.to === sc.node.id) errors.push({ file: f.sidecarPath, message: `link to itself (${l.rel})` });
    }
    const keys = new Set<string>();
    for (const s of sc.sources ?? []) {
      if (keys.has(s.key)) errors.push({ file: f.sidecarPath, message: `duplicate source key "${s.key}"` });
      keys.add(s.key);
      if (s.url && s.verified === undefined) warnings.push({ file: f.sidecarPath, message: `source "${s.key}" has a url but no "verified" flag` });
    }
    const qids = new Set<string>();
    for (const q of sc.questions ?? []) {
      if (qids.has(q.id)) errors.push({ file: f.sidecarPath, message: `duplicate question id "${q.id}"` });
      qids.add(q.id);
    }
  }

  // 4. Markdown: one title, anchors, relative links.
  for (const f of lib.files) {
    const headings = extractHeadings(f.markdown);
    const h1 = headings.filter((h) => h.level === 1);
    if (h1.length !== 1) errors.push({ file: f.path, message: `needs exactly one "#" heading, found ${h1.length}` });
    if (!extractTitle(f.markdown)) continue;
    const slugs = new Set(headings.map((h) => h.slug));
    for (const c of f.sidecar?.concepts ?? []) {
      if (c.anchor && !slugs.has(c.anchor.slice(1))) errors.push({ file: f.sidecarPath, message: `concept "${c.term}" points to missing heading ${c.anchor}` });
    }
    for (const q of f.sidecar?.questions ?? []) {
      if (q.anchor && !slugs.has(q.anchor.slice(1))) errors.push({ file: f.sidecarPath, message: `question "${q.id}" points to missing heading ${q.anchor}` });
    }
    for (const link of extractLinks(f.markdown)) {
      if (isExternalHref(link.href)) continue;
      const [rawPath = '', anchor] = link.href.split('#');
      let decoded = rawPath;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        errors.push({ file: `${f.path}:${link.line}`, message: `bad link encoding "${link.href}"` });
        continue;
      }
      const target = decoded === '' ? f.path : posix.normalize(posix.join(dirname(f.path), decoded));
      if (!existsSync(join(root, target))) {
        errors.push({ file: `${f.path}:${link.line}`, message: `broken link "${link.href}"` });
        continue;
      }
      if (anchor && target.endsWith('.md')) {
        const targetFile = lib.files.find((o) => o.path === target);
        if (targetFile && !extractHeadings(targetFile.markdown).some((h) => h.slug === anchor)) {
          errors.push({ file: `${f.path}:${link.line}`, message: `link anchor "#${anchor}" not found in ${target}` });
        }
      }
    }
  }

  // 5. ToC coverage and links (only when the repository asks for it).
  const tracked = repoFiles(root);
  if (rules.tocCheck) {
    if (existsSync(join(root, rules.tocFile))) {
      const toc = readFileSync(join(root, rules.tocFile), 'utf8');
      const listed = new Set<string>();
      for (const l of extractLinks(toc)) {
        if (isExternalHref(l.href)) continue;
        const p = decodeURIComponent((l.href.split('#')[0] ?? '').replace(/\/$/, ''));
        listed.add(p);
        if (p && !existsSync(join(root, p))) errors.push({ file: `${rules.tocFile}:${l.line}`, message: `link does not resolve: ${l.href}` });
      }
      for (const f of tracked) {
        if (f.endsWith('.md.json')) continue;
        if (!listed.has(f)) errors.push({ file: rules.tocFile, message: `missing entry for ${f}` });
      }
    } else {
      errors.push({ file: rules.tocFile, message: `${rules.tocFile} does not exist` });
    }
  }

  // 6. Dash rule over every text file (only when the repository asks for it).
  if (rules.noLongDashes) {
    for (const f of tracked) {
      if (!TEXT_EXT.test(f) || NO_DASH_CHECK.test(f) || f.startsWith('_sources/')) continue;
      for (const d of findDashes(readFileSync(join(root, f), 'utf8'))) {
        errors.push({ file: `${f}:${d.line}:${d.column}`, message: `${d.char} found, use a hyphen or rewrite the sentence` });
      }
    }
  }

  return {
    errors,
    warnings,
    stats: {
      markdown: lib.files.length,
      sidecars: lib.files.filter((f) => f.sidecar).length,
      nodes: lib.nodes.length,
      edges,
      todos: lib.nodes.reduce((n, x) => n + x.todoCount, 0),
      planned: lib.nodes.filter((n) => n.planned).length,
    },
  };
}
