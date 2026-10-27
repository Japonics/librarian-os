// Reads and validates the librarian-os.json of a repository.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE, type ProjectConfig } from '../shared/project';
import type { ProjectInfo } from '../shared/types';
import { firstErrors, projectValidator } from './schemas';

export interface LoadedProject {
  config?: ProjectConfig;
  errors: string[];
}

const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/** Entry point paths are plain relative directories: no absolute paths, no "..", no dot directories. */
export function isSafeEntryPath(p: string): boolean {
  const n = normalize(p);
  return n.length > 0 && !n.startsWith('/') && !/^[a-zA-Z]:/.test(n) && n.split('/').every((s) => s !== '' && s !== '..' && s !== '.' && !s.startsWith('.'));
}

export function loadProject(root: string): LoadedProject {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return { errors: [`${CONFIG_FILE} not found in ${root}`] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { errors: [`${CONFIG_FILE} is not valid JSON: ${(e as Error).message}`] };
  }
  const validate = projectValidator();
  if (!validate(raw)) return { errors: firstErrors(validate, 5).map((m) => `${CONFIG_FILE}: ${m}`) };
  const config = raw as ProjectConfig;
  const errors: string[] = [];
  const seen = new Set<string>();
  const paths = config.entryPoints.map((e) => normalize(e.path));
  for (const p of paths) {
    if (!isSafeEntryPath(p)) errors.push(`${CONFIG_FILE}: entry point "${p}" must be a relative directory without ".." or dot segments`);
    else if (!existsSync(join(root, p)) || !statSync(join(root, p)).isDirectory()) errors.push(`${CONFIG_FILE}: entry point "${p}" is not a directory`);
    else if (!existsSync(join(root, p, 'README.md'))) errors.push(`${CONFIG_FILE}: entry point "${p}" has no README.md`);
    if (seen.has(p)) errors.push(`${CONFIG_FILE}: entry point "${p}" is listed twice`);
    seen.add(p);
  }
  for (const a of paths) for (const b of paths) if (a !== b && b.startsWith(`${a}/`)) errors.push(`${CONFIG_FILE}: entry point "${b}" is inside entry point "${a}"`);
  return { config: { ...config, entryPoints: config.entryPoints.map((e) => ({ ...e, path: normalize(e.path) })) }, errors };
}

export function projectInfo(c: ProjectConfig): ProjectInfo {
  return { name: c.project.name, description: c.project.description ?? '', language: c.project.language ?? 'en', homepage: c.project.homepage, entryPoints: c.entryPoints };
}
