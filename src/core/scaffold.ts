import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Sidecar } from '../shared/types';
import { defaultId, describePath, readMdFiles } from './library';
import { loadProject } from './project';
import type { ProjectConfig } from '../shared/project';

export function makeSidecar(path: string, config: ProjectConfig): Sidecar {
  const { expectedKind } = describePath(path, config);
  return { node: { id: defaultId(path, config), kind: expectedKind, status: 'draft' }, links: [] };
}

/** Create the sidecars that are missing inside the entry points. Returns the created paths. */
export function scaffold(root: string, dryRun = false): string[] {
  const { config, errors } = loadProject(root);
  if (!config) throw new Error(errors.join('\n'));
  const created: string[] = [];
  for (const f of readMdFiles(root, config)) {
    if (f.sidecarRaw !== undefined) continue;
    created.push(f.sidecarPath);
    if (dryRun) continue;
    const abs = join(root, f.sidecarPath);
    if (!existsSync(dirname(abs))) mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(makeSidecar(f.path, config), null, 2)}\n`);
  }
  return created;
}
