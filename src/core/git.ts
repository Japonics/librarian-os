// Fetching a repository by URL. The URL is validated first and git is started without a shell.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Accepted forms: https://host/path, ssh://git@host/path and git@host:path. Nothing that git could read as an option or as a helper such as ext::. */
export function isAllowedGitUrl(url: string): boolean {
  if (url.length > 500 || /[\s\0'"`$\;|&<>]/.test(url) || url.startsWith('-')) return false;
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/[A-Za-z0-9._~\-/%+]+$/.test(url) || /^ssh:\/\/git@[A-Za-z0-9.-]+(:\d+)?\/[A-Za-z0-9._~\-/]+$/.test(url) || /^git@[A-Za-z0-9.-]+:[A-Za-z0-9._~\-/]+$/.test(url);
}

export function cloneDirFor(dataDir: string, url: string): string {
  const base = (url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() ?? 'repo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo';
  return join(dataDir, 'repos', `${base}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}`);
}

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

function git(args: string[], cwd: string, timeout = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, env: GIT_ENV }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).split('\n')[0])) : resolve(String(stdout).trim())));
  });
}

export const isGitCopy = (dir: string): boolean => existsSync(join(dir, '.git'));

export async function headOf(dir: string): Promise<string | undefined> {
  try {
    return await git(['rev-parse', '--short', 'HEAD'], dir, 10_000);
  } catch {
    return undefined;
  }
}

export interface PullResult {
  changed: boolean;
  from?: string;
  to?: string;
}

/** Fast-forward only: a pull never merges, never rewrites local commits and never creates conflicts. */
export async function pullRepo(dir: string): Promise<PullResult> {
  if (!isGitCopy(dir)) throw new Error('This directory is not a git working copy.');
  const from = await headOf(dir);
  try {
    await git(['pull', '--ff-only'], dir);
  } catch (e) {
    throw new Error(`git pull failed: ${(e as Error).message}`);
  }
  const to = await headOf(dir);
  return { changed: from !== to, from, to };
}

export function cloneRepo(dataDir: string, url: string): Promise<string> {
  if (!isAllowedGitUrl(url)) return Promise.reject(new Error('Only https:// and ssh git URLs are accepted.'));
  const dest = cloneDirFor(dataDir, url);
  if (existsSync(join(dest, '.git'))) {
    return new Promise<string>((resolve, reject) => {
      execFile('git', ['-C', dest, 'pull', '--ff-only'], { timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err) => (err ? reject(new Error('git pull failed. The existing copy is used as it is.')) : resolve(dest)));
    }).catch(() => dest);
  }
  mkdirSync(join(dataDir, 'repos'), { recursive: true });
  return new Promise((resolve, reject) => {
    execFile('git', ['clone', '--depth', '1', '--', url, dest], { timeout: 180_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, _out, stderr) => {
      if (err) reject(new Error(`git clone failed: ${String(stderr || err.message).split('\n')[0]}`));
      else resolve(dest);
    });
  });
}
