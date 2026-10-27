// Types shared by the command line tools, the server and the browser app.

export const NODE_KINDS = ['note', 'index'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const REL_TYPES = ['prerequisite', 'extends', 'related', 'contrasts', 'example-of', 'applies', 'part-of'] as const;
export type RelType = (typeof REL_TYPES)[number];

// How a relation reads from the target's side (GUIDELINE section 3.5).
export const REL_INVERSE_LABEL: Record<RelType, string> = {
  prerequisite: 'Required by',
  extends: 'Extended by',
  related: 'Related',
  contrasts: 'Contrasts',
  'example-of': 'Examples',
  applies: 'Applied in',
  'part-of': 'Parts',
};

export const REL_LABEL: Record<RelType, string> = {
  prerequisite: 'Read first',
  extends: 'Builds on',
  related: 'Related',
  contrasts: 'Contrasts with',
  'example-of': 'Example of',
  applies: 'Applies',
  'part-of': 'Part of',
};

export interface Link {
  to: string;
  rel: RelType;
  note?: string;
}

export interface Source {
  key: string;
  type: 'paper' | 'book' | 'report' | 'standard' | 'documentation' | 'website' | 'course' | 'other';
  authors?: string[];
  year?: number;
  title: string;
  publisher?: string;
  url?: string;
  verified?: boolean;
  checked?: string;
}

export interface Concept {
  term: string;
  anchor?: string;
  definition?: string;
}

export interface Question {
  id: string;
  type: 'recall' | 'explain' | 'apply' | 'compare';
  q: string;
  a: string;
  hint?: string;
  anchor?: string;
  origin?: 'author' | 'ai';
  reviewed?: boolean;
}

// The content of a <file>.md.json sidecar.
export interface Sidecar {
  $schema?: string;
  node: {
    id: string;
    kind: NodeKind;
    status?: 'draft' | 'reviewed';
    level?: 'intro' | 'intermediate' | 'advanced';
    order?: number;
    tags?: string[];
    aliases?: string[];
  };
  links?: Link[];
  sources?: Source[];
  concepts?: Concept[];
  questions?: Question[];
  map?: { group?: string };
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

// One note as the reader sees it: sidecar data plus facts derived from the Markdown and the path.
export interface LibNode {
  id: string;
  kind: NodeKind;
  /** Repository relative path of the Markdown file, with forward slashes. */
  path: string;
  title: string;
  /** The entry point (path from librarian-os.json) that the note belongs to. */
  domain: string;
  field?: string;
  parent?: string;
  status: 'draft' | 'reviewed';
  level?: 'intro' | 'intermediate' | 'advanced';
  order?: number;
  tags: string[];
  aliases: string[];
  group?: string;
  summary: string;
  headings: Heading[];
  links: Link[];
  sources: Source[];
  concepts: Concept[];
  questions: Question[];
  /** True for an index node whose subtree has no note yet. */
  planned: boolean;
  todoCount: number;
  words: number;
}

/** What the browser needs to know about a repository's librarian-os.json. */
export interface ProjectInfo {
  name: string;
  description: string;
  language: string;
  homepage?: string;
  entryPoints: { path: string; title?: string; description?: string }[];
}

export interface LibraryIndex {
  generatedAt: string;
  project: ProjectInfo;
  nodes: LibNode[];
  /** Plain text of each note for full text search, keyed by node id. */
  text: Record<string, string>;
}

export interface NoteResponse {
  node: LibNode;
  markdown: string;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** Name of the environment variable that holds the key. The key itself never leaves the server. */
  apiKeyEnv: string;
  keyPresent: boolean;
  models: ModelInfo[];
}

export interface RepoInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  source: 'local' | 'git';
  url?: string;
  /** True when the directory is a git working copy, so "pull" is possible. */
  canPull: boolean;
  /** False when the directory is missing or its librarian-os.json is invalid. */
  ok: boolean;
  error?: string;
}

export interface RefreshResult {
  repo: RepoInfo;
  /** A git pull was run. */
  pulled: boolean;
  /** The pull moved HEAD, so there is new content. */
  changed: boolean;
  from?: string;
  to?: string;
  /** Set when the pull failed or was skipped. The content on disk was still reloaded. */
  warning?: string;
}

export interface AppInfo {
  version: string;
  git: { pullOnSwitch: boolean };
  configPath: string;
  ai: { enabled: boolean; default: { provider: string; model: string }; maxQuestions: number; providers: ProviderInfo[] };
  repos: RepoInfo[];
}
