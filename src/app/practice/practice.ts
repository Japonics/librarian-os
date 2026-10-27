// Retrieval practice with Leitner boxes. Progress lives in localStorage, never in the repository.

import type { LibNode, Question } from '../../shared/types';
import { h, plural } from '../dom';
import { navigate } from '../router';
import { descendantNotes, noteUrl, state, url } from '../state';
import { readJson, writeJson } from '../store/storage';

interface Card { key: string; node: LibNode; q: Question }
interface Progress { box: number; due: number }

const KEY = 'librarian.practice.v1';
/** Progress is kept per repository, so two libraries never share card state. */
const progressKey = (): string => `${KEY}.${state.repoId}`;
const DAY = 86_400_000;
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
let includeUnreviewed = false;

export function allCards(): Card[] {
  return state.nodes.flatMap((node) => node.questions.map((q) => ({ key: `${node.id}:${q.id}`, node, q })));
}

export function nextBox(box: number, rating: 'again' | 'good' | 'easy'): number {
  if (rating === 'again') return 1;
  return Math.min(INTERVAL_DAYS.length - 1, box + (rating === 'easy' ? 2 : 1));
}

export function dueAt(now: number, box: number): number {
  return now + (INTERVAL_DAYS[box] ?? 0) * DAY;
}

function inScope(c: Card, scope: string): boolean {
  if (!includeUnreviewed && c.q.origin === 'ai' && c.q.reviewed === false) return false;
  if (scope === 'all') return true;
  const [kind, id = ''] = scope.split(':');
  if (kind === 'note') return c.node.id === id;
  if (kind === 'field') {
    const root = state.byId.get(id);
    return root ? c.node.id === root.id || descendantNotes(root).some((n) => n.id === c.node.id) : false;
  }
  return true;
}

export function showPractice(main: HTMLElement, scope: string): () => void {
  document.title = `Practice - ${state.project.name}`;
  const progress = readJson<Record<string, Progress>>(progressKey(), {});
  const cards = allCards().filter((c) => inScope(c, scope));
  const now = Date.now();
  let queue = cards.filter((c) => (progress[c.key]?.due ?? 0) <= now).sort((a, b) => (progress[a.key]?.due ?? 0) - (progress[b.key]?.due ?? 0));
  let revealed = false;
  let done = 0;
  const total = queue.length;

  const sources = state.nodes.filter((n) => n.questions.length > 0);
  const scopeSelect = h('select', { 'aria-label': 'Practice scope' },
    h('option', { value: 'all', selected: scope === 'all' }, `All notes (${plural(allCards().length, 'question')})`),
    ...sources.map((n) => h('option', { value: `note:${n.id}`, selected: scope === `note:${n.id}` }, `${n.title} (${n.questions.length})`)));
  scopeSelect.addEventListener('change', () => navigate(url.practice(scopeSelect.value)));
  const unreviewed = h('input', { type: 'checkbox', checked: includeUnreviewed });
  unreviewed.addEventListener('change', () => { includeUnreviewed = unreviewed.checked; navigate(url.practice(scope), true); showPractice(main, scope); });

  const body = h('div');
  const draw = (): void => {
    body.replaceChildren();
    const card = queue[0];
    if (!card) {
      body.append(h('div', { class: 'card-q' }, h('div', { class: 'q' }, cards.length === 0 ? 'No questions here yet.' : 'You are caught up.'),
        h('p', { class: 'hint' }, cards.length === 0 ? 'Questions come from the "questions" list in the sidecar file of a note, or from the generator when AI is enabled.' : `You reviewed ${plural(done, 'question')} in this session.`),
        cards.length > 0 && h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { queue = [...cards]; done = 0; revealed = false; draw(); } }, 'Practice all again'))));
    } else {
      const rate = (rating: 'again' | 'good' | 'easy'): void => {
        const box = nextBox(progress[card.key]?.box ?? 0, rating);
        progress[card.key] = { box, due: dueAt(Date.now(), box) };
        writeJson(progressKey(), progress);
        queue.shift();
        if (rating === 'again') queue.push(card);
        else done++;
        revealed = false;
        draw();
      };
      body.append(h('div', { class: 'card-q' },
        h('div', { class: 'meta' }, h('a', { href: noteUrl(card.node.id) }, card.node.title), h('span', null, `${card.q.type}${card.q.origin === 'ai' ? ' - AI' : ''} - box ${progress[card.key]?.box ?? 0} - ${done}/${total + (queue.length - Math.max(0, total - done))}`)),
        h('div', { class: 'q' }, card.q.q),
        card.q.hint && !revealed && h('div', { class: 'hint' }, `Hint: ${card.q.hint}`),
        revealed && h('div', { class: 'a' }, card.q.a),
        revealed
          ? h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => rate('again') }, 'Again (1)'), h('button', { class: 'btn primary', type: 'button', onclick: () => rate('good') }, 'Good (2)'), h('button', { class: 'btn', type: 'button', onclick: () => rate('easy') }, 'Easy (3)'))
          : h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { revealed = true; draw(); } }, 'Show answer (Space)'))));
    }
    const boxes = INTERVAL_DAYS.map((d, i) => ({ i, d, n: cards.filter((c) => (progress[c.key]?.box ?? 0) === i).length }));
    body.append(h('div', { class: 'boxes', 'aria-label': 'Boxes' }, ...boxes.map((b) => h('div', { class: 'box' }, h('strong', null, b.n), b.i === 0 ? 'new' : `${b.d} d`))));
  };

  main.replaceChildren(h('div', { class: 'practice' }, h('h1', null, 'Practice'),
    h('p', { class: 'lead' }, 'Answer from memory, then check. Cards you miss come back in this session, and the others return after a longer gap.'),
    h('div', { class: 'scope' }, scopeSelect, h('label', { class: 'chip' }, unreviewed, ' include unreviewed AI questions')), body));
  draw();
  main.scrollTop = 0;

  const onKey = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement).closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const buttons = body.querySelectorAll<HTMLButtonElement>('.actions .btn');
    if ((e.key === ' ' || e.key === 'Enter') && !revealed) { e.preventDefault(); buttons[0]?.click(); }
    else if (revealed && ['1', '2', '3'].includes(e.key)) buttons[Number(e.key) - 1]?.click();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
