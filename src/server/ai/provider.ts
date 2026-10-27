// The provider interface keeps the server independent of one vendor.

import type { Heading, Question } from '../../shared/types';
import { findDashes } from '../../shared/text';

export interface QuestionRequest {
  title: string;
  markdown: string;
  existing: Question[];
  count: number;
}

export interface AIProvider {
  readonly name: string;
  /** Returns the raw model text. The caller parses and validates it. */
  complete(system: string, user: string): Promise<string>;
}

export const QUESTION_SYSTEM_PROMPT = [
  'You write study questions for a personal knowledge base.',
  'Use only facts that appear in the note you are given. Do not add outside facts, numbers or sources.',
  'Write in plain English. Use hyphens only, never long dashes. No exclamation marks and no emojis.',
  'Return a JSON array and nothing else. Each item has these keys:',
  '"type" (one of recall, explain, apply, compare), "q" (the question), "a" (a short answer, one to three sentences),',
  'optional "hint" (one short sentence) and optional "anchor" (the slug of the heading the question comes from, for example "#core-concepts").',
  'Mix the types. Do not repeat the questions listed as existing.',
].join('\n');

export function buildQuestionPrompt(req: QuestionRequest): string {
  const existing = req.existing.length ? req.existing.map((q) => `- ${q.q}`).join('\n') : '(none)';
  return [`Note title: ${req.title}`, `Number of questions to write: ${req.count}`, 'Existing questions:', existing, '', 'Note text:', req.markdown].join('\n');
}

const TYPES = new Set(['recall', 'explain', 'apply', 'compare']);

function clean(text: string): string {
  return text.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Parse the model output into questions. Invalid items are dropped, never repaired silently into something else. */
export function parseQuestions(raw: string, headings: Heading[], existing: Question[], count: number, now = Date.now()): Question[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('The model did not return a JSON array.');
  const data: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(data)) throw new Error('The model output is not an array.');

  const slugs = new Set(headings.map((h) => h.slug));
  const seen = new Set(existing.map((q) => q.q.toLowerCase()));
  const stamp = now.toString(36);
  const out: Question[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.q !== 'string' || typeof r.a !== 'string' || typeof r.type !== 'string' || !TYPES.has(r.type)) continue;
    const q = clean(r.q);
    const a = clean(r.a);
    if (!q || !a || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    const question: Question = { id: `ai-${stamp}-${out.length + 1}`, type: r.type as Question['type'], q, a, origin: 'ai', reviewed: false };
    if (typeof r.hint === 'string' && clean(r.hint)) question.hint = clean(r.hint);
    if (typeof r.anchor === 'string') {
      const anchor = r.anchor.startsWith('#') ? r.anchor : `#${r.anchor}`;
      if (slugs.has(anchor.slice(1))) question.anchor = anchor;
    }
    if (findDashes(`${q} ${a}`).length === 0) out.push(question);
    if (out.length >= count) break;
  }
  return out;
}
