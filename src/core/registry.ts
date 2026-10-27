// The list of repositories that Librarian OS knows about, kept in <dataDir>/repos.json.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { RepoInfo } from '../shared/types';
import { cloneDirFor, cloneRepo, isGitCopy } from './git';
import { loadProject } from './project';

interface Stored {
  id: string;
  path: string;
  source: 'local' | 'git';
  url?: string;
  addedAt: string;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo';

export class Registry {
  private items: Stored[];
  private readonly file: string;

  constructor(private readonly dataDir: string) {
    this.file = join(dataDir, 'repos.json');
    this.items = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as { repos: Stored[] }).repos : [];
  }

  private save(): void {
    mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ repos: this.items }, null, 2)}\n`);
    renameSync(tmp, this.file);
  }

  list(): RepoInfo[] {
    return this.items.map((s) => this.describe(s));
  }

  get(id: string): Stored | undefined {
    return this.items.find((s) => s.id === id);
  }

  describe(s: Stored): RepoInfo {
    if (!existsSync(s.path)) return { id: s.id, name: s.id, description: '', path: s.path, source: s.source, url: s.url, canPull: false, ok: false, error: 'Directory not found.' };
    const { config, errors } = loadProject(s.path);
    return { id: s.id, name: config?.project.name ?? s.id, description: config?.project.description ?? '', path: s.path, source: s.source, url: s.url, canPull: isGitCopy(s.path), ok: Boolean(config) && errors.length === 0, error: errors[0] };
  }

  /** Register a local directory. Adding the same directory again returns the existing entry. */
  addLocal(path: string): RepoInfo {
    if (!isAbsolute(path)) throw new Error('Give an absolute path.');
    const abs = resolve(path);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error('That path is not a directory.');
    return this.register(abs, 'local');
  }

  async addGit(url: string): Promise<RepoInfo> {
    const fresh = !existsSync(cloneDirFor(this.dataDir, url));
    const dir = await cloneRepo(this.dataDir, url);
    try {
      return this.register(dir, 'git', url);
    } catch (e) {
      // A copy that was just cloned and is not a Librarian OS repository is not kept.
      if (fresh) rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }

  private register(path: string, source: 'local' | 'git', url?: string): RepoInfo {
    const existing = this.items.find((s) => s.path === path);
    if (existing) return this.describe(existing);
    const { config, errors } = loadProject(path);
    if (!config) throw new Error(errors[0] ?? 'Not a Librarian OS repository.');
    const base = slug(config.project.name);
    let id = base;
    if (this.items.some((s) => s.id === id)) id = `${base}-${createHash('sha1').update(path).digest('hex').slice(0, 5)}`;
    const stored: Stored = { id, path, source, url, addedAt: new Date().toISOString() };
    this.items.push(stored);
    this.save();
    return this.describe(stored);
  }

  /** Forget a repository. The files stay on disk. */
  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((s) => s.id !== id);
    if (this.items.length !== before) this.save();
    return this.items.length !== before;
  }
}
