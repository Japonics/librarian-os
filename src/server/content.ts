// Read access to one repository and the single write path: practice questions in a sidecar.

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { loadLibrary, signature, toIndex, type Library } from '../core/library';
import { loadProject } from '../core/project';
import { makeSidecar } from '../core/scaffold';
import { firstErrors, sidecarValidator } from '../core/schemas';
import type { LibraryIndex, NoteResponse, Question, Sidecar } from '../shared/types';

const SERVED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']);
const BLOCKED = new Set(['node_modules']);

/** Map a request path below /content/<repo>/ to a file inside the root, or undefined if it must not be served. */
export function resolveContentPath(root: string, urlPath: string): string | undefined {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (rel.includes('\0')) return undefined;
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p === '..' || p.startsWith('.') || BLOCKED.has(p))) return undefined;
  if (!SERVED_EXT.has(extname(rel).toLowerCase())) return undefined;
  const abs = resolve(root, ...parts);
  return abs.startsWith(resolve(root) + sep) ? abs : undefined;
}

export class Content {
  private lib: Library | undefined;
  private sig = '';

  constructor(readonly root: string) {}

  library(): Library {
    const sig = signature(this.root, loadProject(this.root).config);
    if (!this.lib || sig !== this.sig) {
      this.lib = loadLibrary(this.root);
      this.sig = sig;
    }
    return this.lib;
  }

  index(): LibraryIndex {
    const lib = this.library();
    if (!lib.config) throw new Invalid(lib.issues[0]?.message ?? 'Repository has no valid librarian-os.json.');
    return toIndex(lib);
  }

  note(id: string): NoteResponse | undefined {
    const lib = this.library();
    const node = lib.nodes.find((n) => n.id === id);
    const file = lib.files.find((f) => f.path === node?.path);
    return node && file ? { node, markdown: file.markdown } : undefined;
  }

  /** Replace the practice questions of one note. Only the sidecar of that note changes, and it is created if it does not exist yet. */
  setQuestions(id: string, questions: Question[]): void {
    const lib = this.library();
    const node = lib.nodes.find((n) => n.id === id);
    const file = lib.files.find((f) => f.path === node?.path);
    if (!file || !lib.config) throw new NotFound(`No note with id "${id}".`);
    const next: Sidecar = { ...(file.sidecar ?? makeSidecar(file.path, lib.config)) };
    if (!file.sidecar) next.node = { ...next.node, id };
    if (questions.length) next.questions = questions;
    else delete next.questions;
    const validate = sidecarValidator();
    if (!validate(next)) throw new Invalid(`Questions are not valid: ${firstErrors(validate, 1)[0] ?? ''}`.trim());
    const target = join(this.root, file.sidecarPath);
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(tmp, target);
    this.sig = '';
  }
}

export class NotFound extends Error {}
export class Invalid extends Error {}
