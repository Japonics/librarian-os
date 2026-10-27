import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/core/check';
import { scaffold } from '../src/core/scaffold';
import { buildToc } from '../src/core/toc';


function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'librarian-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const TOC = '# ToC\n\n- [c](librarian-os.json)\n- [a](area/README.md)\n- [b](area/field/README.md)\n- [n](area/field/n.md)\n- [t](ToC.md)\n';
const CONFIG = JSON.stringify({ version: 1, project: { name: 'Test' }, entryPoints: [{ path: 'area' }], toc: { check: true }, rules: { requireSidecars: true, noLongDashes: true } });
const BASE = {
  'librarian-os.json': CONFIG,
  'ToC.md': TOC,
  'area/README.md': '# Area\n',
  'area/field/README.md': '# Field\n',
  'area/field/n.md': '# Note\n\n## Summary\nText.\n',
};

describe('runChecks', () => {
  it('reports missing sidecars, then passes after scaffold', () => {
    const root = repo(BASE);
    const first = runChecks(root);
    expect(first.errors.some((e) => e.message.includes('missing sidecar'))).toBe(true);
    scaffold(root);
    const second = runChecks(root);
    expect(second.errors).toEqual([]);
    expect(second.stats.nodes).toBe(3);
  });

  it('finds a broken relation target, a duplicate id and a bad anchor', () => {
    const root = repo({
      ...BASE,
      'area/field/n.md.json': JSON.stringify({ node: { id: 'area.n', kind: 'note' }, links: [{ to: 'nope', rel: 'related' }], concepts: [{ term: 'x', anchor: '#missing' }] }) + '\n',
      'area/field/m.md': '# M\n',
      'area/field/m.md.json': JSON.stringify({ node: { id: 'area.n', kind: 'note' } }) + '\n',
    });
    scaffold(root);
    const msgs = runChecks(root).errors.map((e) => e.message);
    expect(msgs.some((m) => m.includes('unknown id "nope"'))).toBe(true);
    expect(msgs.some((m) => m.includes('duplicate id "area.n"'))).toBe(true);
    expect(msgs.some((m) => m.includes('missing heading #missing'))).toBe(true);
  });

  it('flags a wrong kind and a broken relative link', () => {
    const root = repo({ ...BASE, 'area/field/n.md': '# Note\n\n[x](gone.md)\n' });
    scaffold(root);
    writeFileSync(join(root, 'area/field/n.md.json'), JSON.stringify({ node: { id: 'area.n', kind: 'index' } }) + '\n');
    const msgs = runChecks(root).errors.map((e) => e.message);
    expect(msgs.some((m) => m.includes('kind must be "note"'))).toBe(true);
    expect(msgs.some((m) => m.includes('broken link "gone.md"'))).toBe(true);
  });
});

describe('buildToc', () => {
  it('lists Markdown files and planned topics but not sidecars', () => {
    const root = repo({ ...BASE, 'area/other/README.md': '# Other\n\nAn empty field.\n\n## Planned topics\n\n- Alpha\n- Beta\n\n## Notes\n' });
    scaffold(root);
    const toc = buildToc(root);
    expect(toc).toContain('[n.md](area/field/n.md): Note - Text.');
    expect(toc).not.toContain('n.md.json');
    expect(toc).toContain('- Alpha (planned)');
  });
});
