// Usage: npm run dev [-- --repo /abs/path]   |   npm start
// A local server for one person: no login, loopback address by default.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { loadToolConfig, LIBRARIAN_DIR } from '../core/config';
import { isAllowedGitUrl, pullRepo } from '../core/git';
import { Registry } from '../core/registry';
import type { AppInfo, Question, RefreshResult } from '../shared/types';
import { AiError, pickProvider, providerInfos } from './ai/providers';
import { proposeQuestions } from './ai/questions';
import { Content, Invalid, NotFound, resolveContentPath } from './content';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.map': 'application/json',
};

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 200_000): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Invalid('Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new Invalid('Request body is not a JSON object.');
  }
}

function serveFile(res: ServerResponse, file: string, cache: string): void {
  res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': cache, 'x-content-type-options': 'nosniff' });
  createReadStream(file).pipe(res);
}

async function main(): Promise<void> {
  const cfg = loadToolConfig();
  const dev = process.argv.includes('--dev');
  const registry = new Registry(cfg.dataDir);
  const version = (JSON.parse(readFileSync(join(LIBRARIAN_DIR, 'package.json'), 'utf8')) as { version: string }).version;
  const contents = new Map<string, Content>();
  const lastPull = new Map<string, number>();
  const pulling = new Map<string, Promise<RefreshResult>>();

  // Repositories given on the command line are registered at start, so "npm run dev -- --repo /path" opens them.
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--repo' || !args[i + 1]) continue;
    const target = args[++i] ?? '';
    try {
      const info = isAllowedGitUrl(target) ? await registry.addGit(target) : registry.addLocal(target);
      console.log(`Repository ready: ${info.name} (${info.id})`);
    } catch (e) {
      console.error(`Could not add ${target}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const contentFor = (id: string): Content => {
    const stored = registry.get(id);
    if (!stored) throw new NotFound(`Unknown repository "${id}".`);
    let c = contents.get(id);
    if (!c) contents.set(id, (c = new Content(stored.path)));
    return c;
  };

  /** Reload one repository from disk, and pull first when asked. A failed pull never blocks the reload. */
  const refresh = (id: string, mode: 'auto' | 'manual'): Promise<RefreshResult> => {
    const stored = registry.get(id);
    if (!stored) throw new NotFound(`Unknown repository "${id}".`);
    const running = pulling.get(id);
    if (running) return running;
    const task = (async (): Promise<RefreshResult> => {
      const info = registry.describe(stored);
      const wantPull = info.canPull && (mode === 'manual' || (stored.source === 'git' && cfg.git.pullOnSwitch && Date.now() - (lastPull.get(id) ?? 0) > cfg.git.pullCooldownSeconds * 1000));
      let result: RefreshResult = { repo: info, pulled: false, changed: false };
      if (wantPull) {
        lastPull.set(id, Date.now());
        try {
          const r = await pullRepo(stored.path);
          result = { ...result, pulled: true, changed: r.changed, from: r.from, to: r.to };
        } catch (e) {
          result = { ...result, warning: e instanceof Error ? e.message : 'git pull failed' };
        }
      } else if (mode === 'manual' && !info.canPull) {
        result = { ...result, warning: 'This directory is not a git working copy, so it was only reloaded from disk.' };
      }
      contents.delete(id);
      return { ...result, repo: registry.describe(stored) };
    })().finally(() => pulling.delete(id));
    pulling.set(id, task);
    return task;
  };

  const appInfo = (): AppInfo => ({
    version,
    git: cfg.git,
    configPath: cfg.configPath,
    ai: { enabled: cfg.ai.enabled, default: cfg.ai.default, maxQuestions: cfg.ai.maxQuestions, providers: providerInfos(cfg) },
    repos: registry.list(),
  });

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const method = req.method ?? 'GET';
    // A custom header cannot be set by a cross-site form or image, and a cross-site fetch would need a CORS preflight that this server never answers.
    if (method !== 'GET' && req.headers['x-librarian'] !== '1') return send(res, 403, { error: 'Missing X-Librarian header.' });

    if (method === 'GET' && path === '/api/app') return send(res, 200, appInfo());

    if (method === 'POST' && path === '/api/repos') {
      const body = await readJson(req);
      const info = typeof body.url === 'string' && body.url ? await registry.addGit(body.url.trim()) : registry.addLocal(String(body.path ?? '').trim());
      return send(res, 200, info);
    }
    const repoRefresh = /^\/api\/repos\/([a-z0-9-]+)\/refresh$/.exec(path);
    if (method === 'POST' && repoRefresh) {
      const body = await readJson(req);
      return send(res, 200, await refresh(repoRefresh[1] ?? '', body.mode === 'manual' ? 'manual' : 'auto'));
    }
    const repoDelete = /^\/api\/repos\/([a-z0-9-]+)$/.exec(path);
    if (method === 'DELETE' && repoDelete) {
      const id = repoDelete[1] ?? '';
      contents.delete(id);
      return registry.remove(id) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Unknown repository.' });
    }

    const scoped = /^\/api\/r\/([a-z0-9-]+)(\/.*)$/.exec(path);
    if (!scoped) return send(res, 404, { error: 'Not found.' });
    const content = contentFor(scoped[1] ?? '');
    const rest = scoped[2] ?? '';

    if (method === 'GET' && rest === '/index') return send(res, 200, content.index());
    const noteMatch = /^\/note\/([a-z0-9.-]+)(\/questions)?$/.exec(rest);
    if (noteMatch) {
      const id = noteMatch[1] ?? '';
      if (method === 'GET' && !noteMatch[2]) {
        const note = content.note(id);
        return note ? send(res, 200, note) : send(res, 404, { error: 'Unknown note.' });
      }
      if (method === 'PUT' && noteMatch[2]) {
        const body = await readJson(req);
        if (!Array.isArray(body.questions)) throw new Invalid('Expected { "questions": [...] }.');
        content.setQuestions(id, body.questions as Question[]);
        return send(res, 200, { ok: true });
      }
    }
    if (method === 'POST' && rest === '/ai/questions') {
      const body = await readJson(req);
      const note = typeof body.noteId === 'string' ? content.note(body.noteId) : undefined;
      if (!note) return send(res, 404, { error: 'Unknown note.' });
      const provider = pickProvider(cfg, { provider: typeof body.provider === 'string' ? body.provider : undefined, model: typeof body.model === 'string' ? body.model : undefined });
      const count = Math.min(Math.max(Math.trunc(Number(body.count ?? 5)) || 5, 1), cfg.ai.maxQuestions);
      return send(res, 200, { questions: await proposeQuestions(provider, note.node, note.markdown, count), provider: provider.name });
    }
    return send(res, 404, { error: 'Not found.' });
  }

  let vite: import('vite').ViteDevServer | undefined;
  if (dev) {
    const { createServer: createVite } = await import('vite');
    vite = await createVite({ root: LIBRARIAN_DIR, server: { middlewareMode: true }, appType: 'spa' });
  }
  const dist = join(LIBRARIAN_DIR, 'dist');
  if (!dev && !existsSync(join(dist, 'index.html'))) {
    console.error('No build found. Run "npm run build" first, or use "npm run dev".');
    process.exit(1);
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      try {
        if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname);
        const media = /^\/content\/([a-z0-9-]+)\/(.+)$/.exec(url.pathname);
        if (media) {
          const stored = registry.get(media[1] ?? '');
          const file = stored ? resolveContentPath(stored.path, media[2] ?? '') : undefined;
          if (file && existsSync(file) && statSync(file).isFile()) return serveFile(res, file, 'no-cache');
          res.writeHead(404).end();
          return;
        }
        if (vite) return vite.middlewares(req, res, () => res.writeHead(404).end());
        const requested = join(dist, decodeURIComponent(url.pathname));
        if (requested.startsWith(dist) && existsSync(requested) && statSync(requested).isFile()) return serveFile(res, requested, url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        return serveFile(res, join(dist, 'index.html'), 'no-cache');
      } catch (error) {
        if (error instanceof NotFound) return send(res, 404, { error: error.message });
        if (error instanceof Invalid || error instanceof AiError) return send(res, error instanceof AiError ? error.status : 400, { error: error.message });
        if (error instanceof Error && /^(Give an absolute|That path|Not a Librarian|librarian-os\.json|Only https|git clone failed)/.test(error.message)) return send(res, 400, { error: error.message });
        console.error(error);
        return send(res, 500, { error: error instanceof Error ? error.message : 'Server error.' });
      }
    })();
  });
  server.listen(cfg.port, cfg.host, () => console.log(`Librarian OS ${version}${dev ? ' (dev)' : ''} at http://${cfg.host}:${cfg.port}  repositories: ${registry.list().length}  data: ${cfg.dataDir}`));
}

void main();
