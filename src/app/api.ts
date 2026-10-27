import type { AppInfo, LibraryIndex, NoteResponse, Question, RefreshResult, RepoInfo } from '../shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

// The custom header is required by the server for every write (see server/main.ts).
const write = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json', 'x-librarian': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
const r = (repo: string): string => `/api/r/${encodeURIComponent(repo)}`;

export const getApp = (): Promise<AppInfo> => request('/api/app');
export const addRepo = (input: { path?: string; url?: string }): Promise<RepoInfo> => request('/api/repos', write('POST', input));
/** Reload a repository on the server. "manual" always pulls a git working copy, "auto" pulls only clones, at most once per cooldown. */
export const refreshRepo = (id: string, mode: 'auto' | 'manual'): Promise<RefreshResult> => request(`/api/repos/${encodeURIComponent(id)}/refresh`, write('POST', { mode }));
export const removeRepo = (id: string): Promise<{ ok: true }> => request(`/api/repos/${encodeURIComponent(id)}`, write('DELETE'));

export const getIndex = (repo: string): Promise<LibraryIndex> => request(`${r(repo)}/index`);
export const getNote = (repo: string, id: string): Promise<NoteResponse> => request(`${r(repo)}/note/${encodeURIComponent(id)}`);
export const proposeQuestions = (repo: string, noteId: string, count: number, choice: { provider?: string; model?: string }): Promise<{ questions: Question[] }> =>
  request(`${r(repo)}/ai/questions`, write('POST', { noteId, count, ...choice }));
export const saveQuestions = (repo: string, id: string, questions: Question[]): Promise<{ ok: true }> => request(`${r(repo)}/note/${encodeURIComponent(id)}/questions`, write('PUT', { questions }));
