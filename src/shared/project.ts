// The librarian-os.json standard, version 1. See INSTRUCTIONS.md.

export const CONFIG_FILE = 'librarian-os.json';

export interface EntryPoint {
  /** Directory of the entry point, relative to the repository root, with forward slashes. Must hold a README.md. */
  path: string;
  /** Overrides the title that comes from the README heading. */
  title?: string;
  /** Overrides the description that comes from the README summary. */
  description?: string;
}

export interface ProjectConfig {
  $schema?: string;
  version: 1;
  project: { name: string; description?: string; language?: string; homepage?: string };
  entryPoints: EntryPoint[];
  /** Directory names or repository relative paths that are skipped inside the entry points. */
  ignore?: string[];
  toc?: { file?: string; check?: boolean; descriptions?: Record<string, string> };
  rules?: { requireSidecars?: boolean; noLongDashes?: boolean };
}

export interface ResolvedRules {
  tocFile: string;
  tocCheck: boolean;
  requireSidecars: boolean;
  noLongDashes: boolean;
}

export function resolveRules(c: ProjectConfig): ResolvedRules {
  return {
    tocFile: c.toc?.file ?? 'ToC.md',
    tocCheck: c.toc?.check ?? false,
    requireSidecars: c.rules?.requireSidecars ?? false,
    noLongDashes: c.rules?.noLongDashes ?? false,
  };
}
