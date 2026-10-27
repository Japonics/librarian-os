import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../src/core/library';
import { isSafeEntryPath, loadProject } from '../src/core/project';
import { Registry } from '../src/core/registry';

function repo(config: unknown, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'los-'));
  writeFileSync(join(root, 'librarian-os.json'), JSON.stringify(config));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

describe('isSafeEntryPath', () => {
  it('accepts relative directories only', () => {
    expect(isSafeEntryPath('docs')).toBe(true);
    expect(isSafeEntryPath('a/b')).toBe(true);
    for (const p of ['', '/etc', '../x', 'a/../b', '.git', 'a/.hidden', 'C:/x']) expect(isSafeEntryPath(p), p).toBe(false);
  });
});

describe('loadProject', () => {
  const ok = { version: 1, project: { name: 'P' }, entryPoints: [{ path: 'docs' }] };
  it('loads a valid configuration', () => {
    const { config, errors } = loadProject(repo(ok, { 'docs/README.md': '# Docs\n' }));
    expect(errors).toEqual([]);
    expect(config?.project.name).toBe('P');
  });
  it('reports a missing file, a bad schema, a missing README and nested entry points', () => {
    expect(loadProject(mkdtempSync(join(tmpdir(), 'los-'))).errors[0]).toContain('not found');
    expect(loadProject(repo({ version: 2 })).errors.length).toBeGreaterThan(0);
    expect(loadProject(repo(ok, { 'docs/x.md': '# X\n' })).errors.join()).toContain('no README.md');
    const nested = { ...ok, entryPoints: [{ path: 'docs' }, { path: 'docs/sub' }] };
    expect(loadProject(repo(nested, { 'docs/README.md': '# D\n', 'docs/sub/README.md': '# S\n' })).errors.join()).toContain('inside entry point');
  });
});

describe('loadLibrary', () => {
  it('reads only the entry points, works without sidecars and applies entry overrides', () => {
    const root = repo({ version: 1, project: { name: 'P' }, entryPoints: [{ path: 'docs', title: 'Guide' }], ignore: ['drafts'] }, {
      'README.md': '# Root\n',
      'docs/README.md': '# Docs\n\nIntro.\n',
      'docs/part/README.md': '# Part\n',
      'docs/part/topic.md': '# Topic\n\n## Summary\nText.\n',
      'docs/drafts/skip.md': '# Skip\n',
      'other/README.md': '# Other\n',
    });
    const lib = loadLibrary(root);
    expect(lib.issues).toEqual([]);
    expect(lib.nodes.map((n) => n.path)).toEqual(['docs/README.md', 'docs/part/README.md', 'docs/part/topic.md']);
    expect(lib.nodes[0]).toMatchObject({ title: 'Guide', kind: 'index', domain: 'docs' });
    const topic = lib.nodes.find((n) => n.path === 'docs/part/topic.md');
    expect(topic).toMatchObject({ id: 'part.topic', kind: 'note', parent: 'docs.part' });
  });
});

describe('Registry', () => {
  it('registers a local repository once and forgets it on request', () => {
    const data = mkdtempSync(join(tmpdir(), 'los-data-'));
    const root = repo({ version: 1, project: { name: 'My Library' }, entryPoints: [{ path: 'docs' }] }, { 'docs/README.md': '# Docs\n' });
    const reg = new Registry(data);
    const a = reg.addLocal(root);
    expect(a).toMatchObject({ id: 'my-library', name: 'My Library', ok: true });
    expect(reg.addLocal(root).id).toBe(a.id);
    expect(new Registry(data).list()).toHaveLength(1);
    expect(() => reg.addLocal('relative/path')).toThrow('absolute');
    expect(() => reg.addLocal(mkdtempSync(join(tmpdir(), 'los-')))).toThrow('not found');
    expect(reg.remove(a.id)).toBe(true);
    expect(new Registry(data).list()).toHaveLength(0);
  });
});
