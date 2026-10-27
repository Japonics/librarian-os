import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headOf, isGitCopy, pullRepo } from '../src/core/git';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

function commit(dir: string, file: string, text: string): void {
  writeFileSync(join(dir, file), text);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', `edit ${file}`);
}

function setup(): { origin: string; copy: string } {
  const origin = mkdtempSync(join(tmpdir(), 'los-origin-'));
  git(origin, 'init', '-q', '-b', 'main');
  commit(origin, 'a.md', '# A\n');
  const copy = join(mkdtempSync(join(tmpdir(), 'los-copy-')), 'clone');
  execFileSync('git', ['clone', '-q', origin, copy], { env });
  return { origin, copy };
}

describe('pullRepo', () => {
  it('reports new commits once, then "unchanged"', async () => {
    const { origin, copy } = setup();
    expect(isGitCopy(copy)).toBe(true);
    const before = await headOf(copy);
    commit(origin, 'b.md', '# B\n');
    const first = await pullRepo(copy);
    expect(first.changed).toBe(true);
    expect(first.from).toBe(before);
    expect(first.to).not.toBe(before);
    expect((await pullRepo(copy)).changed).toBe(false);
  });

  it('refuses a directory that is not a git copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'los-plain-'));
    expect(isGitCopy(dir)).toBe(false);
    await expect(pullRepo(dir)).rejects.toThrow('not a git working copy');
  });

  it('fails instead of merging when the histories have diverged', async () => {
    const { origin, copy } = setup();
    commit(origin, 'b.md', '# B\n');
    commit(copy, 'c.md', '# C local\n');
    await expect(pullRepo(copy)).rejects.toThrow('git pull failed');
    expect(git(copy, 'log', '--oneline').split('\n')).toHaveLength(2);
  });
});
