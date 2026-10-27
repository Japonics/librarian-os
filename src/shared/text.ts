// Pure Markdown helpers. They look at the text only, never at the file system,
// so the command line tools, the server and the browser can all use them.

import type { Heading } from './types';

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;
const FENCE = /^\s*(```|~~~)/;

/** Remove inline Markdown so a heading can be compared and slugged. */
export function stripInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .trim();
}

/** GitHub style heading anchor: lowercase, punctuation removed, spaces become hyphens. */
export function slugify(text: string): string {
  return stripInline(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Lines of a Markdown file outside fenced code blocks, with their 1-based line numbers. */
export function proseLines(markdown: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let inFence = false;
  markdown.split(/\r?\n/).forEach((text, i) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
      return;
    }
    if (!inFence) out.push({ line: i + 1, text });
  });
  return out;
}

export function extractHeadings(markdown: string): Heading[] {
  const seen = new Map<string, number>();
  const headings: Heading[] = [];
  for (const { text } of proseLines(markdown)) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text);
    if (!m) continue;
    const plain = stripInline(m[2] ?? '');
    const base = slugify(plain);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headings.push({ level: (m[1] ?? '#').length, text: plain, slug: count === 0 ? base : `${base}-${count}` });
  }
  return headings;
}

/** The text of the first level-1 heading, or undefined. */
export function extractTitle(markdown: string): string | undefined {
  return extractHeadings(markdown).find((h) => h.level === 1)?.text;
}

export interface MdLink {
  line: number;
  text: string;
  href: string;
}

/** Inline links and images, ignoring code blocks and inline code spans. */
export function extractLinks(markdown: string): MdLink[] {
  const links: MdLink[] = [];
  for (const { line, text } of proseLines(markdown)) {
    const clean = text.replace(/`[^`]*`/g, '');
    for (const m of clean.matchAll(/!?\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ line, text: m[1] ?? '', href: m[2] ?? '' });
    }
  }
  return links;
}

export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/** The first paragraph of the Summary section, or else of the document. */
export function extractSummary(markdown: string, limit = 320): string {
  const lines = proseLines(markdown).map((l) => l.text);
  const start = lines.findIndex((l) => /^##\s+summary\s*$/i.test(l));
  const from = start >= 0 ? start + 1 : lines.findIndex((l) => /^#\s/.test(l)) + 1;
  const para: string[] = [];
  for (const raw of lines.slice(from)) {
    const l = raw.trim();
    if (l === '') {
      if (para.length) break;
      continue;
    }
    if (/^#{1,6}\s/.test(l)) {
      if (para.length) break;
      continue;
    }
    if (/^(```|~~~|\||- |\* |\d+\. |>)/.test(l) && !para.length) continue;
    para.push(l);
  }
  const text = stripInline(para.join(' ')).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}...` : text;
}

/** Rough plain text for full text search and word counts. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ' ')
    .replace(/[`*_>|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countTodoLines(markdown: string): number {
  return markdown.split(/\r?\n/).filter((l) => /^TODO:/.test(l)).length;
}

/** Positions of em and en dashes (GUIDELINE section 7.2). Escapes keep this file free of the characters. */
export function findDashes(text: string): { line: number; column: number; char: string }[] {
  const found: { line: number; column: number; char: string }[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(/[\u2013\u2014]/g)) {
      found.push({ line: i + 1, column: (m.index ?? 0) + 1, char: m[0] === '\u2014' ? 'em dash' : 'en dash' });
    }
  });
  return found;
}
